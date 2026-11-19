import './styles.css';
import { buildQuery, buildVocabulary, type VocabEntry } from './lib/query';
import { isHttpUrl, parseFile, type Item } from './lib/parse';
import { loadItems, saveItems } from './lib/storage';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

app.innerHTML = `
  <header class="topbar">
    <h1 class="brand">split-query</h1>
    <button id="import-btn" class="btn" type="button">导入文件</button>
    <input id="file-input" type="file" accept=".txt,text/plain" hidden />
    <span id="count" class="count"></span>
  </header>
  <textarea id="search" class="search" rows="2" inputmode="search" autocomplete="off"
    placeholder="搜索：同行空格 AND · 换行 OR（k: 关键词行 / h: 首词 / ^ $ ^$ / ! 排除）"></textarea>
  <div id="suggest" class="suggest" hidden></div>
  <div id="toolbar" class="toolbar">
    <button class="op" data-op="k:" type="button">关键词行</button>
    <button class="op" data-op="h:" type="button">首词</button>
    <button class="op" data-op="h^:" type="button">首词^</button>
    <button class="op" data-op="h$:" type="button">首词$</button>
    <button class="op" data-op="h^$:" type="button">首词精确</button>
    <button id="btn-exclude" class="op" type="button">排除!</button>
    <button id="btn-kline" class="op" type="button">仅关键词行</button>
  </div>
  <div id="recent" class="recent" hidden></div>
  <main id="results" class="results"></main>
`;

const fileInput = app.querySelector<HTMLInputElement>('#file-input')!;
const importBtn = app.querySelector<HTMLButtonElement>('#import-btn')!;
const countEl = app.querySelector<HTMLSpanElement>('#count')!;
const results = app.querySelector<HTMLElement>('#results')!;
const search = app.querySelector<HTMLTextAreaElement>('#search')!;
const suggest = app.querySelector<HTMLDivElement>('#suggest')!;
const recentEl = app.querySelector<HTMLDivElement>('#recent')!;

let items: Item[] = [];
let vocab: VocabEntry[] = [];

// ---------- 渲染 ----------

function render(list: Item[]): void {
  results.textContent = '';
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent =
      items.length === 0
        ? '点击「导入文件」选择你的文本文件（按空行切分条目）。'
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
      if (isHttpUrl(line)) {
        const link = document.createElement('a');
        link.className = 'item-link';
        link.href = line;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = line;
        card.appendChild(link);
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

function renderFiltered(): void {
  render(items.filter(buildQuery(search.value)));
  updateSuggestions();
}

// ---------- 搜索框工具 ----------

const FIELD_OP_RE = /^(k|h)[\^$]*[:：]/i;
const hasFieldOp = (token: string): boolean => FIELD_OP_RE.test(token);

/** 拆出 token 的取反前缀与本体。 */
function stripNeg(token: string): { neg: string; core: string } {
  return token.startsWith('!') ? { neg: '!', core: token.slice(1) } : { neg: '', core: token };
}

/**
 * 读取当前（最后）行并交给回调改写；回调返回新 token 数组则写回，否则不动。
 * 返回是否发生了写回。
 */
function editCurrentLine(fn: (tokens: string[]) => string[] | undefined): boolean {
  const lines = search.value.split('\n');
  const tokens = lines[lines.length - 1].trim().split(/\s+/).filter(Boolean);
  const next = fn(tokens);
  if (!next) return false;
  lines[lines.length - 1] = next.join(' ');
  search.value = lines.join('\n');
  return true;
}

/** 对当前行末尾 token 取反 / 取消取反。 */
function toggleExclude(): void {
  const changed = editCurrentLine((tokens) => {
    if (tokens.length === 0) return;
    const i = tokens.length - 1;
    tokens[i] = tokens[i].startsWith('!') ? tokens[i].slice(1) : '!' + tokens[i];
    return tokens;
  });
  if (changed) {
    search.focus();
    renderFiltered();
  }
}

/** 把当前行每个词改写为 k: / !k: 形式（已有字段算子的不动）。 */
function keywordLineOnly(): void {
  const changed = editCurrentLine((tokens) =>
    tokens.map((tok) => {
      const { neg, core } = stripNeg(tok);
      if (hasFieldOp(core)) return tok;
      return `${neg}k:${core}`;
    }),
  );
  if (changed) {
    search.focus();
    renderFiltered();
  }
}

/** 字段算子按钮：有末词则给末词加/替换前缀；无词（空框或刚换行）则追加前缀后打字。 */
function applyFieldOp(op: string): void {
  const changed = editCurrentLine((tokens) => {
    if (tokens.length === 0) return;
    const i = tokens.length - 1;
    const { neg, core } = stripNeg(tokens[i]);
    tokens[i] = neg + (hasFieldOp(core) ? core.replace(FIELD_OP_RE, op) : op + core);
    return tokens;
  });
  if (!changed) {
    const v = search.value;
    search.value = v === '' || v.endsWith('\n') ? v + op : v + ' ' + op;
  }
  search.focus();
  renderFiltered();
}

// ---------- 自动补全 ----------

function updateSuggestions(): void {
  suggest.textContent = '';
  const lines = search.value.split('\n');
  const tokens = lines[lines.length - 1].trim().split(/\s+/).filter(Boolean);
  const last = tokens.length > 0 ? tokens[tokens.length - 1] : '';
  if (last === '' || last.startsWith('!') || hasFieldOp(last)) {
    suggest.hidden = true;
    return;
  }
  const key = last.toLowerCase();
  const hits = vocab
    .filter((e) => e.word.toLowerCase().startsWith(key) && e.word.toLowerCase() !== key)
    .slice(0, 8);
  if (hits.length === 0) {
    suggest.hidden = true;
    return;
  }
  for (const hit of hits) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.type = 'button';
    chip.textContent = hit.word;
    chip.addEventListener('click', () => {
      if (editCurrentLine((toks) => {
        if (toks.length === 0) return;
        toks[toks.length - 1] = hit.word;
        return toks;
      })) {
        suggest.hidden = true;
        search.focus();
        renderFiltered();
      }
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
  countEl.textContent = `${items.length} 条目`;
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

// ---------- 事件 ----------

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = '';
});
search.addEventListener('input', renderFiltered);
search.addEventListener('change', () => rememberRecent(search.value));

for (const btn of app.querySelectorAll<HTMLButtonElement>('.op[data-op]')) {
  btn.addEventListener('click', () => applyFieldOp(btn.dataset.op ?? ''));
}
app.querySelector<HTMLButtonElement>('#btn-exclude')!.addEventListener('click', toggleExclude);
app.querySelector<HTMLButtonElement>('#btn-kline')!.addEventListener('click', keywordLineOnly);

void init();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('./sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // 预热：首屏资源在 SW 接管前已加载，把同源资源 URL 交给 SW 缓存，一次在线即可离线
        const urls = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => url.startsWith(window.location.origin));
        urls.push(window.location.href);
        reg.active?.postMessage({ type: 'warmup', urls });
      })
      .catch((err) => console.warn('Service Worker 注册失败', err));
  });
}
