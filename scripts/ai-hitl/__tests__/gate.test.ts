import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGate, type GateInput } from '../gate';
import { body, decide, generatedSpec, ID, POSTS_REQ, proposal, removeTest, SPEC } from './helpers';

/** Reviewed state that must pass: 6 accepted, TC-02 edited, TC-08 rejected and removed from the spec. */
function reviewed(): GateInput {
  let md = body();
  for (const id of ['POSTS-TC-01', 'POSTS-TC-03', 'POSTS-TC-04', 'POSTS-TC-05', 'POSTS-TC-06', 'POSTS-TC-07']) {
    md = decide(md, id, 'accept');
  }
  md = decide(md, 'POSTS-TC-02', 'edit');
  md = decide(md, 'POSTS-TC-08', 'reject', 'duplicates TC-01');
  return {
    body: md,
    proposal: proposal(),
    requirements: POSTS_REQ,
    specs: [{ file: SPEC, source: removeTest(generatedSpec(), 'POSTS-TC-08') }],
  };
}

const problems = (input: GateInput) => runGate(input).problems;

test('passes when every case has one decision and every requirement is covered or a gap', () => {
  const r = runGate(reviewed());
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test('fails on a case without decision', () => {
  const input = reviewed();
  input.body = input.body.replace('- [x] accept', '- [ ] accept');
  assert.deepEqual(problems(input), ['POSTS-TC-01: no decision — tick one of accept / edit / reject']);
});

test('fails on several ticked boxes', () => {
  const input = reviewed();
  input.body = decide(input.body, 'POSTS-TC-01', 'edit');
  assert.deepEqual(problems(input), ['POSTS-TC-01: 2 boxes ticked (accept, edit) — tick exactly one']);
});

test('fails on reject without reason', () => {
  const input = reviewed();
  input.body = input.body.replace('reason: duplicates TC-01', 'reason:   ');
  assert.deepEqual(problems(input), ['POSTS-TC-08: rejected without a reason — write it after "reason:"']);
});

test('fails when rejecting the only case of a requirement leaves it uncovered — a human gap fixes it', () => {
  const input = reviewed();
  input.body = input.body.replace(/#### POSTS-TC-06([\s\S]*?)- \[x\] accept/, '#### POSTS-TC-06$1- [ ] accept');
  input.body = decide(input.body, 'POSTS-TC-06', 'reject', 'not needed');
  input.specs[0].source = removeTest(input.specs[0].source, 'POSTS-TC-06');
  assert.deepEqual(problems(input), [
    'POSTS-06: not covered (all its cases are rejected) — keep a case or add "- **POSTS-06** — <reason>" to Coverage gaps',
  ]);
  input.body = input.body.replace('<!-- /ai-hitl:gaps -->', '- **POSTS-06** — covered by a manual check\n<!-- /ai-hitl:gaps -->');
  assert.deepEqual(problems(input), []);
});

test('fails when a requirement is neither covered nor a gap', () => {
  const input = reviewed();
  input.proposal.coverageGaps = [];
  input.body = input.body.replace(/- \*\*POSTS-08\*\* — .*\n/, '');
  assert.deepEqual(problems(input), [
    'POSTS-08: not covered (no case covers it) — keep a case or add "- **POSTS-08** — <reason>" to Coverage gaps',
  ]);
});

test('fails when a spec lacks @ai-generated / @req / header', () => {
  const input = reviewed();
  input.specs[0].source = input.specs[0].source
    .replace(/^\/\/ @ai-generated.*\n/, '')
    .replace("{ tag: ['@ai-generated', '@req:POSTS-06', '@case:POSTS-TC-06'] }", "{ tag: ['@case:POSTS-TC-06'] }");
  const p = problems(input);
  assert.equal(p.length, 3, p.join('\n'));
  assert.match(p[0], /^tests\/ai\/posts.spec.ts:1: first line must be/);
  assert.match(p[1], /test "GET - Should return 404 for non-existent post" is missing tag @ai-generated/);
  assert.match(p[2], /test "GET - Should return 404 for non-existent post" has no @req:<ID> tag/);
});

test('fails when a rejected test is still in the spec, or an accepted test is missing', () => {
  const input = reviewed();
  input.specs[0].source = removeTest(generatedSpec(), 'POSTS-TC-07');
  assert.deepEqual(problems(input), [
    'POSTS-TC-07: marked "accept", but no test tagged @case:POSTS-TC-07 exists in tests/ai/',
    'POSTS-TC-08: rejected, but its test is still in tests/ai/posts.spec.ts — delete it or change the decision',
  ]);
});

test('fails on a body of another proposal and on unknown @req tags', () => {
  const input = reviewed();
  input.body = input.body.replace(`proposal=${ID}`, 'proposal=posts-20200101-0000');
  input.specs[0].source = input.specs[0].source.replace("'@req:POSTS-06'", "'@req:POSTS-66'");
  const p = problems(input);
  assert.match(p[0], /belongs to proposal posts-20200101-0000/);
  assert.match(p[1], /references unknown requirement @req:POSTS-66/);
});
