# Repo conventions (rules for generated tests)

These rules describe how the hand-written tests in `tests/` are built. Generated tests must look like
they were written by the same person.

## Structure
- One spec per resource: `tests/ai/<resource>.spec.ts`. Wrap all tests in one
  `test.describe('<RESOURCE> - AI generated', () => { ... })`.
- Import order like `tests/postUsers.spec.ts`:
  `import { test, expect } from '@fixtures/apiFixtures';`, `import '@utils/customMatchers';`,
  types with `import type { ... } from '@constants/...'`, then `Endpoint`, `Schema`, `logger`, `DataGenerator`.
- Path aliases from `tsconfig.json` only: `@fixtures/*`, `@utils/*`, `@constants/*`, `@schemas/*`. No relative `../../`.
- Test titles: `<METHOD> - Should <expected behaviour>` (e.g. `POST - Should fail with 422 when title is missing`).

## Requests — always through the `api` fixture (`ApiBuilder`)
- Never call `request.get/post/...` directly; never build URLs by hand with the base URL.
- Fluent chain: `api.path(Endpoint.X).params({...}).body({...}).postRequestJson<T>(201)`.
  Methods: `getRequest/getRequestJson<T>`, `postRequest/postRequestJson<T>`, `putRequest(Json)`,
  `patchRequest(Json)`, `deleteRequest`. The argument is the **expected status code** — the builder asserts it.
- Use the non-JSON variant (`postRequest(401)`) when you need headers or a non-typed body, then `await response.json()`.
- Call `.reset()` before every request after the first one in a test (the builder keeps state between calls).
- `.withoutAuth()` removes the bearer token (401 tests). The token comes from `GO_REST_API_TOKEN`; never print it.
- Endpoints come from `constants/Endpoint.ts` (`Endpoint.USERS`, `Endpoint.POSTS`, `Endpoint.COMMENTS`,
  `Endpoint.TODOS`); nested paths are built with template strings: `` `${Endpoint.USERS}/${userId}/posts` ``.

## Assertions
- Validate every returned resource body against a JSON schema: `await expect(body).shouldMatchSchema(Schema.X);`
  (note the `await`). Schemas live in `schemas/*.json` and are registered by file name in `constants/Schema.ts`.
  For a new resource add `<resource>Schema.json` (single object, `additionalProperties: false`) and
  `<resource>sSchema.json` (array with `"items": { "$ref": "<resource>Schema.json" }`), plus entries in `Schema`.
- Custom matchers (`utils/customMatchers.ts`, typed in `types/global.d.ts`): `shouldEqual`, `shouldContain`,
  `shouldBeValidEmail`, `shouldBeOneOf`, `shouldBeArray`, `shouldMatchSchema`. Prefer them over raw `toBe`
  for value checks; `toBeDefined`/`toBeGreaterThan` are fine for presence/size.
- Validation errors: GoREST returns `422` with `ErrorResponse[]` (`{ field, message }`). Validate with
  `Schema.ERROR`, then find the error for the field: `errors.find(e => e.field === 'title')` and check its message.
- 401 body: `{ message: 'Authentication failed' }`; 404 body: `{ message: 'Resource not found' }`.

## Test data and cleanup (GoREST is a shared public API with rate limits)
- Generate data with `DataGenerator` (`utils/dataGenerator.ts`), e.g. `DataGenerator.generateUser()`.
  For fields it does not cover (post title/body, todo title) use `faker` from `@faker-js/faker` inside the spec.
- Every created resource is cleaned up in `test.afterEach`, exactly like `tests/postUsers.spec.ts`:
  collect ids in an array during the test, delete them in `afterEach` with `api.reset().path(...).deleteRequest(204)`
  inside `try/catch` + `logger.warn(...)`, then empty the array. Deleting a user cascades to its posts,
  comments and todos, so deleting the parent user is enough.
- Keep tests small: create only what the test needs; no loops creating many records.
- No hard-coded ids of shared data (except obviously non-existent ids like `999999999` for 404/422 cases),
  no sleeps, no `test.only`, no conditionals in tests, no `console.log` (use `logger`).

## Types
- Response types for a new resource go into a new file `constants/<Resource>Types.ts`
  (e.g. `constants/PostTypes.ts` with `Post`, `CreatePostRequest`). Do not edit `constants/UserTypes.ts`.
- Request bodies passed to `.body()` must be `type` aliases or object literals (interfaces are not assignable
  to `RequestBody`).

## Tags (traceability — mandatory)
- Every test carries Playwright tags:
  `test('POST - Should ...', { tag: ['@ai-generated', '@req:POSTS-01', '@case:POSTS-TC-01'] }, async ({ api }) => { ... })`
- `@req:<ID>` for every requirement the case covers, `@case:<caseId>` exactly once.

## Do not touch
- Existing tests in `tests/*.spec.ts`, anything in `utils/`, `fixtures/`, `playwright.config.ts`, `package.json`.
- You may add files under `tests/ai/`, `schemas/` and `constants/`, and append entries to
  `constants/Endpoint.ts` / `constants/Schema.ts`.
