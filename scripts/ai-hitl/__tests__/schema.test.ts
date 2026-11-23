import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, validateProposal } from '../schema';
import { POSTS_REQ, rawProposal } from './helpers';

test('recorded fixture is a valid proposal', () => {
  const r = validateProposal(rawProposal(), POSTS_REQ);
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('coverage rule: a requirement neither covered nor a gap invalidates the proposal', () => {
  const p = rawProposal();
  p.coverageGaps = [];
  const r = validateProposal(p, POSTS_REQ);
  assert.equal(r.ok, false);
  assert.deepEqual(r.errors, ['coverage: requirement POSTS-08 is neither covered by a case nor listed in coverageGaps']);
});

test('unknown requirement ids in covers / gaps are errors', () => {
  const p = rawProposal() as { cases: Array<{ covers: string[] }>; coverageGaps: Array<{ requirementId: string }> };
  p.cases[0].covers = ['POSTS-01', 'POSTS-42'];
  p.coverageGaps.push({ requirementId: 'TODOS-01', reason: 'x' } as never);
  const r = validateProposal(p, POSTS_REQ);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('unknown requirement id POSTS-42')));
  assert.ok(r.errors.some(e => e.includes('coverageGaps: unknown requirement id TODOS-01')));
});

test('duplicate caseIds, missing specFile and specs outside tests/ai are errors', () => {
  const p = rawProposal() as { cases: Array<Record<string, unknown>> };
  p.cases[1].caseId = p.cases[0].caseId;
  delete p.cases[2].specFile;
  p.cases[3].specFile = 'tests/posts.spec.ts';
  const r = validateProposal(p, POSTS_REQ);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('duplicate caseId POSTS-TC-01')));
  assert.ok(r.errors.some(e => e.includes('automate=true requires specFile')));
  assert.ok(r.errors.some(e => e.includes('must live under tests/ai/')));
});

test('zod errors are reported with their path (title style, enum values)', () => {
  const p = rawProposal() as { cases: Array<Record<string, unknown>> };
  p.cases[0].title = 'creates a post';
  p.cases[0].confidence = 'certain';
  const r = validateProposal(p, POSTS_REQ);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.startsWith('cases.0.title:')));
  assert.ok(r.errors.some(e => e.startsWith('cases.0.confidence:')));
});

test('extractJson tolerates fences and prose', () => {
  assert.deepEqual(extractJson('Here you go:\n```json\n{"a":1}\n```\nbye'), { a: 1 });
  assert.deepEqual(extractJson('{"a":{"b":2}}'), { a: { b: 2 } });
  assert.throws(() => extractJson('no json here'), /No JSON object/);
});
