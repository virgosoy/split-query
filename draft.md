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
- [x] feat：首词为“地址”的 item，找到其每一行为 url 地址的行。在其他非首词为“地址”的 item 中，如果其中的 url 的前缀（`http[s]://host[:port]/`）这部分如果和 “地址” item url 行的前缀匹配上，那么增加一个功能，该 url 可以选择使用匹配到的 “地址” item 的其他 url 行前缀去替换并打开。
  - 设计已定稿（2026-11-25 grilling）→ 票 `17`；决定记在 `.scratch/split-query/spec.md` 的「v1.1 追加」
  - 开关位置先按 T3（结果区上方单独一行紧凑开关，仅当全部条目中至少一条非地址条目的链接能获得替代时出现）；若 T3 实测不合适，后备 T2 = 把现有「存储」按钮改为 ⚙「设置」浮层、开关放进浮层（不增顶栏占用，但要给现有入口改名、改规格）
  - 开关状态按 P2 存 `localStorage`（默认开），资源空间面板暂不统计（见下方后续项）
  - 实现完成（2026-11-25）：票 17 本地 CDP 验收通过；iPhone 14 / iOS 16.1.1 真机验收待做
- [x] 优化：如果 地址 item 的 url 中含有空格，解析会有问题，空格后面其实是描述，但被当成url的一部分
  - 设计已定稿（2026-11-25 grilling）→ 票 `18`；决定记在 `.scratch/split-query/spec.md` 的「v1.1 追加」
  - 实现完成（2026-11-25）：票 18 本地 CDP 验收通过；iPhone 14 / iOS 16.1.1 真机验收待做

## 由「地址前缀替换」这一轮引出的后续（2026-11-25 记录）

- [-] feat: 资源空间面板统计偏好数据（`localStorage`）。**2026-11-25 决定不做**：这份偏好最多 35 B（key 32 B + 值 `off` 3 B），默认开时键不存在、即 0 B；为它新增第三个桶要同时改 spec 的桶数契约、`GLOSSARY` 的「三个数」、面板说明与验收面，收益只有几 B，不划算。面板继续不统计它（`spec.md` 的两处口径已改为「不统计」）

## 由「资源空间」这一轮引出的后续功能（v1 不做，2026-11-20 记录）

- [ ] feat: 清除本地数据 / 缓存（文件是唯一真源，删掉后重新导入即可恢复）。待定：删哪个桶、删完界面状态怎么收回、要不要二次确认
- [ ] feat: 导出 / 备份本地副本（把 IndexedDB 里的条目导回文本文件，与「文件是真源」互补）
- [ ] feat: 面板里给「查看 / 清理系统站点数据」的引导。需要先核实 iOS 16.1 上真实可达的路径，不能凭空写文案
- [ ] fix: 最近搜索只在内存里（`src/main.ts` 的 `recent` 数组未落盘），刷新即失 —— 不是本轮范围，读代码时发现的真实缺口
- [ ] fix（低优先，未开票）: 「应用资源」会把同 origin 兄弟站的缓存算进来。Cache Storage 按 origin 共享——在同一个浏览器数据存储里访问过 `virgosoy.github.io/git-md-pwa` / `hapi-ios` 后，它们的 Workbox 缓存会出现在 split-query 的 `caches.keys()` 里（2026-11-25 合成实测外来 13,929,184 B，而本应用仅 34,931 B；本机实际 34.1 KB 不复现）。修法：只统计 `split-query-` 前缀的 cache；但需先核实 iOS 主屏 App 与 Safari 是否共享数据存储，并考虑票 08「不硬编码缓存名」的决定
- [ ] feat: 系统配额 / 已用（`navigator.storage.estimate()` 的 `usage` / `quota`）—— iOS 16.1 上此 API 不存在（落在 Safari 17 / iOS 17：MDN BCD `api/StorageManager.json` `version_added: "17"`，WebKit 的 Safari 17 beta 公告列为 "newly supported"）。将来升到 iOS 17 后可直接读出「已用 / 上限」，届时给面板加一行；v1 不写这段探测分支（在目标设备上永远不渲染 = 无法人工验证 = 负债）
- [-] fix: 预热 URL 去重（同一 URL 在 warmup 列表出现两次——favicon 与 manifest 都指向 `icon-192.png`；per-URL `cache.add` 会重复请求，旧 `cache.addAll` 会因 `InvalidStateError: duplicate requests` 整批失败）。2026-11-21 retro 发现；2026-11-22 票 12 删除 warmup 后本项作废

## 由「随机排序」这一轮引出的后续（2026-11-22 记录）

- [x] fix: `scripts/browser.mjs` 的 `waitForPageTarget` 用 `child.exitCode !== null` 判死；本机 Chrome 157 / Edge 会把启动器进程甩掉（父进程 `code=0` 退出、浏览器继续运行），导致 `npm run smoke` 的浏览器阶段与人工 CDP 验证都无法启动。2026-11-22 已修：继续轮询 DevTools 目标、超时后再连同退出码报告；`close()` 先发 `Browser.close` 再等文件句柄释放，避免 `child.kill()` 落空留下无头进程。`npm run smoke` 全链路通过。

## 由「关键词锚点快捷按钮」这一轮引出的后续（2026-11-23 记录）

- [ ] feat: 自动补全支持字段前缀——在 `k:` / `h:` / `k^:` 等算子之后仍给出候选词，点选只替换值部分（如 `k^:v` 点选得到 `k^:vue`）。票 15 未做：这是所有算子按钮共有的既有行为，改动会扩大验收面（前缀解析、裸词、`!`、全角冒号），值得单独一票。

## 新想法（2026-11-25 记录）

- [x] feat: 排序支持「文件倒序」排列
  - 设计已定稿（2026-11-25 grilling）→ 票 `19`；决定记在 `.scratch/split-query/spec.md` 的「v1.1 追加（2026-11-25）：文件倒序」
  - 只反转条目整体顺序；下拉三项 `文件顺序 / 文件倒序 / 随机`；会话内视图状态（刷新回文件顺序），重新导入保持选择
  - 实现完成（2026-11-25）：`npm run check` 通过（126 tests）；本地 CDP 文件倒序场景通过；iPhone 真机验收待做