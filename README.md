# Playwright API Testing Framework

A TypeScript-based API testing framework using Playwright for testing REST APIs with schema validation and comprehensive test coverage.

## Features

- TypeScript with full type safety
- JSON schema validation using AJV
- Complete CRUD operations testing
- Bearer token authentication
- Reusable test helpers and utilities
- ESLint code quality checks

## Installation

```bash
npm install
npx playwright install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Get your access token from [GoREST](https://gorest.co.in/)
3. Add token to `.env`:

```env
GO_REST_API_TOKEN=your_token_here
LOG_LEVEL=info
CI=false
```

## Running Tests

```bash
npm test               # Run all tests
npm run test:ui        # Interactive UI mode
npm run report         # View test report
```

## Project Structure

```
├── constants/         # App constants
├── fixtures/          # Test fixtures
├── schemas/           # JSON validation schemas
├── tests/             # Test specifications (tests/ai/ = AI-generated, human-reviewed)
├── types/             # TypeScript types
├── utils/             # Helpers and API client
├── requirements/      # Requirement IDs per resource (input for AI proposals)
├── scripts/ai-hitl/   # Propose / revise / gate / metrics / traceability tooling
├── ai/                # Proposals, snapshots, run results, HITL metrics log
└── docs/              # HITL design + generated traceability matrix
```

## Test Coverage

- **Authentication**: Token validation, authorization headers
- **GET**: Retrieve users, pagination, filtering
- **POST**: Create users, validation, error handling
- **PUT**: Update users, partial updates
- **DELETE**: Delete users, idempotency

## Key Components

**API Builder** (`utils/apiBuilder.ts`):
```typescript
await api
    .path(Endpoint.USERS)
    .params({ page: 1, per_page: 10 })
    .getRequestJson<User[]>(200);;
```

**Schema Validator** (`utils/schemaValidator.ts`):
```typescript
const validation = validator.validate(userSchema, responseData);
```

## AI-assisted test generation with human review

Requirements live in `requirements/*.md` with stable IDs (`POSTS-01`). On push, Claude proposes test cases and
Playwright specs (`tests/ai/`, tagged `@ai-generated @req:<ID>`) and opens a draft PR. The repo owner can steer it
with `@claude <instruction>` comments. A human records one decision per case (accept / edit / reject + reason), and
the required `ai-gate` check blocks the merge until every case is decided and every requirement is covered or listed
as a gap. After the merge, the declared decisions are compared with the code that actually changed and logged to
`ai/metrics/hitl-log.jsonl`.

```bash
npm run ai:propose -- --req requirements/posts.md --mock   # try it without an API key
npm run test:unit                                          # tests of the tooling
```

Details: [docs/ai-hitl.md](docs/ai-hitl.md) · Coverage: [docs/TRACEABILITY.md](docs/TRACEABILITY.md)

## License

ISC
