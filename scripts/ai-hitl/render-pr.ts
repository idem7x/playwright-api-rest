import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { Proposal } from './schema';
import type { RequirementFile } from './requirements';
import { loadRequirementFile } from './requirements';
import type { RunStatus } from './lib/results';
import {
  CHECKLIST_END,
  CHECKLIST_START,
  GAPS_END,
  GAPS_START,
  parseBody,
  type ParsedBody,
} from './lib/decisions';
import { loadProposal, prBodyFile, readJson, runFile, writeText } from './lib/store';
import { isMain } from './lib/cli';

export interface CaseRun {
  status: RunStatus;
  error?: string;
  durationMs?: number;
}

export interface RunReport {
  proposalId: string;
  ranAt: string | null;
  command: string | null;
  exitCode: number | null;
  cases: Record<string, CaseRun>;
}

export const REVIEWER_CHECKLIST = [
  'Uses `ApiBuilder` via the `api` fixture (no raw `request.post(...)`)',
  'Responses validated with `shouldMatchSchema(Schema.X)` where a body is returned',
  'Created data is cleaned up in `afterEach`',
  'Assertions are meaningful (status + body content, not just "defined")',
  'No duplication with existing tests in `tests/`',
  'No sleeps, no hard-coded ids of shared GoREST data',
];

const STATUS_ICON: Record<RunStatus, string> = {
  passed: '✅ passed',
  failed: '❌ failed',
  flaky: '🟡 flaky',
  skipped: '⏭️ skipped',
  'not-run': '⚪ not run',
  'not-automated': '📝 manual',
};

export function statusLabel(run?: CaseRun): string {
  if (!run) return STATUS_ICON['not-run'];
  const time = run.durationMs ? ` (${Math.round(run.durationMs)} ms)` : '';
  return `${STATUS_ICON[run.status]}${time}`;
}

export interface RenderOptions {
  run?: RunReport;
  /** body of the PR as it is now — decisions/gaps/checklist are carried over */
  previousBody?: string;
  /** cases whose decision must be reset (changed by a revision) */
  changedCases?: Iterable<string>;
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function renderPrBody(proposal: Proposal, req: RequirementFile, opts: RenderOptions = {}): string {
  const prev: ParsedBody | undefined = opts.previousBody ? parseBody(opts.previousBody) : undefined;
  const changed = new Set(opts.changedCases ?? []);
  const runOf = (caseId: string): CaseRun | undefined => {
    const c = proposal.cases.find(x => x.caseId === caseId);
    if (c && !c.automate) return { status: 'not-automated' };
    return opts.run?.cases[caseId];
  };

  const runs = proposal.cases.map(c => runOf(c.caseId)?.status ?? 'not-run');
  const count = (s: RunStatus) => runs.filter(r => r === s).length;
  const runSummary = (['passed', 'failed', 'flaky', 'skipped', 'not-run', 'not-automated'] as RunStatus[])
    .filter(s => count(s) > 0)
    .map(s => `${count(s)} ${STATUS_ICON[s].split(' ').slice(1).join(' ')}`)
    .join(' · ');

  const humanGaps = (prev?.gaps ?? []).filter(g => !proposal.coverageGaps.some(p => p.requirementId === g.requirementId));
  const allGaps = [...proposal.coverageGaps, ...humanGaps];

  const out: string[] = [];
  out.push(`<!-- ai-hitl:proposal=${proposal.id} -->`);
  out.push(`## 🤖 AI test proposal \`${proposal.id}\` — needs human review`);
  out.push('');
  out.push('> **AI proposes, a human decides.** Tick exactly one decision per case below. The `ai-gate` check stays red');
  out.push('> until every case has a decision and every requirement is covered or listed as a gap.');
  out.push('');
  out.push('### Summary');
  out.push('');
  out.push('| | |');
  out.push('| --- | --- |');
  out.push(`| Requirement file | \`${proposal.requirementFile}\` (${req.items.length} requirements) |`);
  out.push(`| Model | \`${proposal.model}\` |`);
  out.push(`| Created | ${proposal.createdAt} |`);
  out.push(`| Cases | ${proposal.cases.length} (${proposal.cases.filter(c => c.automate).length} automated) |`);
  out.push(`| Run | ${runSummary || 'not run'}${opts.run?.ranAt ? ` — ${opts.run.ranAt}` : ''} |`);
  out.push(`| Coverage gaps | ${allGaps.length} |`);
  out.push(`| Revisions | ${proposal.revisions.length} |`);
  out.push('');

  out.push('### Traceability');
  out.push('');
  out.push('| Requirement | Priority | Case(s) | Run status |');
  out.push('| --- | --- | --- | --- |');
  for (const item of req.items) {
    const cases = proposal.cases.filter(c => c.covers.includes(item.id));
    const gap = allGaps.find(g => g.requirementId === item.id);
    const caseCell = cases.length > 0 ? cases.map(c => c.caseId).join(', ') : '—';
    const statusCell =
      cases.length > 0
        ? cases.map(c => statusLabel(runOf(c.caseId)).replace(/ \(\d+ ms\)$/, '')).join(', ')
        : gap
          ? '⚠️ coverage gap'
          : '❗ uncovered';
    out.push(`| **${item.id}** ${esc(item.text)} | ${item.priority} | ${caseCell} | ${statusCell} |`);
  }
  out.push('');

  out.push('### Coverage gaps');
  out.push('');
  out.push('Requirements intentionally left without a test. If you reject the only case of a requirement, add a line');
  out.push('here in the same format (`- **POSTS-05** — reason`), otherwise the gate fails.');
  out.push('');
  out.push(GAPS_START);
  for (const g of allGaps) out.push(`- **${g.requirementId}** — ${g.reason}`);
  out.push(GAPS_END);
  out.push('');

  if (proposal.revisions.length > 0) {
    out.push('### Revisions');
    out.push('');
    for (const r of proposal.revisions) out.push(`- ${r.at} by @${r.by.replace(/^@/, '')}: ${esc(r.instruction)}`);
    out.push('');
  }

  out.push('### Decisions');
  out.push('');
  out.push('Tick **exactly one** box per case. `reject` needs a reason after `reason:`.');
  if (changed.size > 0) {
    out.push(`Decisions were reset for cases changed by the last revision: ${[...changed].join(', ')}.`);
  }
  out.push('');
  for (const c of proposal.cases) {
    const keep = prev && !changed.has(c.caseId) ? prev.decisions.get(c.caseId) : undefined;
    const box = (o: 'accept' | 'edit' | 'reject') => (keep?.checked.includes(o) ? 'x' : ' ');
    const run = runOf(c.caseId);
    out.push(`#### ${c.caseId} — ${c.title}`);
    out.push('');
    out.push(
      `**Covers:** ${c.covers.join(', ')} · **Priority:** ${c.priority} · **Confidence:** ${c.confidence} · ` +
        `**Run:** ${statusLabel(run)}${c.specFile ? ` · **Spec:** \`${c.specFile}\`` : ''}`,
    );
    if (run?.error) out.push(`\n> ${esc(run.error)}`);
    out.push('');
    out.push(`**Rationale:** ${c.rationale}`);
    if (c.openQuestions.length > 0) {
      out.push('');
      out.push('**Open questions:**');
      for (const q of c.openQuestions) out.push(`- ${q}`);
    }
    out.push('');
    out.push(`- [${box('accept')}] accept`);
    out.push(`- [${box('edit')}] edit`);
    out.push(`- [${box('reject')}] reject — reason:${keep?.reason ? ` ${keep.reason}` : ''}`);
    out.push('');
  }

  out.push('### Reviewer checklist');
  out.push('');
  out.push(CHECKLIST_START);
  for (const item of REVIEWER_CHECKLIST) out.push(`- [${prev?.checklist.get(item) ? 'x' : ' '}] ${item}`);
  out.push(CHECKLIST_END);
  out.push('');
  out.push('### How to steer');
  out.push('');
  out.push('- Comment `@claude <instruction>` on this PR (repo owner only) — Claude updates the specs and this');
  out.push('  proposal on the same branch; decisions of changed cases are reset.');
  out.push('- `edit`: change the test yourself in this PR, then tick `edit`. `accept` means the code is merged as generated.');
  out.push('- `reject`: delete the test from the spec and give a reason; add a coverage gap if nothing else covers it.');
  out.push('');
  return out.join('\n');
}

export function loadRun(proposalId: string): RunReport | undefined {
  const file = runFile(proposalId);
  return fs.existsSync(file) ? readJson<RunReport>(file) : undefined;
}

/** Render + write ai/proposals/<id>/pr-body.md. */
export function writePrBody(proposal: Proposal, opts: Omit<RenderOptions, 'run'> & { out?: string } = {}): string {
  const req = loadRequirementFile(proposal.requirementFile);
  const body = renderPrBody(proposal, req, { ...opts, run: loadRun(proposal.id) });
  const out = opts.out ?? prBodyFile(proposal.id);
  writeText(out, body);
  return out;
}

// npm run ai:render -- --proposal <id> [--previous-body <file>] [--changed A,B] [--out <file>]
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      proposal: { type: 'string' },
      'previous-body': { type: 'string' },
      changed: { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.proposal) {
    console.error('Usage: npm run ai:render -- --proposal <id> [--previous-body <file>] [--changed A,B] [--out <file>]');
    process.exit(2);
  }
  const proposal = loadProposal(values.proposal);
  const out = writePrBody(proposal, {
    previousBody: values['previous-body'] ? fs.readFileSync(values['previous-body'], 'utf-8') : undefined,
    changedCases: values.changed ? values.changed.split(',').map(s => s.trim()) : [],
    out: values.out,
  });
  console.log(`PR body written to ${out}`);
}
