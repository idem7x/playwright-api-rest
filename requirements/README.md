# Requirements format

Each file in this folder describes **one GoREST resource**. Humans write and commit these files;
pushing a change to `master` triggers the AI proposal workflow (`.github/workflows/ai-propose.yml`).
`README.md` itself is ignored by the tooling.

The format is strict because `scripts/ai-hitl/requirements.ts` parses it:

```md
# POSTS — User posts API
Endpoint: /posts  (also /users/{id}/posts)

## Requirements
- **POSTS-01** (P0): An authenticated client can create a post ...
- **POSTS-02** (P1): Creating a post without title returns 422 ...
```

Rules:

| Element | Rule |
| --- | --- |
| File name | `<resource>.md`, lowercase (`posts.md`). The resource name is the file name. |
| Title line | `# <RESOURCE> — <description>`. `<RESOURCE>` is the upper-case resource name. |
| Endpoint line | `Endpoint: <primary path>`, optionally followed by `(also <path>, <path>)`. |
| Section | Requirements are listed under `## Requirements`. Other sections (`## Notes`, …) are free text and ignored. |
| Requirement line | `- **<RESOURCE>-NN** (P0\|P1\|P2): <text>` on a single line. |
| IDs | Unique, prefix = resource in upper case, two digits (`POSTS-01`). **Never renumber or reuse an ID** — tests reference it via `@req:POSTS-01` tags and the traceability matrix tracks it over time. Retire a requirement by deleting the line, add new ones with the next free number. |
| Priority | `P0` = must never break, `P1` = important behaviour/validation, `P2` = nice to have. |

Write requirements as observable API behaviour (status code + what the body contains), not as test steps.
GoREST v2 returns `422` with a body `[{ "field": "...", "message": "..." }]` for validation errors,
`401 {"message":"Authentication failed"}` without a valid token and `404 {"message":"Resource not found"}`
for unknown ids.
