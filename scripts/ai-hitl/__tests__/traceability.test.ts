import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTraceability } from '../traceability';
import { parseRequirements } from '../requirements';
import { generatedSpec, SPEC } from './helpers';

const posts = { ...parseRequirements(
  '# POSTS — p\nEndpoint: /posts\n\n## Requirements\n- **POSTS-01** (P0): create\n- **POSTS-06** (P1): 404\n- **POSTS-08** (P2): order\n',
  'posts.md',
), file: 'requirements/posts.md' };
const todos = { ...parseRequirements('# TODOS — t\nEndpoint: /todos\n\n## Requirements\n- **TODOS-01** (P0): create\n', 'todos.md'), file: 'requirements/todos.md' };

const legacy = {
  file: 'tests/getUsers.spec.ts',
  source: "test.describe('GET', () => {\n  test('GET - Should retrieve all users', async ({ api }) => {});\n});\n",
};

const md = renderTraceability({
  requirements: [posts, todos],
  specs: [legacy, { file: SPEC, source: generatedSpec() }],
  results: {
    startTime: '2026-11-21T23:00:00.000Z',
    entries: [
      { file: 'ai/posts.spec.ts', title: 'POST - Should create post for existing user', tags: [], status: 'passed', durationMs: 1 },
      { file: 'ai/posts.spec.ts', title: 'GET - Should return 404 for non-existent post', tags: [], status: 'failed', durationMs: 1 },
    ],
  },
});

test('coverage % per resource and total', () => {
  assert.match(md, /\| \[posts\]\(\.\.\/requirements\/posts\.md\) \| 3 \| 2 \| 67% \|/);
  assert.match(md, /\| \[todos\]\(\.\.\/requirements\/todos\.md\) \| 1 \| 0 \| 0% \|/);
  assert.match(md, /\| \*\*total\*\* \| 4 \| 2 \| 50% \|/);
});

test('requirement rows list tests and their last status', () => {
  const row = md.split('\n').find(l => l.startsWith('| POSTS-01 |')) ?? '';
  assert.match(row, /`tests\/ai\/posts\.spec\.ts` › POST - Should create post for existing user/);
  assert.match(row, /POST - Should create post via \/posts with user_id in body/);
  assert.match(row, /✅ passed \(2026-11-21\)<br>not run/);
  assert.match(md, /\| POSTS-06 \| P1 \| 404 \| .* \| ❌ failed \(2026-11-21\) \|/);
});

test('uncovered requirements and legacy tests are listed separately', () => {
  assert.match(md, /## Uncovered requirements\n\n- \*\*POSTS-08\*\* \(P2\) — order _\(requirements\/posts\.md\)_\n- \*\*TODOS-01\*\*/);
  assert.match(md, /## Legacy, untraced tests[\s\S]*\| `tests\/getUsers\.spec\.ts` \| GET - Should retrieve all users \| not run \|/);
  assert.match(md, /## Tags referencing unknown requirements[\s\S]*@req:POSTS-02/);
});
