import * as fs from 'node:fs';
import { parseArgs } from 'node:util';
import type { Proposal } from './schema';
import { decisionOf, parseBody, type DecisionOption } from './lib/decisions';
import { changedLineCount, parseSpec } from './lib/spec';
import { METRICS_LOG, loadProposal, proposalIdFromBranch, snapshotPath, specFilesOf } from './lib/store';
import { isMain, stepSummary, table } from './lib/cli';

export type ActualOutcome = 'unchanged' | 'changed' | 'removed' | 'not-automated' | 'not-generated';

export interface CaseMetric {
  caseId: string;
  declared: DecisionOption | 'undecided';
  actual: ActualOutcome;
  changedLines: number;
  mismatch?: string;
}

export interface MetricsEntry {
  proposalId: string;
  resource: string;
  model: string;
  mergedAt: string;
  total: number;
  acceptedAsIs: number;
  edited: number;
  rejected: number;
  avgEditedLines: number;
  revisions: number;
  mismatches: number;
  cases: CaseMetric[];
}

export interface MetricsInput {
  proposal: Proposal;
  body: string;
  /** specFile → AI snapshot source */
  generated: Map<string, string>;
  /** specFile → merged source (missing = file deleted) */
  merged: Map<string, string>;
  mergedAt: string;
}

function segmentsByCase(source: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!source) return map;
  for (const t of parseSpec(source)) if (t.caseId) map.set(t.caseId, t.segment);
  return map;
}

export function mismatchOf(declared: CaseMetric['declared'], actual: ActualOutcome): string | undefined {
  if (declared === 'undecided') return 'no single decision ticked';
  if (actual === 'not-automated' || actual === 'not-generated') return undefined;
  if (declared === 'accept' && actual === 'changed') return 'declared "accept" but the test code was changed';
  if (declared === 'accept' && actual === 'removed') return 'declared "accept" but the test was removed';
  if (declared === 'edit' && actual === 'unchanged') return 'declared "edit" but the test code is unchanged';
  if (declared === 'edit' && actual === 'removed') return 'declared "edit" but the test was removed';
  if (declared === 'reject' && actual !== 'removed') return 'declared "reject" but the test is still present';
  return undefined;
}

export function computeMetrics(input: MetricsInput): MetricsEntry {
  const { proposal } = input;
  const parsed = parseBody(input.body);
  const gen = new Map<string, Map<string, string>>();
  const mer = new Map<string, Map<string, string>>();
  for (const spec of specFilesOf(proposal)) {
    gen.set(spec, segmentsByCase(input.generated.get(spec)));
    mer.set(spec, segmentsByCase(input.merged.get(spec)));
  }

  const cases: CaseMetric[] = proposal.cases.map(c => {
    const declared = decisionOf(parsed.decisions.get(c.caseId)) ?? 'undecided';
    let actual: ActualOutcome;
    let changedLines = 0;
    if (!c.automate || !c.specFile) {
      actual = 'not-automated';
    } else {
      const before = gen.get(c.specFile)?.get(c.caseId);
      const after = mer.get(c.specFile)?.get(c.caseId);
      if (before === undefined) actual = 'not-generated';
      else if (after === undefined) actual = 'removed';
      else {
        changedLines = changedLineCount(before, after);
        actual = changedLines === 0 ? 'unchanged' : 'changed';
      }
    }
    const mismatch = mismatchOf(declared, actual);
    return { caseId: c.caseId, declared, actual, changedLines, ...(mismatch ? { mismatch } : {}) };
  });

  const edited = cases.filter(c => c.declared === 'edit');
  const avg = edited.length ? edited.reduce((s, c) => s + c.changedLines, 0) / edited.length : 0;

  return {
    proposalId: proposal.id,
    resource: proposal.id.replace(/-\d{8}-\d{4}$/, ''),
    model: proposal.model,
    mergedAt: input.mergedAt,
    total: cases.length,
    acceptedAsIs: cases.filter(c => c.declared === 'accept').length,
    edited: edited.length,
    rejected: cases.filter(c => c.declared === 'reject').length,
    avgEditedLines: Math.round(avg * 10) / 10,
    revisions: proposal.revisions.length,
    mismatches: cases.filter(c => c.mismatch).length,
    cases,
  };
}

export interface Aggregate {
  proposals: number;
  cases: number;
  acceptanceRate: number;
  editRate: number;
  rejectionRate: number;
  avgRevisionsPerProposal: number;
}

export function aggregate(entries: MetricsEntry[]): Aggregate {
  const cases = entries.reduce((s, e) => s + e.total, 0);
  const pct = (n: number) => (cases ? Math.round((n / cases) * 1000) / 10 : 0);
  return {
    proposals: entries.length,
    cases,
    acceptanceRate: pct(entries.reduce((s, e) => s + e.acceptedAsIs, 0)),
    editRate: pct(entries.reduce((s, e) => s + e.edited, 0)),
    rejectionRate: pct(entries.reduce((s, e) => s + e.rejected, 0)),
    avgRevisionsPerProposal: entries.length
      ? Math.round((entries.reduce((s, e) => s + e.revisions, 0) / entries.length) * 10) / 10
      : 0,
  };
}

export function readLog(file = METRICS_LOG): MetricsEntry[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as MetricsEntry);
}

/** Append (or, with replace=true, replace) the entry for this proposal. */
export function writeLogEntry(entry: MetricsEntry, replace: boolean, file = METRICS_LOG): 'appended' | 'replaced' | 'exists' {
  const entries = readLog(file);
  const idx = entries.findIndex(e => e.proposalId === entry.proposalId);
  if (idx !== -1 && !replace) return 'exists';
  if (idx !== -1) entries[idx] = entry;
  else entries.push(entry);
  fs.mkdirSync('ai/metrics', { recursive: true });
  fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n');
  return idx === -1 ? 'appended' : 'replaced';
}

export function metricsMarkdown(entry: MetricsEntry, agg: Aggregate): string {
  const rows = entry.cases
    .map(c => `| ${c.caseId} | ${c.declared} | ${c.actual}${c.changedLines ? ` (${c.changedLines} lines)` : ''} | ${c.mismatch ?? ''} |`)
    .join('\n');
  return [
    `### HITL metrics — \`${entry.proposalId}\``,
    '',
    `accepted as-is **${entry.acceptedAsIs}** · edited **${entry.edited}** (avg ${entry.avgEditedLines} lines) · rejected **${entry.rejected}** · revisions **${entry.revisions}** · mismatches **${entry.mismatches}**`,
    '',
    '| Case | Declared | Actual | Mismatch |',
    '| --- | --- | --- | --- |',
    rows,
    '',
    `**All proposals (${agg.proposals}, ${agg.cases} cases):** acceptance ${agg.acceptanceRate}% · edit ${agg.editRate}% · rejection ${agg.rejectionRate}% · avg revisions/proposal ${agg.avgRevisionsPerProposal}`,
  ].join('\n');
}

// npm run ai:metrics -- --proposal <id> --body-file <path> [--merged-at <iso>] [--replace]
if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      proposal: { type: 'string' },
      branch: { type: 'string' },
      'body-file': { type: 'string' },
      'merged-at': { type: 'string' },
      replace: { type: 'boolean', default: false },
    },
  });
  const id = values.proposal ?? (values.branch ? proposalIdFromBranch(values.branch) : undefined);
  if (!id || !values['body-file']) {
    console.error('Usage: npm run ai:metrics -- --proposal <id> --body-file <path> [--merged-at <iso>] [--replace]');
    process.exit(2);
  }
  const proposal = loadProposal(id);
  const generated = new Map<string, string>();
  const merged = new Map<string, string>();
  for (const spec of specFilesOf(proposal)) {
    const snap = snapshotPath(id, spec);
    if (fs.existsSync(snap)) generated.set(spec, fs.readFileSync(snap, 'utf-8'));
    if (fs.existsSync(spec)) merged.set(spec, fs.readFileSync(spec, 'utf-8'));
  }
  const entry = computeMetrics({
    proposal,
    body: fs.readFileSync(values['body-file'], 'utf-8'),
    generated,
    merged,
    mergedAt: values['merged-at'] ?? new Date().toISOString(),
  });
  const result = writeLogEntry(entry, values.replace ?? false);
  if (result === 'exists') console.log(`• ${id} is already in ${METRICS_LOG} — use --replace to overwrite`);
  else console.log(`• ${result} ${id} in ${METRICS_LOG}`);

  console.log(
    '\n' +
      table([
        ['case', 'declared', 'actual', 'lines', 'mismatch'],
        ...entry.cases.map(c => [c.caseId, c.declared, c.actual, String(c.changedLines), c.mismatch ?? '']),
      ]),
  );
  const agg = aggregate(readLog());
  console.log(
    `\nThis proposal: ${entry.acceptedAsIs} accepted as-is, ${entry.edited} edited (avg ${entry.avgEditedLines} lines), ` +
      `${entry.rejected} rejected, ${entry.revisions} revisions, ${entry.mismatches} mismatches`,
  );
  console.log(
    `All proposals (${agg.proposals}): acceptance ${agg.acceptanceRate}% · edit ${agg.editRate}% · ` +
      `rejection ${agg.rejectionRate}% · avg revisions/proposal ${agg.avgRevisionsPerProposal}`,
  );
  stepSummary(metricsMarkdown(entry, agg));
}
