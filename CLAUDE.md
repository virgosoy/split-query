# CLAUDE.md

## Project

- **Spec & tickets**: `.scratch/split-query/spec.md`（构建契约）；tickets 在 `.scratch/split-query/issues/`（每档含 `Status:`）。
- **Backlog**: `draft.md`（最初想法 + 暂不做的后续清单；新想法先记这里，别散落在对话里）。
- **Architecture**: `docs/adr/0001-local-first-runtime-import.md`（运行时导入，文件是唯一真源）。
- **Testing policy**: 只有四个纯 seam `src/lib/parse.ts`、`src/lib/query.ts`、`src/lib/format.ts`、`src/lib/order.ts` 有自动化测试；UI 与 IndexedDB 是薄胶水，人工验证。
- **UI check**: `node scripts/verify-quick-input.mjs`（手动，不进 CI）覆盖工具栏按钮、文本改写与锚点语义；导入数据固定用 `scripts/fixtures/ui-quick-input.txt`（`draft/demo.txt` 只是手工样本）。
- **Integration check**: `npm run smoke` 覆盖离线承诺（一次在线后断网仍可用）与 SW 更新管线不变量（版本注入、完整预缓存、`SKIP_WAITING`、无无条件 `skipWaiting`）——这是唯一一条跨层的自动检查，改动 `sw.js` / 构建脚本 / 构建产物时先跑它。驱动浏览器用 `scripts/browser.mjs`；不要用 `--dump-dom` 读结果区，它不等 IndexedDB。
  - smoke 的浏览器阶段失败时，先修 `scripts/browser.mjs`（它属于检查本身），不要另写临时驱动绕过；修好后用 `npm run smoke` 复验。

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
