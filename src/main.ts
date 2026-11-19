import './styles.css';
import { buildQuery } from './lib/query';
import { isHttpUrl, parseFile, type Item } from './lib/parse';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

app.innerHTML = `
  <header class="topbar">
    <h1 class="brand">split-query</h1>
    <button id="import-btn" class="btn" type="button">导入文件</button>
    <input id="file-input" type="file" accept=".txt,text/plain" hidden />
    <span id="count" class="count"></span>
  </header>
  <textarea id="search" class="search" rows="2" inputmode="search"
    placeholder="搜索：同行空格 AND · 换行 OR"></textarea>
  <main id="results" class="results"></main>
`;

const fileInput = app.querySelector<HTMLInputElement>('#file-input')!;
const importBtn = app.querySelector<HTMLButtonElement>('#import-btn')!;
const countEl = app.querySelector<HTMLSpanElement>('#count')!;
const results = app.querySelector<HTMLElement>('#results')!;
const search = app.querySelector<HTMLTextAreaElement>('#search')!;

let items: Item[] = [];

function render(list: Item[]): void {
  results.textContent = '';
  if (list.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '点击「导入文件」选择你的文本文件（按空行切分条目）。';
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
}

function loadFile(file: File): void {
  void file.text().then((text) => {
    items = parseFile(text);
    countEl.textContent = `${items.length} 条目`;
    renderFiltered();
  });
}

importBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
  fileInput.value = '';
});

search.addEventListener('input', renderFiltered);

renderFiltered();
