# HITL notes — branch `feat/ai-hitl`

Nothing has been pushed, no PRs were opened and no mutating GitHub API calls were made. Everything is local commits on
`feat/ai-hitl` (branched from `master` @ `172086f`).

## Repo conventions

The full rule set fed to the generator is `scripts/ai-hitl/prompts/conventions.md`. It is embedded verbatim
into `prompts/propose.md` and is the single source of truth. Summary of what I found in the code:

- **Structure.** One `test.describe` per spec. Fixtures come from `@fixtures/apiFixtures` (`test`, `expect`), and
  custom matchers are imported via `import '@utils/customMatchers'`. Imports use the tsconfig path aliases
  (`@constants/*`, `@utils/*`, `@fixtures/*`, `@schemas/*`). Two legacy specs import `'fixtures/apiFixtures'`
  without `@`; generated code uses the alias.
- **Requests.** Always go through the `api` fixture (`ApiBuilder`), as a fluent chain:
  `api.path(Endpoint.USERS).params({...}).body({...}).postRequestJson<User>(201)`. The argument is the
  expected status and the builder asserts it. Non-JSON variants (`getRequest(404)`, `postRequest(401)`) return
  the raw `APIResponse`. The builder is stateful, so `.reset()` comes before each additional request, and
  `.withoutAuth()` is used for 401 tests. The token is `Bearer ${GO_REST_API_TOKEN}` from `.env`.
- **Endpoints and schemas.** `constants/Endpoint.ts` (`USERS`, `POSTS`, `COMMENTS`, `TODOS` already exist) and
  `constants/Schema.ts` map names to `schemas/*.json` file names. `SchemaValidator` loads every `.json` in
  `schemas/` with AJV.
- **Assertions.** `await expect(body).shouldMatchSchema(Schema.X)`, plus `shouldEqual`, `shouldContain`,
  `shouldBeValidEmail`, `shouldBeOneOf` and `shouldBeArray` (typed in `types/global.d.ts`). 422 responses
  are `ErrorResponse[]`, checked with `Schema.ERROR` and `errors.find(e => e.field === 'x')`.
- **Data and cleanup.** `DataGenerator.generateUser()` and similar helpers (faker). Created ids are collected in
  an array and deleted in `test.afterEach` with `api.reset().path(...).deleteRequest(204)` inside
  `try/catch` + `logger.warn`, then the array is reset (`tests/postUsers.spec.ts`).
- **Titles.** `<METHOD> - Should <behaviour>` (`POST - Should fail with 422 when email is missing`). Smoke
  tests use free-form titles.
- **Logging.** `logger` (winston) only, no `console.log` (eslint `no-console: warn`).

## Done

| Step | Result | Command(s) |
| --- | --- | --- |
| 1 Housekeeping | README env var fixed. `@playwright/test` 1.48.0 → **1.65.1**. `typecheck` script added. 15 pre-existing `tsc` errors fixed (see Assumptions). `playwright.yml` writes `.env` as `KEY=value` | `npm run lint`, `npm run typecheck`, `npx playwright test` → 21/21 before and after the upgrade |
| 2 Requirements | `requirements/README.md` + `posts.md` (8), `comments.md` (7), `todos.md` (8), all checked against live GoREST. Parser: `scripts/ai-hitl/requirements.ts` | — |
| 3 Contract | `scripts/ai-hitl/schema.ts` (zod + coverage rule, unique caseIds, known IDs, specs under `tests/ai/`) | — |
| 4 Propose | `scripts/ai-hitl/propose.ts` + `prompts/propose.md`, `conventions.md`, `fix.md` | `npm run ai:propose -- --req requirements/posts.md [--no-run] [--model m] [--max-turns 30] [--mock]` |
| 5 Revise | `scripts/ai-hitl/revise.ts` + `prompts/revise.md` (local Claude, `--mock`, or `--finalize` after claude-code-action) | `npm run ai:revise -- --proposal <id> --instruction "..." [--mock]` |
| 6 PR body + gate | `render-pr.ts`, `gate.ts`, `.github/pull_request_template/ai-proposal.md` | `npm run ai:render -- --proposal <id>`, `npm run ai:gate -- --body-file <f> --proposal <id>` |
| 7 Workflows | `ai-propose.yml`, `ai-revise.yml`, `ai-gate.yml`, `ai-metrics.yml`. **actionlint 1.7.7: clean** (binary run from a temp dir, not installed) | — |
| 8 Metrics + trace | `metrics.ts` → `ai/metrics/hitl-log.jsonl`, `traceability.ts` → `docs/TRACEABILITY.md` | `npm run ai:metrics -- --proposal <id> --body-file <f>`, `npm run ai:trace` |
| 9 Verifiable | 36 unit tests (`node:test` + `tsx`). Full mock flow committed for posts: propose (8/8 green on live GoREST) → revise (TC-06 only) → review (6 accept, 1 edit, 1 reject) → gate **passed** → metrics → trace | `npm run test:unit` |
| 10 Docs | `docs/ai-hitl.md` (with mermaid), README section | — |

Final state: `npm run lint` ✅, `npm run typecheck` ✅, `npm run test:unit` ✅ 36/36, `npx playwright test` ✅ 28/28
(21 legacy + 7 reviewed AI tests).

The committed example run is in `ai/proposals/posts-20261121-2254/`:
`proposal.json`, `generated/posts.spec.ts` (AI baseline after the revision), `run.json`, `pr-body.md` (as the AI
rendered it) and `review/pr-body.reviewed.md` (simulated human review).

Metrics for it: 8 cases, 6 accepted as-is, 1 edited (4 lines), 1 rejected, 1 revision, 0 mismatches.

## Not done / blocked

- **The real Claude call was not executed.** `ANTHROPIC_API_KEY` is not set on this machine, so the
  `claude -p` path (prompting, retry, fix attempt) is implemented but untested end to end. The committed proposal comes from
  `--mock` with a recorded fixture (`scripts/ai-hitl/__fixtures__/propose-posts.json`) that Claude Code wrote
  in this session following `prompts/propose.md`. It is labelled `claude-opus-5-5 (recorded fixture)` in the
  proposal. First real run: `export ANTHROPIC_API_KEY=… && npm run ai:propose -- --req requirements/comments.md`
  (or set `AI_HITL_ALLOW_CLAUDE_LOGIN=1` to reuse a local `claude` login).
- **The workflows have not been executed.** They pass actionlint only. Two points need a real-repo check:
  whether `anthropics/claude-code-action@v1` in automation mode (`prompt` + `claude_args`) honours
  `--allowedTools` as written, and whether it leaves stray files that `revise --finalize` would flag.
- shellcheck was not available, so actionlint ran without shell-script linting.
- No proposals were generated for `comments` and `todos`. They show 0 % coverage in `docs/TRACEABILITY.md` on
  purpose; they are the natural first real run.

## Assumptions

1. **Case ↔ test mapping.** Besides the required `@ai-generated` and `@req:<ID>` tags, every generated test carries
   `@case:<caseId>`. Titles get edited, and several cases can cover one requirement, so neither is a stable key
   for per-case results and metrics.
2. **`constants/UserTypes.ts` `interface UserData` → `type UserData`.** This is the only change to an existing
   file outside the "append" rule. It fixes all 15 pre-existing `tsc` errors (interfaces aren't assignable to
   `RequestBody = Record<string, unknown>`). It's types only, with no runtime effect, and no test was touched.
   Without it, `typecheck` could never be green.
3. **`.github/workflows/playwright.yml` `.env` fix.** The task only asked to reuse the approach with
   `KEY=value`. The existing file wrote `KEY: value` with indentation, which dotenv ignores, so CI ran without a
   token. I fixed it in the same way.
4. **Simulated review.** The task says "accept 2, edit 1, reject 1", which assumes a 4-case proposal. The proposal has
   8 cases, so the review is 6 accept, 1 edit, 1 reject: the full set must be decided for the gate to pass.
5. **Gate is stricter than specified.** It also fails when a rejected case's test is still in the spec, when
   an accepted or edited automated case has no test, and on `@req:` tags for unknown IDs. Tag rules are checked
   per test, not per file.
6. **Human-added coverage gaps.** If the reviewer rejects the only case of a requirement, they add a gap line
   in the PR body (between the gap markers). The gate takes the union of AI gaps and PR-body gaps.
7. **Revisions reset decisions.** A case's decision is reset when its test code changes (normalised line diff) or
   when its title, covers, priority, automate or specFile changes. Rationale-only edits keep the decision. After a
   revision, the snapshot in `generated/` becomes the new AI baseline.
8. **Metric counting.** Counts are by *declared* decision. `avgEditedLines` averages over cases declared
   `edit`. Mismatches are reported separately. Re-running metrics for the same proposal is a no-op unless you pass
   `--replace`.
9. **Test results.** Test failures in a proposal do not fail `ai:propose`: they are shown in the PR for the
   human to decide. Invalid JSON or failing lint, typecheck or tag checks do fail it.
10. **Model default** is `claude-sonnet-5-5` (`AI_MODEL` / `--model` override).
11. **POSTS-08 (ordering) is a deliberate coverage gap.** It shows that the gap mechanism works and is a
    defensible call on a shared API.
12. **Unit-test runner.** `node --import tsx --test` (lighter than a second Playwright project). `tsx` was
    added as a dev dependency alongside `zod`; the task's note about `node:test + tsx` implies it is allowed.
    The `claude` CLI is not a dependency: CI installs it with `npm i -g`, and locally it is already installed.
13. **ESLint.** I added two overrides: `no-console` off for `scripts/**`, and for the tooling's unit tests
    `no-floating-promises` plus one Playwright rule off (`node:test` `test()` returns a promise by design).

## Things I noticed (not changed)

- `.env` contains `CI=…`. Any non-empty string, including `false`, makes `process.env.CI` truthy in
  `playwright.config.ts`, so local runs get `retries: 2`, `forbidOnly` and 3 workers.
- `getUsers.spec.ts › GET - Should handle pagination correctly` compares pages of the **global** user list. It
  flakes when other tests create users in parallel, which became more likely with the generated tests
  (observed once: 1 failure, then green on rerun).
- `schemas/errorSchema.json` is `type: array` with object keywords at the top level. AJV strict mode warns
  about it on every run and the schema validates only "is an array". It deserves a `items: {…}` fix in a separate PR.

## Review first

1. `scripts/ai-hitl/gate.ts`: the rules that block merges.
2. `scripts/ai-hitl/propose.ts` + `scripts/ai-hitl/lib/claude.ts`: the Claude call, tool allow-list and guard rails.
3. `.github/workflows/ai-revise.yml`: owner-only trigger, BOT_TOKEN usage, claude-code-action inputs.
4. `scripts/ai-hitl/prompts/conventions.md`: the rules the generator must follow.
5. `ai/proposals/posts-20261121-2254/review/pr-body.reviewed.md` + `tests/ai/posts.spec.ts`: what a
   reviewed proposal looks like.

## Morning checklist for the human

1. Look through the commits: `git log --oneline master..feat/ai-hitl`.
2. Push the branch: `git push -u origin feat/ai-hitl`.
3. Add repo secrets (Settings → Secrets and variables → Actions):
   - `ANTHROPIC_API_KEY`
   - `GO_REST_API_TOKEN`
   - `BOT_TOKEN`: a fine-grained PAT scoped to this repo with **Contents: Read and write** and **Pull requests:
     Read and write**.
   - Optional variable `AI_MODEL`.
4. Create the labels `ai-generated` and `needs-human-review`.
5. Branch protection on `master`: require a PR, 1 approving review (dismiss stale approvals), required status
   check `ai-gate`. Either let the BOT_TOKEN user bypass for the metrics commit, or accept the `chore/hitl-metrics` PRs.
6. Open the PR `feat/ai-hitl` → `master`. Note that its own diff contains an `ai-generated` proposal, but the PR
   itself has no label, so `ai-gate` will be skipped.
7. First real run: after merging, run *Actions → ai-propose → Run workflow* with `requirements/comments.md`
   (try `mock: true` first to test the wiring), or push a change to `requirements/todos.md`.
