/**
 * 搜索卡顿的性能反馈环（手动运行，不进 CI）。
 *
 * 症状：真实使用中导入约 10000 条目后，在搜索框里打字明显卡顿。
 * 这里用确定性 fixture（固定结构，无随机）重放「逐字输入」，测量每次
 * input 事件从派发到 DOM 重建 + 强制布局完成的耗时，超过预算即 FAIL。
 *
 * 同时锁定结果区的限量契约：首屏只渲染一页，其余由「加载更多」按页追加，
 * 追加不得重建已有卡片、单次点击也不得超预算。
 *
 * 只测用户症状（击键到界面更新），不替任何实现细节背书。
 *
 * 用法：
 *   node scripts/perf-search-10k.mjs
 *   node scripts/perf-search-10k.mjs --items 20000 --budget 100
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freePort, launch } from './browser.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const args = process.argv.slice(2);
const numberFlag = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) ? value : fallback;
};

const ITEM_COUNT = numberFlag('--items', 10000);
const BUDGET_MS = numberFlag('--budget', 100);
/** 地址前缀替换开关：`--no-address` 用于隔离它的渲染成本。 */
const ADDRESS_ON = !args.includes('--no-address');
/** 逐字输入的目标词；每个前缀都要渲染几乎全部条目。 */
const TYPED = 'vue';

/**
 * 确定性 fixture：每条都含 `vue`，因此输入首字母就会命中全部条目——
 * 这正是用户描述的场景（一开始打字，结果集最大、最卡）。
 * 前 10 条是「地址」条目，用来覆盖替代前缀的渲染路径。
 */
function makeFixture(count) {
  const blocks = [];
  for (let i = 0; i < count; i++) {
    if (i < 10) {
      blocks.push(
        [
          '地址',
          `https://site${i}.example.com/base`,
          `https://mirror${i}.example.org/base`,
          `https://backup${i}.example.net/base`,
        ].join('\n'),
      );
      continue;
    }
    const lines = [
      `vue 常用${i % 20} 分组${i % 50} 条目${i}`,
      `https://site${i % 200}.example.com/page/${i} 说明 ${i}`,
    ];
    if (i % 3 === 0) lines.push(`https://alt${i % 100}.example.net/x${i}`);
    lines.push(`备注 ${i % 7}`);
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n') + '\n';
}

let server = null;
let browser = null;
let profile = null;
const failures = [];

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`PASS ${name}`);
    return;
  }
  console.log(
    `FAIL ${name}\n  actual:   ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`,
  );
  failures.push(name);
}

try {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'split-query-perf-'));
  profile = fixtureDir;
  const fixture = join(fixtureDir, 'fixture.txt');
  writeFileSync(fixture, makeFixture(ITEM_COUNT));
  console.log(
    `INFO fixture: ${ITEM_COUNT} 条目，逐字输入「${TYPED}」，预算 ${BUDGET_MS}ms/击键`,
  );

  const port = await freePort();
  const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  server = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { stdio: 'ignore' },
  );
  const url = `http://127.0.0.1:${port}/`;
  if (!(await waitForHttp(url))) throw new Error(`Vite dev server 没起来（${url}）`);

  browser = await launch({ url, width: 390, height: 844 });
  await browser.waitFor(`document.querySelector('#file-input') !== null`, { timeout: 15000 });

  const importStart = Date.now();
  await browser.setFileInput('#file-input', [fixture]);
  await browser.evaluate(
    `document.querySelector('#file-input').dispatchEvent(new Event('change', { bubbles: true }))`,
  );
  const counted = await browser.waitFor(
    `document.querySelector('#count').textContent === '${ITEM_COUNT} 条目'`,
    { timeout: 30000 },
  );
  if (!counted) throw new Error(`导入未完成：等不到「${ITEM_COUNT} 条目」`);
  console.log(`INFO 导入并首次渲染：${Date.now() - importStart}ms`);

  if (!ADDRESS_ON) {
    await browser.evaluate(`document.querySelector('#address-toggle').click()`);
    console.log('INFO 地址前缀替换：关');
  }

  const queries = [...TYPED].map((_, i) => TYPED.slice(0, i + 1));
  const samples = await browser.evaluate(`(() => {
    const search = document.querySelector('#search');
    const results = document.querySelector('#results');
    const out = [];
    for (const query of ${JSON.stringify(queries)}) {
      const t0 = performance.now();
      search.value = query;
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const t1 = performance.now();
      void results.offsetHeight; // 强制同步布局，把样式/布局代价算进来
      const t2 = performance.now();
      out.push({
        query,
        handler: +(t1 - t0).toFixed(1),
        layout: +(t2 - t1).toFixed(1),
        total: +(t2 - t0).toFixed(1),
        cards: results.querySelectorAll('.item').length,
        suggestions: document.querySelectorAll('#suggest .chip').length,
        status: results.querySelector('.results-more-status')?.textContent ?? '',
      });
    }
    return out;
  })()`);

  for (const s of samples) {
    const verdict = s.total <= BUDGET_MS ? 'PASS' : 'FAIL';
    console.log(
      `${verdict} 输入「${s.query}」 ${s.total}ms（handler ${s.handler}ms + layout ${s.layout}ms，` +
        `渲染 ${s.cards} 条，候选 ${s.suggestions} 个）`,
    );
    if (s.total > BUDGET_MS) failures.push(`输入「${s.query}」耗时 ${s.total}ms`);
    if (s.cards === 0) failures.push(`输入「${s.query}」没有渲染出结果`);
  }

  // fixture 中只有前 10 条「地址」条目不含 vue
  const expectedMatches = ITEM_COUNT - 10;
  const last = samples[samples.length - 1];
  check('首屏只渲染一页', last.cards > 0 && last.cards < expectedMatches, true);
  check('计数行', last.status, `共 ${expectedMatches} 条，已显示 ${last.cards} 条`);

  // 「加载更多」：追加一页而不是重建全部，且单次点击仍在预算内。
  const more = await browser.evaluate(`(() => {
    const results = document.querySelector('#results');
    const button = results.querySelector('.results-more button');
    const before = results.querySelectorAll('.item').length;
    const t0 = performance.now();
    button.click();
    const t1 = performance.now();
    void results.offsetHeight;
    const t2 = performance.now();
    return {
      before,
      after: results.querySelectorAll('.item').length,
      handler: +(t1 - t0).toFixed(1),
      layout: +(t2 - t1).toFixed(1),
      total: +(t2 - t0).toFixed(1),
      status: results.querySelector('.results-more-status')?.textContent ?? '',
    };
  })()`);
  const verdict = more.total <= BUDGET_MS ? 'PASS' : 'FAIL';
  console.log(` ${verdict} 加载更多 ${more.total}ms（handler ${more.handler}ms + layout ${more.layout}ms）`);
  if (more.total > BUDGET_MS) failures.push(`加载更多耗时 ${more.total}ms`);
  check('加载更多追加一页', more.after, Math.min(more.before * 2, expectedMatches));
  const shownAfter = Math.min(more.before * 2, expectedMatches);
  check(
    '加载更多后计数行',
    more.status,
    shownAfter >= expectedMatches
      ? `共 ${expectedMatches} 条，已全部显示`
      : `共 ${expectedMatches} 条，已显示 ${shownAfter} 条`,
  );
} catch (error) {
  console.error(`FAIL ${error.stack ?? error.message}`);
  failures.push(error.message);
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
  if (profile) rmSync(profile, { recursive: true, force: true });
}

if (failures.length) {
  console.log(`FAILED ${failures.length}: ${failures.join('；')}`);
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
