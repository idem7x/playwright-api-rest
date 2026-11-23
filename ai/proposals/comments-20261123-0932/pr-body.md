<!-- ai-hitl:proposal=comments-20261123-0932 -->
## 🤖 AI test proposal `comments-20261123-0932` — needs human review

> **AI proposes, a human decides.** Tick exactly one decision per case below. The `ai-gate` check stays red
> until every case has a decision and every requirement is covered or listed as a gap.

### Summary

| | |
| --- | --- |
| Requirement file | `requirements/comments.md` (7 requirements) |
| Model | `claude-sonnet-5-5` |
| Created | 2026-11-23T09:32:08.900Z |
| Cases | 7 (7 automated) |
| Run | 7 passed — 2026-11-23T09:32:46.930Z |
| Coverage gaps | 0 |
| Revisions | 0 |

### Traceability

| Requirement | Priority | Case(s) | Run status |
| --- | --- | --- | --- |
| **COMMENTS-01** An authenticated client can create a comment on an existing post via /posts/{id}/comments; response 201 contains id, post_id, name, email, body. | P0 | COMMENTS-TC-01 | ✅ passed |
| **COMMENTS-02** Creating a comment with an invalid email returns 422 with a field error for "email". | P1 | COMMENTS-TC-02 | ✅ passed |
| **COMMENTS-03** Creating a comment without body returns 422 with a field error for "body". | P1 | COMMENTS-TC-03 | ✅ passed |
| **COMMENTS-04** Creating a comment for a post id that does not exist returns 422 with a field error for "post". | P1 | COMMENTS-TC-04 | ✅ passed |
| **COMMENTS-05** Creating a comment without an Authorization header returns 401 with a message. | P0 | COMMENTS-TC-05 | ✅ passed |
| **COMMENTS-06** GET /comments?post_id={id} returns only comments of that post. | P2 | COMMENTS-TC-06 | ✅ passed |
| **COMMENTS-07** GET /comments/{id} for a non-existent id returns 404 with a message. | P1 | COMMENTS-TC-07 | ✅ passed |

### Coverage gaps

Requirements intentionally left without a test. If you reject the only case of a requirement, add a line
here in the same format (`- **POSTS-05** — reason`), otherwise the gate fails.

<!-- ai-hitl:gaps -->
<!-- /ai-hitl:gaps -->

### Decisions

Tick **exactly one** box per case. `reject` needs a reason after `reason:`.

#### COMMENTS-TC-01 — POST - Should create comment for existing post

**Covers:** COMMENTS-01 · **Priority:** P0 · **Confidence:** high · **Run:** ✅ passed (3247 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** Creates user, then post, then a comment via /posts/{id}/comments. Asserts 201, Schema.COMMENT (id, post_id, name, email, body), and that post_id, name, email and body match what was sent.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### COMMENTS-TC-02 — POST - Should fail with 422 for invalid email format

**Covers:** COMMENTS-02 · **Priority:** P1 · **Confidence:** medium · **Run:** ✅ passed (3247 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** Posts a comment with a malformed email from DataGenerator.generateInvalidEmail(). Asserts 422, Schema.ERROR, and an error for field 'email' whose message contains 'invalid'.

**Open questions:**
- The 'invalid' message wording is copied from the users endpoint and not confirmed for comments. Should the assertion only check that the field is 'email'?
- Some malformed formats (e.g. a name with spaces) might be accepted by GoREST validation. That could make the test flaky.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### COMMENTS-TC-03 — POST - Should fail with 422 when body is missing

**Covers:** COMMENTS-03 · **Priority:** P1 · **Confidence:** high · **Run:** ✅ passed (3247 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** Posts a comment with name and email but no body to an existing post. Asserts 422, Schema.ERROR, and an error for field 'body'.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### COMMENTS-TC-04 — POST - Should fail with 422 when post does not exist

**Covers:** COMMENTS-04 · **Priority:** P1 · **Confidence:** medium · **Run:** ✅ passed (967 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** Posts to /comments with post_id 999999999. Asserts 422, Schema.ERROR, and an error for field 'post' whose message contains 'must exist'.

**Open questions:**
- The 'must exist' wording is taken from the posts 'user' error and is not confirmed for comments.
- The requirement names /posts/{id}/comments, but this case uses /comments with post_id in the body. A non-existent id in the nested path would likely return 404 instead of 422. Is the body variant the intended one?

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### COMMENTS-TC-05 — POST - Should fail with 401 when unauthorized

**Covers:** COMMENTS-05 · **Priority:** P0 · **Confidence:** high · **Run:** ✅ passed (412 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** Sends a comment POST without the bearer token. Asserts 401 and that the message contains 'authentication'. A non-existent post id is used, so no data is created.

**Open questions:**
- Auth is checked before the post is resolved, so the non-existent post id still yields 401. This follows the posts and users tests, but is not confirmed for the nested comments path.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### COMMENTS-TC-06 — GET - Should list only comments of the given post

**Covers:** COMMENTS-06 · **Priority:** P2 · **Confidence:** medium · **Run:** ✅ passed (3298 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** Creates two posts with one comment each. GET /comments?post_id=<first> must return exactly one comment, valid against Schema.COMMENTS, with the matching post_id and id. The second post proves other posts' comments are excluded.

**Open questions:**
- Does ?post_id filtering work reliably on GoREST, given its pagination and caching? The test uses fresh posts, so the expected length of 1 should be deterministic.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### COMMENTS-TC-07 — GET - Should return 404 for non-existent comment

**Covers:** COMMENTS-07 · **Priority:** P1 · **Confidence:** high · **Run:** ✅ passed (542 ms) · **Spec:** `tests/ai/comments.spec.ts`

**Rationale:** GET /comments/999999999 must return 404. Asserts the body message equals 'Resource not found'.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

### Reviewer checklist

<!-- ai-hitl:checklist -->
- [ ] Uses `ApiBuilder` via the `api` fixture (no raw `request.post(...)`)
- [ ] Responses validated with `shouldMatchSchema(Schema.X)` where a body is returned
- [ ] Created data is cleaned up in `afterEach`
- [ ] Assertions are meaningful (status + body content, not just "defined")
- [ ] No duplication with existing tests in `tests/`
- [ ] No sleeps, no hard-coded ids of shared GoREST data
<!-- /ai-hitl:checklist -->

### How to steer

- Comment `@claude <instruction>` on this PR (repo owner only) — Claude updates the specs and this
  proposal on the same branch; decisions of changed cases are reset.
- `edit`: change the test yourself in this PR, then tick `edit`. `accept` means the code is merged as generated.
- `reject`: delete the test from the spec and give a reason; add a coverage gap if nothing else covers it.
