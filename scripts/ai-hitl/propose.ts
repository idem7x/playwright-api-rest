import 'dotenv/config';
import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { loadRequirementFile } from './requirements';
import { extractJson, validateProposal, type Proposal } from './schema';
import { assertClaudeAvailable, DEFAULT_MODEL, runClaude } from './lib/claude';
import { applyFixtureEdits, loadFixture, mockAnswer } from './lib/mock';
import { conventions, renderPrompt } from './lib/prompt';
import {
  AI_WRITABLE,
  applyHeaders,
  newChangesOutsideAllowed,
  notRunReport,
  runSpecs,
  staticChecks,
  summaryTable,
} from './lib/pipeline';
import { newProposalId, proposalDir, proposalFile, snapshotSpecs, writeJson } from './lib/store';
import { writePrBody } from './render-pr';
import { changedPaths, fail, info, isMain, stepOutput, stepSummary } from './lib/cli';

const USAGE = `Usage: npm run ai:propose -- --req requirements/<resource>.md [--no-run] [--model <m>] [--max-turns <n>]
                                [--mock [--fixture <file>]] [--id <proposal-id>]`;

export const DEFAULT_FIXTURE = 'scripts/ai-hitl/__fixtures__/propose-posts.json';

const PROPOSAL_ANSWER_FORMAT =
  'Then answer again with the complete corrected Proposal JSON object only (no prose, no fences).';

interface Options {
  req: string;
  run: boolean;
  model: string;
  maxTurns: number;
  mock: boolean;
  fixture: string;
  id?: string;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      req: { type: 'string' },
      'no-run': { type: 'boolean', default: false },
      model: { type: 'string' },
      'max-turns': { type: 'string', default: '30' },
      mock: { type: 'boolean', default: false },
      fixture: { type: 'string', default: DEFAULT_FIXTURE },
      id: { type: 'string' },
    },
  });
  if (!values.req) {
    console.error(USAGE);
    process.exit(2);
  }
  const maxTurns = Number(values['max-turns']);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 100) fail('--max-turns must be an integer 1..100');
  return {
    req: values.req,
    run: !values['no-run'],
    model: values.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL,
    maxTurns,
    mock: values.mock ?? false,
    fixture: values.fixture as string,
    id: values.id,
  };
}

/** Fields the script owns — whatever the model wrote there is overwritten. */
function normalize(raw: unknown, base: Pick<Proposal, 'id' | 'requirementFile' | 'model' | 'createdAt'>, specFile: string): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const p = raw as Record<string, unknown>;
  const cases = Array.isArray(p.cases)
    ? p.cases.map(c => {
        const cc = c as Record<string, unknown>;
        return cc.automate === true && !cc.specFile ? { ...cc, specFile } : cc;
      })
    : p.cases;
  return { ...p, ...base, cases, coverageGaps: p.coverageGaps ?? [], revisions: [] };
}

export function main(): void {
  const opts = parseOptions();
  const req = loadRequirementFile(opts.req);
  const requirementFile = opts.req.replace(/^\.\//, '');
  const id = opts.id ?? newProposalId(req.resource);
  const specFile = `tests/ai/${req.resource}.spec.ts`;
  if (fs.existsSync(proposalDir(id))) fail(`${proposalDir(id)} already exists — wait a minute or pass --id`);

  const fixture = opts.mock ? loadFixture(opts.fixture) : undefined;
  const model = fixture ? fixture.model : opts.model;
  if (!fixture) {
    try {
      assertClaudeAvailable();
    } catch (e) {
      fail((e as Error).message);
    }
  }

  info(`proposal ${id} for ${requirementFile} (${req.items.length} requirements), model ${model}${fixture ? ' [mock]' : ''}`);
  const before = changedPaths();
  const base = { id, requirementFile, model, createdAt: new Date().toISOString() };

  // 1. ask the model
  let answer: string;
  let sessionId: string | undefined;
  if (fixture) {
    applyFixtureEdits(fixture);
    answer = mockAnswer(fixture);
  } else {
    const prompt = renderPrompt('propose', {
      PROPOSAL_ID: id,
      REQUIREMENT_FILE: requirementFile,
      RESOURCE_UPPER: req.resource.toUpperCase(),
      SPEC_FILE: specFile,
      MODEL: model,
      CONVENTIONS: conventions(),
      REQUIREMENTS_MD: fs.readFileSync(opts.req, 'utf-8').trim(),
    });
    info(`calling claude (max ${opts.maxTurns} turns)…`);
    const res = runClaude({ prompt, model, maxTurns: opts.maxTurns, writablePaths: AI_WRITABLE });
    answer = res.result ?? '';
    sessionId = res.session_id;
    info(`claude finished: ${res.num_turns ?? '?'} turns, $${res.total_cost_usd?.toFixed(3) ?? '?'}`);
  }

  // 2. validate, one retry with the error message
  const parse = (text: string) => {
    try {
      return validateProposal(normalize(extractJson(text), base, specFile), req);
    } catch (e) {
      return { ok: false as const, errors: [(e as Error).message] };
    }
  };
  let validation = parse(answer);
  if (!validation.ok && !fixture && sessionId) {
    info(`proposal invalid, asking claude to fix it:\n  - ${validation.errors.join('\n  - ')}`);
    const retry = runClaude({
      prompt: renderPrompt('fix', {
        EXTRA_PATHS: '',
        PROBLEMS: validation.errors.join('\n'),
        ANSWER_FORMAT: PROPOSAL_ANSWER_FORMAT,
      }),
      model,
      maxTurns: 10,
      writablePaths: AI_WRITABLE,
      resume: sessionId,
    });
    sessionId = retry.session_id ?? sessionId;
    validation = parse(retry.result ?? '');
  }
  if (!validation.ok) fail(`Proposal JSON is invalid:\n  - ${validation.errors.join('\n  - ')}`);
  const proposal = validation.proposal;

  // 3. guard rails on what the model touched
  const outside = newChangesOutsideAllowed(before);
  if (outside.length) fail(`The model changed files outside tests/ai/, schemas/, constants/:\n  - ${outside.join('\n  - ')}`);
  applyHeaders(proposal);

  // 4. lint + typecheck + tag rules, one fix attempt
  info('running eslint, typecheck and tag checks on generated code…');
  let problems = staticChecks(proposal);
  if (problems.length && !fixture && sessionId) {
    info(`static checks failed, asking claude to fix:\n${problems.join('\n')}`);
    runClaude({
      prompt: renderPrompt('fix', {
        EXTRA_PATHS: '',
        PROBLEMS: problems.join('\n'),
        ANSWER_FORMAT: 'Answer with a one-line summary of the fix. Do not change the proposal cases.',
      }),
      model,
      maxTurns: 15,
      writablePaths: AI_WRITABLE,
      resume: sessionId,
    });
    const outside2 = newChangesOutsideAllowed(before);
    if (outside2.length) fail(`The model changed files outside the allowed paths:\n  - ${outside2.join('\n  - ')}`);
    applyHeaders(proposal);
    problems = staticChecks(proposal);
  }
  if (problems.length) fail(`Generated code does not pass the checks:\n${problems.join('\n')}`);

  // 5. persist proposal + AI snapshot (baseline for metrics)
  writeJson(proposalFile(id), proposal);
  const snap = snapshotSpecs(proposal);
  info(`proposal written to ${proposalFile(id)}, snapshot: ${snap.join(', ')}`);

  // 6. run generated specs only
  let run;
  if (!opts.run) run = notRunReport(proposal, 'skipped (--no-run)');
  else if (!process.env.GO_REST_API_TOKEN) {
    info('GO_REST_API_TOKEN not available — skipping the test run');
    run = notRunReport(proposal, 'skipped (no GO_REST_API_TOKEN)');
  } else {
    info('running generated specs…');
    run = runSpecs(proposal);
  }

  // 7. PR body + summary
  const body = writePrBody(proposal);
  console.log(`\n${summaryTable(proposal, run)}\n`);
  if (proposal.coverageGaps.length) {
    console.log(`coverage gaps: ${proposal.coverageGaps.map(g => `${g.requirementId} (${g.reason})`).join('; ')}`);
  }
  console.log(`PR body: ${body}`);
  stepOutput('proposal-id', id);
  stepOutput('pr-body', body);
  stepSummary(`### AI proposal \`${id}\`\n\n\`\`\`\n${summaryTable(proposal, run)}\n\`\`\``);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (e) {
    fail((e as Error).stack ?? String(e));
  }
}
