import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs } from 'node:util';
import type { Proposal } from './schema';
import type { RequirementFile } from './requirements';
import { loadAllRequirements, loadRequirementFile } from './requirements';
import { decisionOf, parseBody } from './lib/decisions';
import { checkAiSpec, parseSpec } from './lib/spec';
import { loadProposal, proposalIdFromBranch } from './lib/store';
import { isMain, stepSummary } from './lib/cli';

export interface GateInput {
  body: string;
  proposal: Proposal;
  requirements: RequirementFile;
  /** all spec files under tests/ai/ */
  specs: Array<{ file: string; source: string }>;
  /** every requirement id that exists in requirements/*.md (for validating @req tags) */
  knownRequirementIds?: Set<string>;
}

export interface GateResult {
  ok: boolean;
  problems: string[];
}

export function runGate(input: GateInput): GateResult {
  const { body, proposal, requirements, specs } = input;
  const problems: string[] = [];
  const parsed = parseBody(body);

  if (parsed.proposalId && parsed.proposalId !== proposal.id) {
    problems.push(`PR body belongs to proposal ${parsed.proposalId}, but the gate was run for ${proposal.id}`);
  }

  // 1. exactly one decision per case, reject needs a reason
  const rejected = new Set<string>();
  for (const c of proposal.cases) {
    const d = parsed.decisions.get(c.caseId);
    if (!d) {
      problems.push(`${c.caseId}: decision block is missing from the PR body (re-render it with npm run ai:render)`);
      continue;
    }
    if (d.checked.length === 0) problems.push(`${c.caseId}: no decision — tick one of accept / edit / reject`);
    if (d.checked.length > 1) problems.push(`${c.caseId}: ${d.checked.length} boxes ticked (${d.checked.join(', ')}) — tick exactly one`);
    if (decisionOf(d) === 'reject') {
      rejected.add(c.caseId);
      if (!d.reason) problems.push(`${c.caseId}: rejected without a reason — write it after "reason:"`);
    }
  }
  for (const id of parsed.decisions.keys()) {
    if (!proposal.cases.some(c => c.caseId === id)) problems.push(`${id}: decision block for a case that is not in the proposal`);
  }

  // 2. every requirement covered by a non-rejected case, or listed as a gap (proposal or human-added in the body)
  const gaps = new Set([...proposal.coverageGaps.map(g => g.requirementId), ...parsed.gaps.map(g => g.requirementId)]);
  for (const g of parsed.gaps) {
    if (!g.reason) problems.push(`coverage gap ${g.requirementId}: reason is empty`);
  }
  for (const item of requirements.items) {
    const live = proposal.cases.filter(c => c.covers.includes(item.id) && !rejected.has(c.caseId));
    if (live.length === 0 && !gaps.has(item.id)) {
      const why = proposal.cases.some(c => c.covers.includes(item.id)) ? 'all its cases are rejected' : 'no case covers it';
      problems.push(`${item.id}: not covered (${why}) — keep a case or add "- **${item.id}** — <reason>" to Coverage gaps`);
    }
  }

  // 3. tag rules for every generated spec, rejected cases must be gone, kept automated cases must exist
  const known = input.knownRequirementIds ?? new Set(requirements.items.map(i => i.id));
  const presentCases = new Map<string, string>();
  for (const { file, source } of specs) {
    for (const p of checkAiSpec(file, source)) problems.push(`${p.file}:${p.line}: ${p.message}`);
    for (const t of parseSpec(source)) {
      for (const id of t.reqIds) {
        if (!known.has(id)) problems.push(`${file}:${t.line}: test "${t.title}" references unknown requirement @req:${id}`);
      }
      if (t.caseId) presentCases.set(t.caseId, file);
    }
  }
  for (const c of proposal.cases) {
    const decision = decisionOf(parsed.decisions.get(c.caseId));
    if (decision === 'reject' && presentCases.has(c.caseId)) {
      problems.push(`${c.caseId}: rejected, but its test is still in ${presentCases.get(c.caseId)} — delete it or change the decision`);
    }
    if (c.automate && (decision === 'accept' || decision === 'edit') && !presentCases.has(c.caseId)) {
      problems.push(`${c.caseId}: marked "${decision}", but no test tagged @case:${c.caseId} exists in tests/ai/`);
    }
  }

  return { ok: problems.length === 0, problems };
}

export function readAiSpecs(dir = 'tests/ai'): Array<{ file: string; source: string }> {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.spec.ts'))
    .sort()
    .map(f => {
      const file = path.posix.join(dir, f);
      return { file, source: fs.readFileSync(file, 'utf-8') };
    });
}

// npm run ai:gate -- --body-file <path> (--proposal <id> | --branch ai/<id>)
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { 'body-file': { type: 'string' }, proposal: { type: 'string' }, branch: { type: 'string' } },
  });
  const id = values.proposal ?? (values.branch ? proposalIdFromBranch(values.branch) : undefined);
  if (!values['body-file'] || !id) {
    console.error('Usage: npm run ai:gate -- --body-file <path> --proposal <id>   (or --branch ai/<id>)');
    process.exit(2);
  }
  const proposal = loadProposal(id);
  const result = runGate({
    body: fs.readFileSync(values['body-file'], 'utf-8'),
    proposal,
    requirements: loadRequirementFile(proposal.requirementFile),
    specs: readAiSpecs(),
    knownRequirementIds: new Set(loadAllRequirements().flatMap(r => r.items.map(i => i.id))),
  });

  if (result.ok) {
    console.log(`✔ ai-gate passed for ${id}: every case has a human decision and every requirement is covered or a gap.`);
    stepSummary(`### ✅ ai-gate passed for \`${id}\``);
  } else {
    console.error(`✖ ai-gate failed for ${id} — ${result.problems.length} problem(s):\n`);
    for (const p of result.problems) console.error(`  - ${p}`);
    stepSummary(`### ❌ ai-gate failed for \`${id}\`\n\n${result.problems.map(p => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
}
