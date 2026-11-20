# CLAUDE.md

## Project

- **Spec & tickets**: `.scratch/split-query/spec.md`（构建契约）；tickets 在 `.scratch/split-query/issues/`（每档含 `Status:`）。
- **Architecture**: `docs/adr/0001-local-first-runtime-import.md`（运行时导入，文件是唯一真源）。
- **Testing policy**: 只有两个纯 seam `src/lib/parse.ts`、`src/lib/query.ts` 有自动化测试；UI 与 IndexedDB 是薄胶水，人工验证。

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
