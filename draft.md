做一个程序，不需要服务器，在 github page 上发布
自己使用，有 github 账号，ios 上使用，做成 pwa 可离线
读取文件 app 中的文件，此文件按空行分割项，每项有多行，第一行可以用空格隔开多个词，其他行可能包含 url 连接。
可以按一定的搜索语法去搜出这些项，并且可以快捷的输入这些语法。

❯ 对了，我的iphone是14，ios 版本是 16.1.1 ，短期内不会更新，这个有影响吗？

- [x] feat: 显示此程序占用的资源空间
  - 设计已定稿（2026-11-21 grilling）→ 票 `08`（面板）、`09`（空态首用提示）；决定记在 `.scratch/split-query/spec.md` 的「v1.1 追加」
  - 原「主屏豁免提示」并入 09 的空态首用句：依据 WebKit 官方说明（主屏 web app 不属于 Safari、不受 7 天 script-writable storage 清理），**无条件陈述、不做检测**（不读 `navigator.standalone`；`(display-mode: standalone)` 在该场景下反而是坏的——BCD 标注 false/fullscreen、bug 264218，绝不使用）
- [x] 优化：ios 中点击搜索框时，会自动放大页面，导致横向内容超出页面了，不利于查看结果。
- [x] feat：更新提示与手动更新功能
  - 设计已定稿（2026-11-22 grilling）→ 票 `12`（SW 更新管线）、`13`（更新提示 UI）；决定记在 `docs/adr/0002-prompt-mode-updates.md` 与 `.scratch/split-query/spec.md` 的「v1.1 追加」
  - 实现完成（2026-11-22）：票 12、13 均已 resolved；本地 CDP 全链路验收通过，iPhone 14 / iOS 16.1.1 真机验收待做
- [x] feat: 按需随机排序（结果区排序下拉：文件顺序 / 随机 + 换一批）
  - 设计已定稿（2026-11-22 grilling）→ 票 `14`；决定记在 `.scratch/split-query/spec.md` 的「v1.1 追加」
  - 实现完成（2026-11-22）：票 14 本地 CDP 验收通过；iPhone 14 / iOS 16.1.1 真机验收待做

## 由「资源空间」这一轮引出的后续功能（v1 不做，2026-11-20 记录）

- [ ] feat: 清除本地数据 / 缓存（文件是唯一真源，删掉后重新导入即可恢复）。待定：删哪个桶、删完界面状态怎么收回、要不要二次确认
- [ ] feat: 导出 / 备份本地副本（把 IndexedDB 里的条目导回文本文件，与「文件是真源」互补）
- [ ] feat: 面板里给「查看 / 清理系统站点数据」的引导。需要先核实 iOS 16.1 上真实可达的路径，不能凭空写文案
- [ ] fix: 最近搜索只在内存里（`src/main.ts` 的 `recent` 数组未落盘），刷新即失 —— 不是本轮范围，读代码时发现的真实缺口
- [ ] feat: 系统配额 / 已用（`navigator.storage.estimate()` 的 `usage` / `quota`）—— iOS 16.1 上此 API 不存在（落在 Safari 17 / iOS 17：MDN BCD `api/StorageManager.json` `version_added: "17"`，WebKit 的 Safari 17 beta 公告列为 "newly supported"）。将来升到 iOS 17 后可直接读出「已用 / 上限」，届时给面板加一行；v1 不写这段探测分支（在目标设备上永远不渲染 = 无法人工验证 = 负债）
- [x] fix: 预热 URL 去重（同一 URL 在 warmup 列表出现两次——favicon 与 manifest 都指向 `icon-192.png`；per-URL `cache.add` 会重复请求，旧 `cache.addAll` 会因 `InvalidStateError: duplicate requests` 整批失败）。2026-11-21 retro 发现；2026-11-22 票 12 删除 warmup 后本项作废

## 由「随机排序」这一轮引出的后续（2026-11-22 记录）

- [x] fix: `scripts/browser.mjs` 的 `waitForPageTarget` 用 `child.exitCode !== null` 判死；本机 Chrome 157 / Edge 会把启动器进程甩掉（父进程 `code=0` 退出、浏览器继续运行），导致 `npm run smoke` 的浏览器阶段与人工 CDP 验证都无法启动。2026-11-22 已修：继续轮询 DevTools 目标、超时后再连同退出码报告；`close()` 先发 `Browser.close` 再等文件句柄释放，避免 `child.kill()` 落空留下无头进程。`npm run smoke` 全链路通过。