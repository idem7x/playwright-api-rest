import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderPrBody, REVIEWER_CHECKLIST, type RunReport } from '../render-pr';
import { parseBody } from '../lib/decisions';
import { decide, ID, POSTS_REQ, proposal } from './helpers';

const run: RunReport = {
  proposalId: ID,
  ranAt: '2026-11-21T23:00:00.000Z',
  command: 'npx playwright test tests/ai/posts.spec.ts',
  exitCode: 1,
  cases: {
    'POSTS-TC-01': { status: 'passed', durationMs: 400 },
    'POSTS-TC-02': { status: 'failed', error: 'Error: Expected status 422, got 201' },
  },
};

test('renders summary, traceability, gaps, one decision block per case, checklist and steering help', () => {
  const p = proposal();
  const md = renderPrBody(p, POSTS_REQ, { run });
  assert.match(md, new RegExp(`<!-- ai-hitl:proposal=${ID} -->`));
  assert.match(md, /\| Requirement file \| `requirements\/posts.md` \(8 requirements\) \|/);
  assert.match(md, /\| Run \| 1 passed · 1 failed · 6 not run — 2026-11-21T23:00:00.000Z \|/);
  assert.match(md, /\| \*\*POSTS-01\*\* .* \| P0 \| POSTS-TC-01, POSTS-TC-08 \| ✅ passed, ⚪ not run \|/);
  assert.match(md, /\| \*\*POSTS-08\*\* .* \| P2 \| — \| ⚠️ coverage gap \|/);
  assert.match(md, /- \*\*POSTS-08\*\* — Ordering/);
  for (const c of p.cases) {
    assert.ok(md.includes(`#### ${c.caseId} — ${c.title}\n`), c.caseId);
  }
  assert.equal(md.match(/^- \[ \] accept$/gm)?.length, p.cases.length);
  assert.equal(md.match(/^- \[ \] reject — reason:$/gm)?.length, p.cases.length);
  assert.match(md, /> Error: Expected status 422, got 201/);
  for (const item of REVIEWER_CHECKLIST) assert.ok(md.includes(`- [ ] ${item}`));
  assert.match(md, /`@claude <instruction>`/);
});

test('re-render keeps decisions, human gaps and checklist — except for changed cases', () => {
  const p = proposal();
  let md = renderPrBody(p, POSTS_REQ);
  md = decide(md, 'POSTS-TC-01', 'accept');
  md = decide(md, 'POSTS-TC-06', 'reject', 'flaky');
  md = md.replace('<!-- /ai-hitl:gaps -->', '- **POSTS-06** — rejected, covered manually\n<!-- /ai-hitl:gaps -->');
  md = md.replace(`- [ ] ${REVIEWER_CHECKLIST[0]}`, `- [x] ${REVIEWER_CHECKLIST[0]}`);

  const again = parseBody(renderPrBody(p, POSTS_REQ, { previousBody: md, changedCases: ['POSTS-TC-06'] }));
  assert.deepEqual(again.decisions.get('POSTS-TC-01')?.checked, ['accept']);
  assert.deepEqual(again.decisions.get('POSTS-TC-06')?.checked, []);
  assert.equal(again.decisions.get('POSTS-TC-06')?.reason, '');
  assert.deepEqual(again.gaps.map(g => g.requirementId), ['POSTS-08', 'POSTS-06']);
  assert.equal(again.checklist.get(REVIEWER_CHECKLIST[0]), true);
});

test('revisions are listed', () => {
  const p = proposal();
  p.revisions.push({ at: '2026-11-21T23:10:00.000Z', by: 'owner', instruction: 'pin the 404 message' });
  const md = renderPrBody(p, POSTS_REQ);
  assert.match(md, /### Revisions\n\n- 2026-11-21T23:10:00.000Z by @owner: pin the 404 message/);
  assert.match(md, /\| Revisions \| 1 \|/);
});
