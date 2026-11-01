// Готовит electron-app/ — отдельную папку приложения для electron-builder
// (two-package structure). В корневом package.json зависимости Nuxt/Capacitor:
// без отдельной папки electron-builder упаковал бы их все в exe, хотя
// main-процессу нужны только axios (синк форматов этикеток) и
// electron-updater (автообновление с GitHub Releases).
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'electron-app');
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const RUNTIME_DEPS = ['axios', 'electron-updater'];

// Не fs.cpSync: в Node 22 на Windows он аварийно роняет процесс
// (0xC0000409) на путях с кириллицей вроде «C:\Магазин проект».
function copyRecursive(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) copyRecursive(path.join(src, name), path.join(dest, name));
  } else {
    fs.copyFileSync(src, dest);
  }
}

fs.mkdirSync(out, { recursive: true });
for (const entry of ['electron-main.cjs', 'electron-preload.cjs', 'src-electron']) {
  const dest = path.join(out, entry);
  fs.rmSync(dest, { recursive: true, force: true });
  copyRecursive(path.join(root, entry), dest);
}

// ELECTRON_START_URL — адрес фронта, который откроет exe (по умолчанию прод)
const configPath = path.join(out, 'app-config.json');
if (process.env.ELECTRON_START_URL) {
  fs.writeFileSync(configPath, JSON.stringify({ startUrl: process.env.ELECTRON_START_URL }, null, 2) + '\n');
  console.log('[electron-stage] startUrl:', process.env.ELECTRON_START_URL);
} else {
  fs.rmSync(configPath, { force: true });
}

const appPkg = {
  name: 'kurulush-pos',
  productName: rootPkg.build.productName,
  version: rootPkg.version,
  description: rootPkg.description,
  author: rootPkg.author,
  main: 'electron-main.cjs',
  dependencies: Object.fromEntries(RUNTIME_DEPS.map((d) => [d, rootPkg.dependencies[d]])),
};
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify(appPkg, null, 2) + '\n');

// Ставим чистые node-зависимости (нативных модулей больше нет — пересборка
// под ABI Electron не нужна).
execSync('npm install --omit=dev --no-audit --no-fund --ignore-scripts', { cwd: out, stdio: 'inherit' });
console.log('[electron-stage] готово:', out);
