/**
 * 可复用的无头浏览器驱动（CDP over WebSocket），供 `npm run smoke` 与其他人工验证脚本使用。
 *
 * 为什么不用 `--dump-dom`：它在 load 事件后立即取 DOM，而本应用的 `render()` 要等
 * IndexedDB 解析完才跑，取到的 `#results` 永远是空的。要读渲染结果，必须等到条件成立。
 *
 * 运行环境：Node 22+（用全局 WebSocket）。找不到浏览器时用 CHROME_BIN 指定。
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findBrowser() {
  for (const candidate of CANDIDATES) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new Error('找不到 Chrome / Edge。请用 CHROME_BIN 指向浏览器可执行文件。');
}

/** 取一个空闲端口（避免与本地正在跑的 dev/preview 冲突）。 */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * 启动一个全新 profile 的无头浏览器并连上页面的 CDP 会话。
 * 全新 profile 意味着 IndexedDB / Cache Storage 全空——这正是"首次使用"的现场。
 */
export async function launch({ url = 'about:blank', width = 390, height = 844 } = {}) {
  if (typeof WebSocket === 'undefined') {
    throw new Error(`需要 Node 22+（全局 WebSocket），当前 ${process.version}`);
  }
  const profile = mkdtempSync(join(tmpdir(), 'split-query-browser-'));
  const port = await freePort();
  const child = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      url,
    ],
    { stdio: 'ignore' },
  );

  const page = await waitForPageTarget(port, child);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('CDP WebSocket 连接失败')));
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await send('Runtime.enable');
  await send('Page.enable');
  if (width && height) {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: true,
    });
  }

  /** 在页面里求值；表达式抛错时返回 undefined（导航期间上下文会被销毁，属正常）。 */
  async function evaluate(expression, { awaitPromise = false } = {}) {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (response?.result?.exceptionDetails) return undefined;
    return response?.result?.result?.value;
  }

  /** 轮询直到表达式为真；超时返回 null。 */
  async function waitFor(expression, { timeout = 10000, interval = 200, awaitPromise = false } = {}) {
    const deadline = Date.now() + timeout;
    let last = null;
    while (Date.now() < deadline) {
      try {
        last = await evaluate(expression, { awaitPromise });
        if (last) return last;
      } catch {}
      await sleep(interval);
    }
    return null;
  }

  /** 通过真实文件选择器路径导入文件。 */
  async function setFileInput(selector, files) {
    await send('DOM.enable');
    const documentNode = await send('DOM.getDocument');
    const found = await send('DOM.querySelector', {
      nodeId: documentNode.result.root.nodeId,
      selector,
    });
    await send('DOM.setFileInputFiles', { nodeId: found.result.nodeId, files });
  }

  /** 断网 / 恢复。用于验证离线承诺。 */
  async function setOffline(offline) {
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
    });
  }

  /** 刷新并等到文档就绪。 */
  async function reload() {
    await send('Page.reload', { ignoreCache: false });
    await waitFor(`document.readyState === 'complete'`, { timeout: 15000 });
  }

  async function screenshot(path) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    if (shot?.result?.data) writeFileSync(path, Buffer.from(shot.result.data, 'base64'));
  }

  async function close() {
    // 启动器可能早已退出，child.kill() 会落空；先请浏览器自己退出，避免留下无头进程与临时 profile。
    try {
      await Promise.race([send('Browser.close'), sleep(1500)]);
    } catch {}
    try {
      ws.close();
    } catch {}
    try {
      child.kill();
    } catch {}
    // Windows 上浏览器退出后文件句柄释放有延迟，rmSync 可能 EBUSY；重试几次即可。
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(profile, { recursive: true, force: true });
        break;
      } catch {
        await sleep(200);
      }
    }
  }

  return { send, evaluate, waitFor, setFileInput, setOffline, reload, screenshot, close };
}

async function waitForPageTarget(port, child) {
  // 启动器进程退出 ≠ 浏览器没起来：部分 Chrome/Edge（如 Chrome 157）会把启动器甩掉，
  // 父进程以 code 0 退出、浏览器继续在后台运行，DevTools 端口随后才就绪。
  // 因此不能拿 child.exitCode 立刻判死，继续轮询；超时后再连同退出码一起报告。
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(200);
  }
  const code = child.exitCode;
  throw new Error(
    code === null
      ? '等待 DevTools 页面目标超时'
      : `等待 DevTools 页面目标超时；启动器已退出，code=${code}`,
  );
}
