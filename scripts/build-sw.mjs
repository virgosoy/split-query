/**
 * 生成 dist/sw.js，并把构建版本写进 dist/index.html。
 *
 * 为什么在 vite build 之后单独做：
 * - public/ 里的文件会被原样拷贝，不能带构建期占位符；
 * - Vite 产物文件名自带内容哈希，SW 需要完整清单才能全量预缓存；
 * - 页面与 SW 的版本必须由同一个来源一次性注入。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const sha = gitShortSha();
const version = `v${pkg.version}+${sha}`;

const indexHtmlPath = join(dist, 'index.html');
const html = readFileSync(indexHtmlPath, 'utf8');
if (!html.includes('__APP_VERSION__')) {
  throw new Error('dist/index.html 里没有 __APP_VERSION__ 占位符；产物是否来自本仓库？');
}
writeFileSync(indexHtmlPath, html.replace('__APP_VERSION__', version));

const precache = buildPrecache();
const template = readFileSync(join(root, 'scripts', 'sw.template.js'), 'utf8');
for (const token of ['__APP_VERSION__', '__PRECACHE__']) {
  if (!template.includes(token)) throw new Error(`scripts/sw.template.js 缺少 ${token} 占位符`);
}
const sw = template
  .replace('__APP_VERSION__', version)
  .replace('__PRECACHE__', JSON.stringify(precache));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`OK  生成 dist/sw.js：${version}，预缓存 ${precache.length} 项`);

function gitShortSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'nogit';
  }
}

function buildPrecache() {
  const files = walk(dist)
    .map((full) => relative(dist, full).split(sep).join('/'))
    .filter(isPrecached)
    .sort();
  return [...new Set(['./', ...files.map((file) => `./${file}`)])];
}

/** 只缓存运行所需的构建产物；sw.js 自身与 source map 不预缓存。 */
function isPrecached(path) {
  if (path === 'sw.js' || path.endsWith('.map')) return false;
  if (path === 'index.html' || path === 'manifest.json') return true;
  if (/^icon-\d+\.png$/.test(path)) return true;
  return path.startsWith('assets/');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}
