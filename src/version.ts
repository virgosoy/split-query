/**
 * 当前页面的构建版本。
 *
 * 版本由 scripts/build-sw.mjs 在构建后写入 dist/index.html 的 meta；dev 下仍是
 * 占位符，统一报 dev。票 13 的更新面板用它显示「当前版本」。
 */
const meta = document.querySelector<HTMLMetaElement>('meta[name="app-version"]');
const raw = meta?.content.trim() ?? '';
export const APP_VERSION = raw && raw !== '__APP_VERSION__' ? raw : 'dev';
