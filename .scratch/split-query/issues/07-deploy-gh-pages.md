# 07: 部署到 GitHub Pages

**What to build:** GitHub Actions 工作流：push 至主干后 `npm ci` → `npm test` → `npm run build`，用官方 Pages artifact 流程将 `dist` 发布到 GitHub Pages（`username.github.io/repo`）。前提：仓库 Settings → Pages → Source 设为 “GitHub Actions”。

**Blocked by:** 06

**Status:** resolved——构建与部署配置完成；(b) 上线验收待在真实 GitHub 仓库部署后人工确认

- [x] Actions 工作流（build + 发布 Pages artifact）
- [ ] 部署后页面可访问且 PWA 可安装离线（需真实仓库，本地无远端无法验证）
