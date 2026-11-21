# 09: 空态首用提示（主屏使用建议）

**What to build:** 从未导入过时的空态文案补一句使用方式建议：建议从主屏图标进入——离线可用，且数据不受 Safari 的 7 天清理限制。事实依据是 WebKit 官方说明（主屏 web app 不属于 Safari、有自己的使用天数计数，不受 7 天 script-writable storage 清理影响），因此**无条件陈述、不做任何检测**。

**Blocked by:** None（可立即开始）

**Status:** resolved

- [x] 空态文案补一句主屏使用建议，措辞与既有风格一致（与"点击「导入文件」选择你的文本文件"同屏）
- [x] **不引入任何检测分支**：不读 `navigator.standalone`（非标准，无 MDN 页、无 BCD 行，且主屏启动时读它反而会把这句唯一必经的提醒抑制掉），更不用 `(display-mode: standalone)`（在该场景下反而为 false/fullscreen）——已核 `src/` 中无 `standalone` / `display-mode` / `matchMedia`
- [x] 手工验证：全新存储（未导入过）下空态可见该句；导入后空态不再出现 —— 已用无头 Chrome（CDP、全新 profile）实测：空态逐字含新句；向 IndexedDB 注入 2 条目后重载，走 `init()→loadItems()→applyItems()` 同一路径，空态消失、渲染 2 张卡片、顶栏「2 条目」。iOS/Safari 上的观感仍随票 07 的真机验收一并确认

## 实现说明

文案定为：`点击「导入文件」选择你的文本文件（按空行切分条目）。建议添加到主屏后从图标进入：离线可用，且数据不受 Safari 的 7 天清理限制。`

在票面「建议从主屏图标进入」的基础上补了「**添加到主屏后**」四个字。理由：首用的真实场景正是"还没装、正在 Safari 标签页里看"——而这句提示的全部价值就是预防，若不提"添加到主屏"，它对**还没有图标的人**（也就是唯一会看到它的人）等于没说。

- `src/main.ts` 仅改一处字符串字面量，未动结构、未加分支、未加事件。
- `npm run check` 通过（tsc 无错 + 39 测试全绿，数量未变：本票不碰纯 seam）。
- `npm run build` 后构建产物中含该句（已核对 `dist/assets/index-*.js`）。
