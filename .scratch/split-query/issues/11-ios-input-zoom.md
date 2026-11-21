# 11: iOS 搜索框聚焦自动放大修复

**What to build:** 消除 iOS Safari 中点击搜索框时页面被强制放大的问题。放大后内容宽于视觉视口、可横向拖动，妨碍查看结果。根因：搜索框是 `src/main.ts` 中的 `textarea#search`，`src/styles.css` 给 `.search` 的字号是 14px，低于 iOS 的 16px 聚焦自动放大阈值。

**Blocked by:** None（可立即开始）

**Status:** open

- [x] `.search` 字号 14px → 16px（全局生效），并加注释说明 16px 是 iOS 自动放大阈值、不得下调
- [x] 不引入 `maximum-scale` / `user-scalable=no`，不禁用任何用户手势（双指缩放仍可用）
- [x] 不使用 JS focus 补丁；不添加 `overflow-x` 硬裁剪
- [x] 占位提示文案保持原样（属首用提示，不在本票范围）
- [x] `npm run check` 通过（本票不涉及纯 seam，无新增测试）
- [ ] **关键验收（真机）**：iPhone（iOS 16.1.1）上点击/聚焦搜索框，页面不放大、不发生横向漂移
- [ ] 真机确认双指缩放仍可用，结果区文字完整可读、横向不溢出

## 设计决定（2026-11-21 grilling）

- **只修根因**：用 16px 字号阻止 iOS 自动放大。`maximum-scale=1` 会连用户双指缩放一起禁掉，且 iOS 10+ 行为不稳定；JS focus 补丁有闪烁/键盘抖动，且与 `main.ts` 中多处 `search.focus()` 交互冲突。两者均不采用。
- **不加横向保险**：放大造成的横向拖动是「放大后视野平移」，`overflow-x` 管不到，只会掩盖将来真实的布局溢出。
- **范围限定**：不处理键盘弹起时的纵向遮挡（另议）；不改占位文案。
- **防回归**：CSS 注释 + `spec.md` 的「搜索框字号契约」；不加自动断言——Chromium 无法复现 iOS 放大，断言字号等于测实现而非测行为，违背「UI 薄胶水人工验证」的测试策略。

## 验证计划

- `npm run check`（构建与纯 seam 测试）。
- 用户在 iPhone 上通过局域网 `npm run dev`（`vite.config.ts` 已设 `server.host: true`，手机访问电脑的局域网 IP 即可；放大与字号无关 SW，dev 模式足够）或部署后人工确认上述两项真机验收。
