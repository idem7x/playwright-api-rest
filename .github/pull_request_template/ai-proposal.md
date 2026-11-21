<!--
  Reference copy of the AI proposal PR body. The real body is rendered per proposal by
  scripts/ai-hitl/render-pr.ts (npm run ai:render -- --proposal <id>) and parsed by
  scripts/ai-hitl/gate.ts — keep the markers and the decision line format unchanged.
-->
<!-- ai-hitl:proposal=<resource>-YYYYMMDD-HHmm -->
## 🤖 AI test proposal `<id>` — needs human review

### Summary
Requirement file, model, number of cases, run results, coverage gaps, revisions.

### Traceability
| Requirement | Priority | Case(s) | Run status |
| --- | --- | --- | --- |

### Coverage gaps
<!-- ai-hitl:gaps -->
- **POSTS-08** — reason
<!-- /ai-hitl:gaps -->

### Decisions
#### POSTS-TC-01 — POST - Should create post for existing user
**Covers:** POSTS-01 · **Priority:** P0 · **Confidence:** high · **Run:** ✅ passed

**Rationale:** …

**Open questions:** …

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
Comment `@claude <instruction>` on the PR (repo owner only).
