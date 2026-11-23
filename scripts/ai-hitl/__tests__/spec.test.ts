import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedLineCount, checkAiSpec, parseSpec, readAiHeaderProposal, withAiHeader } from '../lib/spec';
import { changedCases } from '../revise';
import { flattenResults } from '../lib/results';
import { generatedSpec, ID, proposal, REVISE_FIXTURE, SPEC } from './helpers';

test('parseSpec finds tests with tags, ignores describe/hooks', () => {
  const tests = parseSpec(generatedSpec());
  assert.equal(tests.length, 8);
  assert.deepEqual(tests[0].tags, ['@ai-generated', '@req:POSTS-01', '@case:POSTS-TC-01']);
  assert.equal(tests[0].caseId, 'POSTS-TC-01');
  assert.deepEqual(tests[0].reqIds, ['POSTS-01']);
  assert.ok(tests[0].segment.startsWith("test('POST - Should create post for existing user'"));
  assert.ok(!tests[0].segment.includes('POSTS-TC-02'));
  assert.equal(checkAiSpec(SPEC, generatedSpec()).length, 0);
});

test('untagged legacy tests are found with no tags', () => {
  const t = parseSpec("test.describe('x', () => {\n  test(\"GET - Should a\", async () => {});\n  test.afterEach(async () => {});\n});");
  assert.equal(t.length, 1);
  assert.deepEqual(t[0].tags, []);
});

test('header is inserted once and replaced on re-generation', () => {
  const once = withAiHeader('line1\n', 'posts-20200101-0000');
  const twice = withAiHeader(once, ID);
  assert.equal(readAiHeaderProposal(twice), ID);
  assert.equal(twice.split('\n').filter(l => l.startsWith('// @ai-generated')).length, 1);
});

test('changedLineCount ignores indentation and blank lines', () => {
  assert.equal(changedLineCount('a\n  b\n\nc', 'a\nb\nc'), 0);
  assert.equal(changedLineCount('a\nb\nc', 'a\nB\nc\nd'), 3);
});

test('revise: only cases with changed code or metadata are reset', () => {
  const before = proposal();
  const after = proposal();
  const replacement = REVISE_FIXTURE.replacements?.[0];
  assert.ok(replacement);
  const oldSrc = generatedSpec();
  const newSrc = oldSrc.replace(replacement.find, replacement.replace);
  assert.deepEqual(changedCases(before, after, new Map([[SPEC, oldSrc]]), new Map([[SPEC, newSrc]])), ['POSTS-TC-06']);

  after.cases[0].covers = ['POSTS-01', 'POSTS-05'];
  after.cases.push({ ...after.cases[1], caseId: 'POSTS-TC-09' });
  assert.deepEqual(changedCases(before, after, new Map([[SPEC, oldSrc]]), new Map([[SPEC, newSrc]])), [
    'POSTS-TC-01',
    'POSTS-TC-06',
    'POSTS-TC-09',
  ]);
});

test('flattenResults maps Playwright JSON (tags without "@") to entries', () => {
  const entries = flattenResults({
    suites: [{
      file: 'ai/posts.spec.ts',
      suites: [{
        specs: [
          { title: 'a', file: 'ai/posts.spec.ts', tags: ['ai-generated', 'case:POSTS-TC-01'], tests: [{ status: 'expected', results: [{ status: 'passed', duration: 5 }] }] },
          { title: 'b', file: 'ai/posts.spec.ts', tags: [], tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 7, error: { message: '\u001b[31mError: boom\u001b[39m\n  at x' } }] }] },
          { title: 'c', file: 'ai/posts.spec.ts', tests: [{ status: 'skipped', results: [{ status: 'skipped' }] }] },
        ],
      }],
    }],
  });
  assert.deepEqual(entries.map(e => [e.title, e.status, e.error]), [['a', 'passed', undefined], ['b', 'failed', 'Error: boom'], ['c', 'skipped', undefined]]);
  assert.deepEqual(entries[0].tags, ['@ai-generated', '@case:POSTS-TC-01']);
});
