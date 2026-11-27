/**
 * 快捷输入 UI 人工验证（手动运行，不进 CI）。
 *
 * 覆盖：工具栏按钮集合与顺序、文本改写、锚点查询语义、390px 两行布局。
 * 数据固定用 `scripts/fixtures/ui-quick-input.txt`。`draft/demo.txt` 只是手工样本，
 * 关键词行结构不固定，不作为断言数据。
 *
 * 用法：
 *   node scripts/verify-quick-input.mjs
 *   node scripts/verify-quick-input.mjs --url https://virgosoy.github.io/split-query/
 *
 * 本地运行时自动启动 Vite dev server；`--url` 指向已运行实例时不再起服务。
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { freePort, launch } from './browser.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const args = process.argv.slice(2);
const urlFlag = args.indexOf('--url');
let url = urlFlag >= 0 ? args[urlFlag + 1] : null;
const local = !url;
let server = null;
let browser = null;
const failures = [];
const notes = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`PASS ${name}`);
    return;
  }
  console.log(`FAIL ${name}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  failures.push(name);
}

try {
  if (local) {
    const port = await freePort();
    const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
    server = spawn(
      process.execPath,
      [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
      { stdio: 'ignore' },
    );
    url = `http://127.0.0.1:${port}/`;
    if (!(await waitForHttp(url))) throw new Error(`Vite dev server 没起来（${url}）`);
  }

  browser = await launch({ url, width: 390, height: 844 });
  await browser.waitFor(`document.querySelector('#toolbar') !== null`, { timeout: 15000 });

  const labels = await browser.evaluate(
    `[...document.querySelectorAll('#toolbar .op')].map((b) => b.textContent)`,
  );
  check('按钮集合与顺序', labels, [
    '关键词', '关键词^', '关键词$', '关键词^$',
    '首词', '首词^', '首词$', '首词^$', '排除!',
  ]);
  check('仅关键词行按钮已移除', await browser.evaluate(`document.querySelector('#btn-kline') === null`), true);

  const placeholder = await browser.evaluate(`document.querySelector('#search').placeholder`);
  check('占位符含 k: 关键词', placeholder.includes('k: 关键词'), true);
  check('占位符不再含 关键词行', placeholder.includes('关键词行'), false);

  async function clickOp(label, value) {
    return browser.evaluate(`(() => {
      const search = document.querySelector('#search');
      search.value = ${JSON.stringify(value)};
      const btn = [...document.querySelectorAll('#toolbar .op')].find((b) => b.textContent === ${JSON.stringify(label)});
      if (!btn) throw new Error('button not found: ${label}');
      btn.click();
      return search.value;
    })()`);
  }

  check('空框按 关键词^ → k^:', await clickOp('关键词^', ''), 'k^:');
  check('裸词按 关键词^ → k^:vue', await clickOp('关键词^', 'vue'), 'k^:vue');
  check('h:vue 按 关键词^ → k^:vue', await clickOp('关键词^', 'h:vue'), 'k^:vue');
  check('!vue 按 关键词$ → !k$:vue', await clickOp('关键词$', '!vue'), '!k$:vue');
  check('k:vue 按 关键词^$ → k^$:vue', await clickOp('关键词^$', 'k:vue'), 'k^$:vue');
  check('h:vue 按 关键词 → k:vue', await clickOp('关键词', 'h:vue'), 'k:vue');
  check('多行只改最后一行', await clickOp('关键词', 'foo\nbar'), 'foo\nk:bar');
  check('k:vue 按 首词^$ → h^$:vue', await clickOp('首词^$', 'k:vue'), 'h^$:vue');
  check('裸词按 排除! → !vue', await clickOp('排除!', 'vue'), '!vue');
  check('!vue 再按 排除! → vue', await clickOp('排除!', '!vue'), 'vue');

  const fixture = fileURLToPath(new URL('./fixtures/ui-quick-input.txt', import.meta.url));
  await browser.setFileInput('#file-input', [fixture]);
  await browser.evaluate(
    `document.querySelector('#file-input').dispatchEvent(new Event('change', { bubbles: true }))`,
  );
  const counted = await browser.waitFor(`document.querySelector('#count').textContent === '3 条目'`, {
    timeout: 15000,
  });
  check('导入 fixture 得到 3 条目', !!counted, true);

  /** 设置搜索文本并派发 input（触发过滤与候选），再在页面里求值 body。 */
  async function withSearch(value, body) {
    return browser.evaluate(`(() => {
      const search = document.querySelector('#search');
      search.value = ${JSON.stringify(value)};
      search.dispatchEvent(new Event('input', { bubbles: true }));
      ${body}
    })()`);
  }

  async function resultLines(query) {
    return withSearch(
      query,
      `return [...document.querySelectorAll('#results .item-keyword')].map((e) => e.textContent);`,
    );
  }

  check('k^:百', await resultLines('k^:百'), ['百度 谷歌 必应']);
  check('k$:必应', await resultLines('k$:必应'), ['百度 谷歌 必应']);
  check('k^:vue', await resultLines('k^:vue'), ['vue router 前端']);
  check('k$:前端', await resultLines('k$:前端'), ['vue router 前端']);
  check('k^$:常用搜索', await resultLines('k^$:常用搜索'), ['常用搜索']);
  check('k^$:百度（整行不相等，不命中）', await resultLines('k^$:百度'), []);
  check('h^:百', await resultLines('h^:百'), ['百度 谷歌 必应']);
  check('h$:索', await resultLines('h$:索'), ['常用搜索']);
  check('h^$:百度', await resultLines('h^$:百度'), ['百度 谷歌 必应']);
  check('!k:百度', await resultLines('!k:百度'), ['vue router 前端', '常用搜索']);

  const transformed = await clickOp('关键词^', '百度');
  check('按钮写入 k^:百度', transformed, 'k^:百度');
  const endToEnd = await browser.evaluate(
    `[...document.querySelectorAll('#results .item-keyword')].map((e) => e.textContent)`,
  );
  check('k^:百度 的结果', endToEnd, ['百度 谷歌 必应']);

  // ---------- 自动补全（fixture 两份词库可区分） ----------
  // 关键词行词库：百度 谷歌 必应 vue router 前端 常用搜索（各 1 次，首见顺序）
  // 首词词库：百度 vue 常用搜索

  async function suggestions(value) {
    return withSearch(
      value,
      `const box = document.querySelector('#suggest');
      return { hidden: box.hidden, chips: [...box.querySelectorAll('.chip')].map((c) => c.textContent) };`,
    );
  }

  async function clickSuggestion(value, word) {
    return withSearch(
      value,
      `const chip = [...document.querySelectorAll('#suggest .chip')].find((c) => c.textContent === ${JSON.stringify(word)});
      if (!chip) return null;
      chip.click();
      return { value: search.value, hidden: document.querySelector('#suggest').hidden };`,
    );
  }

  check('空文本无候选', await suggestions(''), { hidden: true, chips: [] });
  check('裸词用关键词行词库', await suggestions('v'), { hidden: false, chips: ['vue'] });
  check('k: 值为空给关键词词表前 8', await suggestions('k:'), {
    hidden: false,
    chips: ['百度', '谷歌', '必应', 'vue', 'router', '前端', '常用搜索'],
  });
  check('h: 值为空只给首词词表', await suggestions('h:'), {
    hidden: false,
    chips: ['百度', 'vue', '常用搜索'],
  });
  check('h: 不出现非首词候选', await suggestions('h:前'), { hidden: true, chips: [] });
  check('裸词仍出现非首词候选', await suggestions('前'), { hidden: false, chips: ['前端'] });
  check('取反不屏蔽候选', await suggestions('!v'), { hidden: false, chips: ['vue'] });
  check('k^: 前缀不屏蔽候选', await suggestions('k^:v'), { hidden: false, chips: ['vue'] });
  check('!k: 前缀不屏蔽候选', await suggestions('!k:'), {
    hidden: false,
    chips: ['百度', '谷歌', '必应', 'vue', 'router', '前端', '常用搜索'],
  });
  check('大写前缀+全角冒号不屏蔽候选', await suggestions('K^：v'), { hidden: false, chips: ['vue'] });
  check('h: 用首词词库', await suggestions('h:v'), { hidden: false, chips: ['vue'] });
  check('多行只补末行末词', await suggestions('foo\nk:vu'), { hidden: false, chips: ['vue'] });

  check('点选裸词只替换值', await clickSuggestion('v', 'vue'), { value: 'vue', hidden: true });
  check('点选保留锚点前缀', await clickSuggestion('k^:vu', 'vue'), { value: 'k^:vue', hidden: true });
  check('点选取反保留 !', await clickSuggestion('!vu', 'vue'), { value: '!vue', hidden: true });
  check('点选取反+前缀逐字保留', await clickSuggestion('!k:vu', 'vue'), { value: '!k:vue', hidden: true });
  check('点选大写+全角前缀逐字保留', await clickSuggestion('K^：v', 'vue'), { value: 'K^：vue', hidden: true });
  check('点选 h: 空值补值', await clickSuggestion('h:', 'vue'), { value: 'h:vue', hidden: true });
  check('点选 k: 空值补值', await clickSuggestion('k:', '前端'), { value: 'k:前端', hidden: true });
  check('点选多行只改末行', await clickSuggestion('foo\nk:vu', 'vue'), {
    value: 'foo\nk:vue',
    hidden: true,
  });
  check('点选多 token 只改末词', await clickSuggestion('k:百度 v', 'vue'), {
    value: 'k:百度 vue',
    hidden: true,
  });

  const layout = await browser.evaluate(`(() => {
    const bar = document.querySelector('#toolbar');
    const buttons = [...bar.querySelectorAll('.op')];
    const tops = [...new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)))];
    return {
      rows: tops.length,
      height: Math.round(bar.getBoundingClientRect().height),
      overflowX: bar.scrollWidth > bar.clientWidth,
      width: Math.round(bar.getBoundingClientRect().width),
    };
  })()`);
  notes.push(`工具栏布局（390px 视口）：${JSON.stringify(layout)}`);
  check('工具栏无横向溢出', layout.overflowX, false);
  check('工具栏保持两行', layout.rows, 2);
} catch (error) {
  console.error(`FAIL ${error.message}`);
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}

for (const note of notes) console.log(`NOTE ${note}`);
if (failures.length) {
  console.log(`FAILED ${failures.length}: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('ALL PASS');

async function waitForHttp(target) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(target);
      if (response.ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}
