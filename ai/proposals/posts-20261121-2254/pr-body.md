<!-- ai-hitl:proposal=posts-20261121-2254 -->
## 🤖 AI test proposal `posts-20261121-2254` — needs human review

> **AI proposes, a human decides.** Tick exactly one decision per case below. The `ai-gate` check stays red
> until every case has a decision and every requirement is covered or listed as a gap.

### Summary

| | |
| --- | --- |
| Requirement file | `requirements/posts.md` (8 requirements) |
| Model | `claude-opus-5-5 (recorded fixture)` |
| Created | 2026-11-21T22:54:09.177Z |
| Cases | 8 (8 automated) |
| Run | 8 passed — 2026-11-21T22:54:30.897Z |
| Coverage gaps | 1 |
| Revisions | 1 |

### Traceability

| Requirement | Priority | Case(s) | Run status |
| --- | --- | --- | --- |
| **POSTS-01** An authenticated client can create a post for an existing user via /users/{id}/posts; response 201 contains id, user_id, title, body and echoes the submitted title and body. | P0 | POSTS-TC-01, POSTS-TC-08 | ✅ passed, ✅ passed |
| **POSTS-02** Creating a post without title returns 422 with a field error for "title". | P1 | POSTS-TC-02 | ✅ passed |
| **POSTS-03** Creating a post for a user id that does not exist returns 422 with a field error for "user". | P1 | POSTS-TC-03 | ✅ passed |
| **POSTS-04** Creating a post without an Authorization header returns 401 with a message. | P0 | POSTS-TC-04 | ✅ passed |
| **POSTS-05** GET /posts/{id} returns 200 with the post matching the post schema. | P1 | POSTS-TC-05 | ✅ passed |
| **POSTS-06** GET /posts/{id} for a non-existent id returns 404 with a message. | P1 | POSTS-TC-06 | ✅ passed |
| **POSTS-07** GET /users/{id}/posts returns only posts whose user_id equals that user. | P2 | POSTS-TC-07 | ✅ passed |
| **POSTS-08** GET /posts returns the newest posts first (descending id order). | P2 | — | ⚠️ coverage gap |

### Coverage gaps

Requirements intentionally left without a test. If you reject the only case of a requirement, add a line
here in the same format (`- **POSTS-05** — reason`), otherwise the gate fails.

<!-- ai-hitl:gaps -->
- **POSTS-08** — Ordering of the global /posts list cannot be asserted deterministically on a shared public API with concurrent writers; recommend a contract test against a private GoREST instance.
<!-- /ai-hitl:gaps -->

### Revisions

- 2026-11-21T22:54:28.817Z by @dem7x: POSTS-TC-06: also assert the exact 404 message "Resource not found".

### Decisions

Tick **exactly one** box per case. `reject` needs a reason after `reason:`.
Decisions were reset for cases changed by the last revision: POSTS-TC-06.

#### POSTS-TC-01 — POST - Should create post for existing user

**Covers:** POSTS-01 · **Priority:** P0 · **Confidence:** high · **Run:** ✅ passed (1610 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Creates a fresh user, posts to /users/{id}/posts and checks 201, the post schema, user_id and that title/body are echoed.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-02 — POST - Should fail with 422 when title is missing

**Covers:** POSTS-02 · **Priority:** P1 · **Confidence:** high · **Run:** ✅ passed (2188 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Sends only a body for an existing user and expects a 422 error list containing field "title".

**Open questions:**
- Should the test also pin the exact message ("can't be blank")? It is GoREST wording and may change.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-03 — POST - Should fail with 422 when user does not exist

**Covers:** POSTS-03 · **Priority:** P1 · **Confidence:** high · **Run:** ✅ passed (489 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Posts to /posts with user_id 999999999 and expects 422 with field "user" / "must exist". No data is created.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-04 — POST - Should fail with 401 when unauthorized

**Covers:** POSTS-04 · **Priority:** P0 · **Confidence:** high · **Run:** ✅ passed (1034 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Same request without the bearer token; expects 401 and an "Authentication failed" message. Auth is checked before the user lookup, so no user is needed.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-05 — GET - Should retrieve post by ID

**Covers:** POSTS-05 · **Priority:** P1 · **Confidence:** high · **Run:** ✅ passed (2673 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Creates a post, reads it back via /posts/{id} and compares the whole object plus schema.

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-06 — GET - Should return 404 for non-existent post

**Covers:** POSTS-06 · **Priority:** P1 · **Confidence:** high · **Run:** ✅ passed (1127 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** GET /posts/999999999 must return 404 with the exact GoREST message "Resource not found" (pinned at the reviewer's request).

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-07 — GET - Should list only posts of the given user

**Covers:** POSTS-07 · **Priority:** P2 · **Confidence:** medium · **Run:** ✅ passed (2949 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Creates two posts for a fresh user and expects exactly those two from /users/{id}/posts (fresh user = deterministic list).

**Open questions:**
- Two POSTs per run on a rate-limited shared API — is one post enough for this requirement?

- [ ] accept
- [ ] edit
- [ ] reject — reason:

#### POSTS-TC-08 — POST - Should create post via /posts with user_id in body

**Covers:** POSTS-01 · **Priority:** P0 · **Confidence:** medium · **Run:** ✅ passed (1675 ms) · **Spec:** `tests/ai/posts.spec.ts`

**Rationale:** Covers the alternative endpoint from the requirement header (/posts with user_id in the body).

**Open questions:**
- Is the /posts variant worth a separate test, or is TC-01 enough for POSTS-01?

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
