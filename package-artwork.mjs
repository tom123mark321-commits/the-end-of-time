import { readFile, writeFile } from 'node:fs/promises';
const html = await readFile('dist/index.html', 'utf8');
const jsPath = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPath = html.match(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)?.[1];
if (!jsPath || !cssPath) throw new Error('Missing production assets');
const js = await readFile(`dist/${jsPath.replace(/^\.\//, '')}`, 'utf8');
let css = await readFile(`dist/${cssPath.replace(/^\.\//, '')}`, 'utf8');
css = css.replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*;/g, '');
const standalone = html
  .replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, () => `<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(/<link rel="stylesheet"[^>]*href="[^"]+"[^>]*>/, () => `<style>${css}</style>`);
await writeFile('时间的尽头.html', standalone);
console.log('Standalone artwork: 时间的尽头.html');
