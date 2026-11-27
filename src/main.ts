import './styles.css';
import { buildHeadVocabulary, buildQuery, buildVocabulary, type VocabEntry } from './lib/query';
import { completions, editSearchText, FIELD_OPS, type FieldOp } from './lib/search-text';
import { parseFile, splitUrlLine, type Item } from './lib/parse';
import {
  alternativesFor,
  buildAddressPool,
  isAddressItem,
  type AddressPool,
  type AlternativeLink,
} from './lib/address';
import { reverse, shuffle } from './lib/order';
import { loadItems, saveItems } from './lib/storage';
import { formatBytes } from './lib/format';
import { APP_VERSION } from './version';
import { initUpdates } from './update';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

const fieldOpButtons = FIELD_OPS.map(
  ({ op, label }) => `<button class="op" data-op="${op}" type="button">${label}</button>`,
).join('\n    ');

app.innerHTML = `
  <header class="topbar">
    <h1 class="brand">split-query</h1>
    <button id="import-btn" class="btn" type="button">导入文件</button>
    <input id="file-input" type="file" accept=".txt,text/plain" hidden />
    <button id="usage-btn" class="btn" type="button">存储</button>
    <button id="update-btn" class="update-btn" type="button" aria-label="检查更新" hidden>
      <span aria-hidden="true">↻</span>
      <span id="update-dot" class="update-dot" aria-hidden="true" hidden></span>
    </button>
    <span id="count" class="count"></span>
  </header>
  <textarea id="search" class="search" rows="2" inputmode="search" autocomplete="off"
    placeholder="搜索：同行空格 AND · 换行 OR（k: 关键词 / h: 首词 / ^ $ ^$ / ! 排除）"></textarea>
  <div id="suggest" class="suggest" hidden></div>
  <div id="toolbar" class="toolbar">
    ${fieldOpButtons}
    <button id="btn-exclude" class="op" type="button">排除!</button>
  </div>
  <div id="recent" class="recent" hidden></div>
  <div id="sortbar" class="sortbar" hidden>
    <label class="sort-label" for="sort-select">排序</label>
    <select id="sort-select" class="sort-select">
      <option value="file">文件顺序</option>
      <option value="file-reverse">文件倒序</option>
      <option value="random">随机</option>
    </select>
    <button id="reroll" class="chip sort-reroll" type="button" hidden>换一批</button>
  </div>
  <div id="addressbar" class="addressbar" hidden>
    <span class="address-label">地址前缀替换</span>
    <button id="address-toggle" class="switch" type="button" role="switch" aria-checked="true"
      aria-label="地址前缀替换"></button>
  </div>
  <main id="results" class="results"></main>
  <div id="usage" class="usage" hidden>
    <div class="usage-panel" role="dialog" aria-modal="true" aria-labelledby="usage-title">
      <h2 id="usage-title" class="usage-title">资源空间</h2>
      <dl class="usage-list">
        <div class="usage-row"><dt>条目数据</dt><dd id="usage-items"></dd></div>
        <div class="usage-row"><dt>应用资源</dt><dd id="usage-app"></dd></div>
        <div id="usage-total-row" class="usage-row usage-row-total" hidden><dt>合计</dt><dd id="usage-total"></dd></div>
      </dl>
      <p class="usage-note">只统计「条目数据」「应用资源」两个桶，不含地址前缀替换开关的偏好（localStorage）、浏览器 HTTP 缓存与系统快照，因此不等于手机剩余空间的变化量。文件是唯一真源：重新导入整体替换、不累积。</p>
      <button id="usage-close" class="btn" type="button">关闭</button>
    </div>
  </div>
  <div id="update" class="usage update" hidden>
    <div class="usage-panel" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <h2 id="update-title" class="usage-title">更新</h2>
      <dl class="usage-list">
        <div class="usage-row"><dt>当前版本</dt><dd id="update-version"></dd></div>
      </dl>
      <p id="update-status" class="update-status" role="status"></p>
      <div class="update-actions">
        <button id="update-close" class="btn" type="button">关闭</button>
        <button id="update-action" class="btn btn-primary" type="button">检查更新</button>
      </div>
    </div>
  </div>
`;

const fileInput = app.querySelector<HTMLInputElement>('#file-input')!;
const importBtn = app.querySelector<HTMLButtonElement>('#import-btn')!;
const countEl = app.querySelector<HTMLSpanElement>('#count')!;
const results = app.querySelector<HTMLElement>('#results')!;
const search = app.querySelector<HTMLTextAreaElement>('#search')!;
const suggest = app.querySelector<HTMLDivElement>('#suggest')!;
const recentEl = app.querySelector<HTMLDivElement>('#recent')!;
const sortbarEl = app.querySelector<HTMLDivElement>('#sortbar')!;
const sortSelect = app.querySelector<HTMLSelectElement>('#sort-select')!;
const rerollBtn = app.querySelector<HTMLButtonElement>('#reroll')!;
const addressbarEl = app.querySelector<HTMLDivElement>('#addressbar')!;
const addressToggle = app.querySelector<HTMLButtonElement>('#address-toggle')!;
const usageBtn = app.querySelector<HTMLButtonElement>('#usage-btn')!;
const usageEl = app.querySelector<HTMLDivElement>('#usage')!;
const usageItemsEl = app.querySelector<HTMLElement>('#usage-items')!;
const usageAppEl = app.querySelector<HTMLElement>('#usage-app')!;
const usageTotalRow = app.querySelector<HTMLElement>('#usage-total-row')!;
const usageTotalEl = app.querySelector<HTMLElement>('#usage-total')!;

let items: Item[] = [];
let vocab: VocabEntry[] = [];
let headVocab: VocabEntry[] = [];

type SortMode = 'file' | 'file-reverse' | 'random';
let sortMode: SortMode = 'file';
/** 随机模式下的全排列；搜索只取它的子序列，故输入时不重滚。 */
let randomOrder: Item[] = [];

/** 前缀池：导入时构建；基址 → 同条目内其他基址。 */
let addressPool: AddressPool = new Map();
/** 是否有任何链接能用上替代：决定开关行是否出现。 */
let addressAvailable = false;

const ADDRESS_PREF_KEY = 'split-query:address-alternatives';

/** 开关状态是持久偏好；没有该键视为开。localStorage 读取是同步的，启动无闪烁。 */
function loadAddressPref(): boolean {
  try {
    return localStorage.getItem(ADDRESS_PREF_KEY) !== 'off';
  } catch {
    return true; // 隐私模式等读不到时按默认开
  }
}

function saveAddressPref(on: boolean): void {
  try {
    if (on) localStorage.removeItem(ADDRESS_PREF_KEY);
    else localStorage.setItem(ADDRESS_PREF_KEY, 'off');
  } catch {
    // 存不下时只影响下次启动，本次界面状态不变
  }
}

let addressAlternativesOn = loadAddressPref();

// ---------- 渲染 ----------

function render(list: Item[]): void {
  results.textContent = '';
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent =
      items.length === 0
        ? '点击「导入文件」选择你的文本文件（按空行切分条目）。建议添加到主屏后从图标进入：离线可用，且数据不受 Safari 的 7 天清理限制。'
        : '没有匹配的条目。试试换关键词或减少条件。';
    results.appendChild(empty);
    return;
  }
  for (const item of list) {
    const card = document.createElement('article');
    card.className = 'item';

    const keyword = document.createElement('div');
    keyword.className = 'item-keyword';
    keyword.textContent = item.keywordLine;
    card.appendChild(keyword);

    for (const line of item.otherLines) {
      const urlLine = splitUrlLine(line);
      if (urlLine !== null) {
        const row = document.createElement('div');
        row.className = 'link-row';

        const link = document.createElement('a');
        link.className = 'item-link';
        link.href = urlLine.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = urlLine.url;
        row.appendChild(link);

        if (urlLine.note !== '') {
          const note = document.createElement('span');
          note.className = 'link-note';
          note.textContent = urlLine.note;
          row.appendChild(note);
        }

        card.appendChild(row);
        if (addressAlternativesOn && !isAddressItem(item)) {
          const alternatives = alternativesFor(urlLine.url, addressPool);
          if (alternatives.length > 0) card.appendChild(renderAlternatives(alternatives));
        }
      } else {
        const p = document.createElement('p');
        p.className = 'item-note';
        p.textContent = line;
        card.appendChild(p);
      }
    }
    results.appendChild(card);
  }
}

/**
 * 一条链接的替代前缀行：最多 2 个 chip，其余收成「还有 N 个」。
 * 展开是原地插入、不可收起；任何重渲染都会重建 DOM，自然回到折叠态。
 */
function renderAlternatives(alternatives: readonly AlternativeLink[]): HTMLElement {
  const row = document.createElement('div');
  row.className = 'alt-row';

  const label = document.createElement('span');
  label.className = 'alt-label';
  label.textContent = '换前缀';
  row.appendChild(label);

  for (const alt of alternatives.slice(0, 2)) row.appendChild(createAltChip(alt));

  const rest = alternatives.slice(2);
  if (rest.length > 0) {
    const more = document.createElement('button');
    more.className = 'chip alt-more';
    more.type = 'button';
    more.setAttribute('aria-expanded', 'false');
    more.textContent = `还有 ${rest.length} 个`;
    more.addEventListener('click', () => {
      const chips = rest.map(createAltChip);
      for (const chip of chips) row.insertBefore(chip, more);
      more.remove();
      chips[0].focus();
    });
    row.appendChild(more);
  }
  return row;
}

function createAltChip(alt: AlternativeLink): HTMLAnchorElement {
  const chip = document.createElement('a');
  chip.className = 'chip alt-chip';
  chip.href = alt.href;
  chip.target = '_blank';
  chip.rel = 'noopener noreferrer';
  chip.textContent = alt.prefix;
  chip.title = `用 ${alt.href} 打开`;
  chip.setAttribute('aria-label', `用 ${alt.prefix} 前缀打开 ${alt.href}`);
  return chip;
}

function renderFiltered(): void {
  const base =
    sortMode === 'random' ? randomOrder : sortMode === 'file-reverse' ? reverse(items) : items;
  render(base.filter(buildQuery(search.value)));
  syncSortbar();
  syncAddressBar();
  updateSuggestions();
}

/** 排序行只在有条目时出现；「换一批」只在随机模式下出现。 */
function syncSortbar(): void {
  sortbarEl.hidden = items.length === 0;
  // 显式同步控件值：浏览器刷新时可能恢复表单状态，避免下拉显示与视图状态不一致。
  sortSelect.value = sortMode;
  rerollBtn.hidden = sortMode !== 'random';
}

/** 有可用替代时显示开关行；关闭后仍保留该行，以便再打开。 */
function syncAddressBar(): void {
  addressbarEl.hidden = !addressAvailable;
  addressToggle.setAttribute('aria-checked', String(addressAlternativesOn));
}

/** 按当前条目重滚一次全排列（只在随机模式下调用）。 */
function rollRandomOrder(): void {
  randomOrder = shuffle(items);
}

// ---------- 搜索框工具 ----------

/** 对当前行末尾 token 取反 / 取消取反。 */
function toggleExclude(): void {
  const next = editSearchText(search.value, { kind: 'toggleExclude' });
  if (next === search.value) return;
  search.value = next;
  search.focus();
  renderFiltered();
}

/** 字段算子按钮：有末词则给末词加/替换前缀；无词（空框或刚换行）则追加前缀后打字。 */
function applyFieldOp(op: FieldOp): void {
  search.value = editSearchText(search.value, { kind: 'fieldOp', op });
  search.focus();
  renderFiltered();
}

// ---------- 自动补全 ----------

function updateSuggestions(): void {
  suggest.textContent = '';
  const hits = completions(search.value, {
    keyword: vocab.map((e) => e.word),
    head: headVocab.map((e) => e.word),
  });
  if (hits.length === 0) {
    suggest.hidden = true;
    return;
  }
  for (const word of hits) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = word;
    chip.addEventListener('click', () => {
      const next = editSearchText(search.value, { kind: 'complete', word });
      if (next === search.value) return;
      search.value = next;
      suggest.hidden = true;
      search.focus();
      renderFiltered();
    });
    suggest.appendChild(chip);
  }
  suggest.hidden = false;
}

// ---------- 最近搜索 ----------

const recent: string[] = [];

function rememberRecent(query: string): void {
  const q = query.trim();
  if (!q) return;
  const i = recent.indexOf(q);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(q);
  if (recent.length > 8) recent.pop();
  renderRecent();
}

function renderRecent(): void {
  recentEl.textContent = '';
  if (recent.length === 0) {
    recentEl.hidden = true;
    return;
  }
  for (const q of recent) {
    const chip = document.createElement('button');
    chip.className = 'chip recent-chip';
    chip.type = 'button';
    chip.textContent = q;
    chip.title = '粘贴到搜索框（可再编辑）';
    chip.addEventListener('click', () => {
      search.value = q; // 粘贴回编辑框，不直接执行；由用户再输入/触发后过滤
      search.focus();
    });
    recentEl.appendChild(chip);
  }
  recentEl.hidden = false;
}

// ---------- 导入 ----------

/** 采纳一组条目：重建词库、刷新计数与结果。 */
function applyItems(source: Item[]): void {
  items = source;
  vocab = buildVocabulary(items);
  headVocab = buildHeadVocabulary(items);
  countEl.textContent = `${items.length} 条目`;
  addressPool = buildAddressPool(items);
  // 开关行只在全部条目里至少有一条非地址条目的链接能拿到替代时出现
  addressAvailable = items.some(
    (item) =>
      !isAddressItem(item) &&
      item.otherLines.some((line) => {
        const urlLine = splitUrlLine(line);
        return urlLine !== null && alternativesFor(urlLine.url, addressPool).length > 0;
      }),
  );
  // 排序选择是视图状态：重新导入不改变它；随机模式为新数据滚新排列
  if (sortMode === 'random') rollRandomOrder();
  renderFiltered();
}

function loadFile(file: File): void {
  void file.text().then((text) => {
    applyItems(parseFile(text));
    void saveItems(items).catch((err) => console.warn('保存到本地失败', err));
  });
}

/** 启动：若本地已有条目则直接展示（文件之外的第二副本，文件仍为真源）。 */
async function init(): Promise<void> {
  try {
    const stored = await loadItems();
    // 仅当用户尚未导入过时采纳缓存，避免与极快的重导入竞态覆盖内存数据
    if (stored && stored.length > 0 && items.length === 0) applyItems(stored);
  } catch (err) {
    console.warn('读取本地数据失败，退回到内存模式', err);
  }
  renderFiltered();
}

// ---------- 资源空间 ----------

/** 一次测量的结果：读到字节 / 从未导入 / 读失败。 */
type Measurement = { kind: 'bytes'; value: number } | { kind: 'empty' } | { kind: 'error' };

/** 字符串的 UTF-8 净字节。 */
function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * 条目数据＝条目的本地副本：按 UTF-8 内容净字节求和，不含 JSON 结构开销，
 * 因此可与用户的文件大小直接对照。打开面板时现读，不用导入时的快照。
 */
async function measureItemData(): Promise<Measurement> {
  try {
    const stored = await loadItems();
    if (stored === null) return { kind: 'empty' }; // 从未导入过，与"导入过但一个条目都没有"不同
    let total = 0;
    for (const item of stored) {
      total += utf8Bytes(item.keywordLine);
      for (const line of item.otherLines) total += utf8Bytes(line);
    }
    return { kind: 'bytes', value: total };
  } catch (err) {
    console.warn('读取条目数据大小失败', err);
    return { kind: 'error' };
  }
}

/** 应用资源＝离线所需的全部缓存内容。遍历所有 cache，不硬编码缓存名（那份常量在 sw.js 里）。 */
async function measureAppResources(): Promise<Measurement> {
  if (typeof caches === 'undefined') return { kind: 'error' };
  try {
    let total = 0;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (response) total += (await response.blob()).size;
      }
    }
    return { kind: 'bytes', value: total };
  } catch (err) {
    console.warn('读取应用资源大小失败', err);
    return { kind: 'error' };
  }
}

function measurementLabel(measurement: Measurement): string {
  if (measurement.kind === 'empty') return '尚未导入';
  if (measurement.kind === 'error') return '不可用';
  return formatBytes(measurement.value);
}

function openUsage(): void {
  usageEl.hidden = false;
  usageItemsEl.textContent = '读取中…';
  usageAppEl.textContent = '读取中…';
  usageTotalRow.hidden = true;
  void Promise.all([measureItemData(), measureAppResources()]).then(([data, resources]) => {
    usageItemsEl.textContent = measurementLabel(data);
    usageAppEl.textContent = measurementLabel(resources);
    // 合计是两个实测值之和；缺任一项时它就不是求和而是编造，故整行不显示
    if (data.kind === 'bytes' && resources.kind === 'bytes') {
      usageTotalEl.textContent = formatBytes(data.value + resources.value);
      usageTotalRow.hidden = false;
    }
  });
}

function closeUsage(): void {
  usageEl.hidden = true;
}

// ---------- 事件 ----------

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = '';
});
search.addEventListener('input', renderFiltered);
search.addEventListener('change', () => rememberRecent(search.value));

sortSelect.addEventListener('change', () => {
  const value = sortSelect.value;
  sortMode = value === 'random' ? 'random' : value === 'file-reverse' ? 'file-reverse' : 'file';
  if (sortMode === 'random') rollRandomOrder();
  renderFiltered();
});
rerollBtn.addEventListener('click', () => {
  if (sortMode !== 'random') return;
  rollRandomOrder();
  renderFiltered();
});

addressToggle.addEventListener('click', () => {
  addressAlternativesOn = !addressAlternativesOn;
  saveAddressPref(addressAlternativesOn);
  renderFiltered();
});

for (const btn of app.querySelectorAll<HTMLButtonElement>('.op[data-op]')) {
  btn.addEventListener('click', () => applyFieldOp(btn.dataset.op as FieldOp));
}
app.querySelector<HTMLButtonElement>('#btn-exclude')!.addEventListener('click', toggleExclude);

usageBtn.addEventListener('click', openUsage);
app.querySelector<HTMLButtonElement>('#usage-close')!.addEventListener('click', closeUsage);
usageEl.addEventListener('click', (event) => {
  if (event.target === usageEl) closeUsage(); // 点遮罩关闭；点面板内部不关
});

// 当前版本来自构建注入的 meta；dev 下为 dev。更新面板读取它。
document.documentElement.dataset.appVersion = APP_VERSION;

void init();

if (import.meta.env.PROD) initUpdates(app);
