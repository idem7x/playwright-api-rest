import 'dotenv/config';
import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import { loadRequirementFile } from './requirements';
import { validateProposal, type Proposal, type ProposalCase } from './schema';
import { assertClaudeAvailable, DEFAULT_MODEL, runClaude } from './lib/claude';
import { applyFixtureEdits, loadFixture } from './lib/mock';
import { renderPrompt } from './lib/prompt';
import { AI_WRITABLE, applyHeaders, newChangesOutsideAllowed, notRunReport, runSpecs, staticChecks, summaryTable } from './lib/pipeline';
import { changedLineCount, parseSpec } from './lib/spec';
import {
  loadProposal,
  prBodyFile,
  proposalFile,
  proposalIdFromBranch,
  readJson,
  snapshotSpecs,
  specFilesOf,
  writeJson,
} from './lib/store';
import { writePrBody } from './render-pr';
import { changedPaths, fail, info, isMain, sh, stepOutput, stepSummary } from './lib/cli';

const USAGE = `Usage: npm run ai:revise -- --proposal <id> --instruction "<text>" [--by <user>] [--no-run]
                               [--mock [--fixture <file>]] [--finalize] [--body-file <current PR body>]
  --finalize  the edits were already made (e.g. by claude-code-action in CI): only validate, record the
              revision, snapshot, run and re-render.`;

export const DEFAULT_REVISE_FIXTURE = 'scripts/ai-hitl/__fixtures__/revise-posts.json';

/** Cases whose code or reviewable metadata differ between two versions → their decision is reset. */
export function changedCases(
  oldProposal: Proposal,
  newProposal: Proposal,
  oldSpecs: Map<string, string>,
  newSpecs: Map<string, string>,
): string[] {
  const segs = (specs: Map<string, string>) => {
    const m = new Map<string, string>();
    for (const src of specs.values()) for (const t of parseSpec(src)) if (t.caseId) m.set(t.caseId, t.segment);
    return m;
  };
  const before = segs(oldSpecs);
  const after = segs(newSpecs);
  const meta = (c: ProposalCase) => JSON.stringify([c.title, [...c.covers].sort(), c.priority, c.automate, c.specFile ?? null]);

  return newProposal.cases
    .filter(c => {
      const old = oldProposal.cases.find(o => o.caseId === c.caseId);
      if (!old) return true;
      if (meta(old) !== meta(c)) return true;
      const a = before.get(c.caseId);
      const b = after.get(c.caseId);
      if (a === undefined || b === undefined) return a !== b;
      return changedLineCount(a, b) > 0;
    })
    .map(c => c.caseId);
}

function readSpecs(proposal: Proposal, fromHead: boolean): Map<string, string> {
  const map = new Map<string, string>();
  for (const spec of specFilesOf(proposal)) {
    if (fromHead) {
      const res = sh('git', ['show', `HEAD:${spec}`]);
      if (res.code === 0) map.set(spec, res.stdout);
    } else if (fs.existsSync(spec)) {
      map.set(spec, fs.readFileSync(spec, 'utf-8'));
    }
  }
  return map;
}

function gitUser(): string {
  const r = sh('git', ['config', 'user.name']);
  return r.code === 0 && r.stdout.trim() ? r.stdout.trim() : 'local';
}

export function main(): void {
  const { values } = parseArgs({
    options: {
      proposal: { type: 'string' },
      branch: { type: 'string' },
      instruction: { type: 'string' },
      by: { type: 'string' },
      'no-run': { type: 'boolean', default: false },
      mock: { type: 'boolean', default: false },
      fixture: { type: 'string', default: DEFAULT_REVISE_FIXTURE },
      finalize: { type: 'boolean', default: false },
      'body-file': { type: 'string' },
      model: { type: 'string' },
      'max-turns': { type: 'string', default: '20' },
    },
  });
  const id = values.proposal ?? (values.branch ? proposalIdFromBranch(values.branch) : undefined);
  if (!id || !values.instruction) {
    console.error(USAGE);
    process.exit(2);
  }
  const instruction = values.instruction.trim();
  const by = values.by ?? process.env.GITHUB_ACTOR ?? gitUser();
  const finalize = values.finalize ?? false;
  const fixture = values.mock ? loadFixture(values.fixture as string) : undefined;
  const model = values.model ?? process.env.AI_MODEL ?? DEFAULT_MODEL;

  // state before the revision (in --finalize mode the working tree already contains the edits → use HEAD)
  const oldProposal: Proposal = finalize
    ? (JSON.parse(sh('git', ['show', `HEAD:${proposalFile(id)}`]).stdout) as Proposal)
    : loadProposal(id);
  const req = loadRequirementFile(oldProposal.requirementFile);
  const oldSpecs = readSpecs(oldProposal, finalize);
  const bodyFile = values['body-file'] ?? prBodyFile(id);
  const previousBody = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, 'utf-8') : undefined;
  // in --finalize mode the edits are already in the tree: every change counts
  const before = finalize ? new Set<string>() : changedPaths();

  info(`revising ${id}: "${instruction}" (by ${by})${fixture ? ' [mock]' : finalize ? ' [finalize]' : ''}`);
  let sessionId: string | undefined;
  const writable = [...AI_WRITABLE, proposalFile(id)];

  if (fixture) {
    applyFixtureEdits(fixture);
    const current = readJson<Proposal>(proposalFile(id));
    for (const [caseId, patch] of Object.entries(fixture.casePatches ?? {})) {
      const c = current.cases.find(x => x.caseId === caseId);
      if (!c) throw new Error(`mock casePatches: ${caseId} not in proposal`);
      Object.assign(c, patch);
    }
    writeJson(proposalFile(id), current);
  } else if (!finalize) {
    try {
      assertClaudeAvailable();
    } catch (e) {
      fail((e as Error).message);
    }
    const prompt = renderPrompt('revise', {
      PROPOSAL_ID: id,
      REQUIREMENT_FILE: oldProposal.requirementFile,
      SPEC_FILES: specFilesOf(oldProposal).map(s => `\`${s}\``).join(', '),
      INSTRUCTION: instruction.replace(/\n/g, '\n> '),
    });
    const maxTurns = Number(values['max-turns']);
    const res = runClaude({ prompt, model, maxTurns, writablePaths: writable });
    sessionId = res.session_id;
    info(`claude: ${String(res.result ?? '').slice(0, 500)}`);
  }

  const outside = newChangesOutsideAllowed(before);
  if (outside.length) fail(`The revision changed files outside the allowed paths:\n  - ${outside.join('\n  - ')}`);

  // the script owns id/createdAt/requirementFile/model/revisions
  const load = () => {
    const raw = readJson<Record<string, unknown>>(proposalFile(id));
    return validateProposal(
      {
        ...raw,
        id,
        createdAt: oldProposal.createdAt,
        requirementFile: oldProposal.requirementFile,
        model: oldProposal.model,
        revisions: [...oldProposal.revisions, { at: new Date().toISOString(), by, instruction }],
      },
      req,
    );
  };
  let validation = load();
  let problems = validation.ok ? (applyHeaders(validation.proposal), staticChecks(validation.proposal)) : validation.errors;
  if (problems.length && sessionId) {
    info(`revision has problems, one fix attempt:\n${problems.join('\n')}`);
    runClaude({
      prompt: renderPrompt('fix', {
        EXTRA_PATHS: `, \`${proposalFile(id)}\``,
        PROBLEMS: problems.join('\n'),
        ANSWER_FORMAT: 'Answer with a one-line summary of the fix.',
      }),
      model,
      maxTurns: 15,
      writablePaths: writable,
      resume: sessionId,
    });
    validation = load();
    problems = validation.ok ? (applyHeaders(validation.proposal), staticChecks(validation.proposal)) : validation.errors;
  }
  if (!validation.ok || problems.length) fail(`Revision does not pass the checks:\n${problems.join('\n')}`);
  const proposal = validation.proposal;

  const changed = changedCases(oldProposal, proposal, oldSpecs, readSpecs(proposal, false));
  writeJson(proposalFile(id), proposal);
  snapshotSpecs(proposal);

  const run = values['no-run'] || !process.env.GO_REST_API_TOKEN
    ? notRunReport(proposal, values['no-run'] ? 'skipped (--no-run)' : 'skipped (no GO_REST_API_TOKEN)')
    : runSpecs(proposal);
  const out = writePrBody(proposal, { previousBody, changedCases: changed });

  console.log(`\n${summaryTable(proposal, run)}\n`);
  console.log(`changed cases (decisions reset): ${changed.join(', ') || 'none'}`);
  console.log(`PR body: ${out}`);
  stepOutput('changed-cases', changed.join(','));
  stepSummary(`### Revision of \`${id}\`\n\n> ${instruction}\n\nChanged cases: ${changed.join(', ') || 'none'}`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (e) {
    fail((e as Error).stack ?? String(e));
  }
}
