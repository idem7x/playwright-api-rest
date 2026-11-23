import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAllRequirements, parseRequirements, RequirementsParseError } from '../requirements';

const VALID = `# POSTS — User posts API
Endpoint: /posts  (also /users/{id}/posts)

## Requirements
- **POSTS-01** (P0): Create a post.
- **POSTS-02** (P1): Missing title returns 422.

## Notes
- **POSTS-99** (P0): ignored, not in the Requirements section
`;

test('parses resource, endpoints and items', () => {
  const r = parseRequirements(VALID, 'posts.md');
  assert.equal(r.resource, 'posts');
  assert.equal(r.title, 'User posts API');
  assert.equal(r.endpoint, '/posts');
  assert.deepEqual(r.alsoEndpoints, ['/users/{id}/posts']);
  assert.deepEqual(r.items, [
    { id: 'POSTS-01', priority: 'P0', text: 'Create a post.' },
    { id: 'POSTS-02', priority: 'P1', text: 'Missing title returns 422.' },
  ]);
});

test('rejects duplicate ids, wrong prefix, bad priority and malformed lines (all reported)', () => {
  const bad = `# POSTS — x
Endpoint: /posts

## Requirements
- **POSTS-01** (P0): a
- **POSTS-01** (P1): duplicate
- **TODOS-01** (P1): wrong prefix
- **POSTS-03** (P5): bad priority
- POSTS-04: no bold
`;
  assert.throws(
    () => parseRequirements(bad, 'posts.md'),
    (e: Error) =>
      e instanceof RequirementsParseError &&
      /duplicate requirement id POSTS-01/.test(e.message) &&
      /TODOS-01 must start with "POSTS-"/.test(e.message) &&
      (e.message.match(/requirement line must look like/g) ?? []).length === 2,
  );
});

test('requires title, endpoint and at least one requirement', () => {
  assert.throws(() => parseRequirements('## Requirements\n', 'posts.md'), /missing title.*\n.*missing "Endpoint:".*\n.*no requirements/s);
});

test('title resource must match the file name', () => {
  assert.throws(() => parseRequirements(VALID, 'todos.md'), /does not match file name/);
});

test('all committed requirement files parse and have 5–8 requirements', () => {
  const all = loadAllRequirements();
  assert.deepEqual(all.map(r => r.resource), ['comments', 'posts', 'todos']);
  for (const r of all) assert.ok(r.items.length >= 5 && r.items.length <= 8, `${r.file}: ${r.items.length}`);
});
