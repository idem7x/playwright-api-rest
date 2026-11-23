import * as fs from 'node:fs';
import type { Proposal } from '../schema';
import { checkAiSpec, parseSpec, withAiHeader } from './spec';
import { flattenResults, type PwReport } from './results';
import { RESULTS_JSON, readJson, runFile, specFilesOf, writeJson } from './store';
import type { RunReport } from '../render-pr';
import { changedPaths, sh, table } from './cli';

/** Paths an AI run may touch. Anything else changed during the run aborts it. */
export const AI_WRITABLE = ['tests/ai/**', 'schemas/**', 'constants/**'];
const ALLOWED_PREFIXES = ['tests/ai/', 'schemas/', 'constants/', 'ai/proposals/'];

export function newChangesOutsideAllowed(before: Set<string>): string[] {
  return [...changedPaths()].filter(p => !before.has(p) && !ALLOWED_PREFIXES.some(a => p.startsWith(a)));
}

export function applyHeaders(proposal: Proposal): void {
  for (const spec of specFilesOf(proposal)) {
    if (!fs.existsSync(spec)) continue;
    fs.writeFileSync(spec, withAiHeader(fs.readFileSync(spec, 'utf-8'), proposal.id));
  }
}

/** Static checks of the generated code. Returns human-readable problems (empty = OK). */
export function staticChecks(proposal: Proposal): string[] {
  const problems: string[] = [];
  const specs = specFilesOf(proposal);
  const caseIds = new Set(proposal.cases.map(c => c.caseId));

  for (const spec of specs) {
    if (!fs.existsSync(spec)) {
      problems.push(`${spec}: spec file referenced by the proposal does not exist`);
      continue;
    }
    const src = fs.readFileSync(spec, 'utf-8');
    for (const p of checkAiSpec(spec, src)) problems.push(`${p.file}:${p.line}: ${p.message}`);
    if (/\brequest\.(get|post|put|patch|delete)\(/.test(src)) {
      problems.push(`${spec}: uses raw request.<method>(...) — use the ApiBuilder \`api\` fixture`);
    }
    if (/waitForTimeout|setTimeout\(/.test(src)) problems.push(`${spec}: contains sleeps (waitForTimeout/setTimeout)`);
    const tests = parseSpec(src);
    for (const t of tests) {
      if (t.caseId && !caseIds.has(t.caseId)) problems.push(`${spec}:${t.line}: @case:${t.caseId} is not a case of the proposal`);
    }
    for (const c of proposal.cases.filter(x => x.automate && x.specFile === spec)) {
      const t = tests.find(x => x.caseId === c.caseId);
      if (!t) {
        problems.push(`${spec}: no test tagged @case:${c.caseId} (case is automate=true)`);
        continue;
      }
      const missing = c.covers.filter(id => !t.reqIds.includes(id));
      if (missing.length) problems.push(`${spec}:${t.line}: test for ${c.caseId} lacks tags ${missing.map(m => `@req:${m}`).join(', ')}`);
    }
  }

  const lintTargets = [...specs.filter(s => fs.existsSync(s)), ...[...changedPaths()].filter(p => /^constants\/.*\.ts$/.test(p))];
  if (lintTargets.length) {
    const lint = sh('npx', ['eslint', '--max-warnings=0', ...lintTargets]);
    if (lint.code !== 0) problems.push(`eslint failed:\n${(lint.stdout + lint.stderr).trim()}`);
  }
  const tsc = sh('npx', ['tsc', '--noEmit', '--pretty', 'false']);
  if (tsc.code !== 0) problems.push(`typecheck failed:\n${(tsc.stdout + tsc.stderr).trim()}`);
  return problems;
}

/** Run only the proposal's specs, map results to cases via @case tags, write run.json. */
export function runSpecs(proposal: Proposal): RunReport {
  const specs = specFilesOf(proposal);
  const command = `npx playwright test ${specs.join(' ')}`;
  const report: RunReport = { proposalId: proposal.id, ranAt: new Date().toISOString(), command, exitCode: null, cases: {} };

  fs.rmSync(RESULTS_JSON, { force: true });
  const res = sh('npx', ['playwright', 'test', ...specs], { quiet: false });
  report.exitCode = res.code;

  const entries = fs.existsSync(RESULTS_JSON) ? flattenResults(readJson<PwReport>(RESULTS_JSON)) : [];
  for (const c of proposal.cases) {
    if (!c.automate) {
      report.cases[c.caseId] = { status: 'not-automated' };
      continue;
    }
    const e = entries.find(x => x.tags.includes(`@case:${c.caseId}`));
    report.cases[c.caseId] = e ? { status: e.status, error: e.error, durationMs: e.durationMs } : { status: 'not-run' };
  }
  writeJson(runFile(proposal.id), report);
  return report;
}

export function notRunReport(proposal: Proposal, reason: string): RunReport {
  const report: RunReport = { proposalId: proposal.id, ranAt: null, command: reason, exitCode: null, cases: {} };
  for (const c of proposal.cases) report.cases[c.caseId] = { status: c.automate ? 'not-run' : 'not-automated' };
  writeJson(runFile(proposal.id), report);
  return report;
}

export function summaryTable(proposal: Proposal, run?: RunReport): string {
  return table([
    ['case', 'covers', 'prio', 'conf', 'run', 'title'],
    ...proposal.cases.map(c => [
      c.caseId,
      c.covers.join(','),
      c.priority,
      c.confidence,
      run?.cases[c.caseId]?.status ?? 'not-run',
      c.title,
    ]),
  ]);
}
