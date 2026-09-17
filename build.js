/**
 * build.js — 打包脚本：将前端构建为单文件 dist/index.html（内联 CSS + JS）。
 * 用法：node build.js
 * 产物 dist/index.html 可双击直接打开，也可上传到任意静态托管。
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = __dirname;
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) fs.mkdirSync(dist);

// 1. esbuild 打包 ES 模块为 IIFE
execSync(
  `npx -y esbuild src/app.js --bundle --format=iife --target=es2020 --minify --outfile=dist/app.bundle.js`,
  { cwd: root, stdio: 'inherit' }
);

// 2. 内联进单文件 HTML
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/assets/styles.css'), 'utf8');
let js = fs.readFileSync(path.join(root, 'dist/app.bundle.js'), 'utf8');
// 防止 </script> 提前闭合内联脚本
js = js.replace(/<\/script/gi, '<\\/script');

const linkTag = '<link rel="stylesheet" href="src/assets/styles.css" />';
const scriptTag = '<script type="module" src="src/app.js"></script>';
if (!html.includes(linkTag) || !html.includes(scriptTag)) {
  console.error('index.html 中未找到预期的 link/script 标签，内联失败');
  process.exit(1);
}
html = html.replace(linkTag, '<style>\n' + css + '\n</style>');
html = html.replace(scriptTag, '<script>\n' + js + '\n</script>');
fs.writeFileSync(path.join(dist, 'index.html'), html);
fs.unlinkSync(path.join(dist, 'app.bundle.js'));

const size = (fs.statSync(path.join(dist, 'index.html')).size / 1024).toFixed(1);
console.log(`\n✅ 已生成 dist/index.html（${size} KB）— 单文件版，可直接分发`);
