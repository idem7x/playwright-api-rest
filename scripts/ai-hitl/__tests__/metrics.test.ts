import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { aggregate, computeMetrics, mismatchOf, readLog, writeLogEntry, type MetricsInput } from '../metrics';
import { body, decide, generatedSpec, proposal, removeTest, SPEC } from './helpers';

function input(merged: string, md: string): MetricsInput {
  return {
    proposal: proposal(),
    body: md,
    generated: new Map([[SPEC, generatedSpec()]]),
    merged: new Map([[SPEC, merged]]),
    mergedAt: '2026-11-22T08:00:00.000Z',
  };
}

function reviewedBody(): string {
  let md = body();
  for (const id of ['POSTS-TC-01', 'POSTS-TC-03', 'POSTS-TC-04', 'POSTS-TC-05', 'POSTS-TC-06', 'POSTS-TC-07']) md = decide(md, id, 'accept');
  md = decide(md, 'POSTS-TC-02', 'edit');
  return decide(md, 'POSTS-TC-08', 'reject', 'duplicate');
}

function humanEdit(src: string): string {
  return removeTest(src, 'POSTS-TC-08').replace(
    "    expect(errors.some(e => e.field === 'title')).toBeTruthy();\n",
    "    const titleError = errors.find(e => e.field === 'title');\n    expect(titleError?.message).shouldEqual(\"can't be blank\");\n",
  );
}

test('classifies accepted-as-is / edited / rejected and counts edited lines', () => {
  const m = computeMetrics(input(humanEdit(generatedSpec()), reviewedBody()));
  assert.equal(m.total, 8);
  assert.equal(m.acceptedAsIs, 6);
  assert.equal(m.edited, 1);
  assert.equal(m.rejected, 1);
  assert.equal(m.mismatches, 0);
  const tc02 = m.cases.find(c => c.caseId === 'POSTS-TC-02');
  assert.deepEqual(tc02, { caseId: 'POSTS-TC-02', declared: 'edit', actual: 'changed', changedLines: 3 });
  assert.equal(m.avgEditedLines, 3);
  assert.equal(m.cases.find(c => c.caseId === 'POSTS-TC-08')?.actual, 'removed');
  assert.equal(m.cases.find(c => c.caseId === 'POSTS-TC-01')?.actual, 'unchanged');
});

test('flags mismatches between declared decision and code', () => {
  // nothing edited, nothing removed, but the body says edit / reject; accept-ed TC-01 was changed
  const merged = generatedSpec().replace("expect(createdPost.id).toBeDefined();", 'expect(createdPost.id).toBeGreaterThan(0);');
  const m = computeMetrics(input(merged, reviewedBody()));
  assert.equal(m.mismatches, 3);
  assert.match(m.cases.find(c => c.caseId === 'POSTS-TC-01')?.mismatch ?? '', /declared "accept" but the test code was changed/);
  assert.match(m.cases.find(c => c.caseId === 'POSTS-TC-02')?.mismatch ?? '', /declared "edit" but the test code is unchanged/);
  assert.match(m.cases.find(c => c.caseId === 'POSTS-TC-08')?.mismatch ?? '', /declared "reject" but the test is still present/);
});

test('mismatch table', () => {
  assert.equal(mismatchOf('accept', 'unchanged'), undefined);
  assert.equal(mismatchOf('edit', 'changed'), undefined);
  assert.equal(mismatchOf('reject', 'removed'), undefined);
  assert.equal(mismatchOf('accept', 'not-automated'), undefined);
  assert.match(mismatchOf('accept', 'removed') ?? '', /removed/);
  assert.match(mismatchOf('undecided', 'unchanged') ?? '', /no single decision/);
});

test('log append is idempotent per proposal and aggregate computes rates', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hitl-')), 'log.jsonl');
  const m = computeMetrics(input(humanEdit(generatedSpec()), reviewedBody()));
  assert.equal(writeLogEntry(m, false, file), 'appended');
  assert.equal(writeLogEntry(m, false, file), 'exists');
  assert.equal(writeLogEntry({ ...m, revisions: 2 }, true, file), 'replaced');
  assert.equal(writeLogEntry({ ...m, proposalId: 'todos-20261122-0900', revisions: 0 }, false, file), 'appended');
  const entries = readLog(file);
  assert.equal(entries.length, 2);
  assert.deepEqual(aggregate(entries), {
    proposals: 2,
    cases: 16,
    acceptanceRate: 75,
    editRate: 12.5,
    rejectionRate: 12.5,
    avgRevisionsPerProposal: 1,
  });
});
