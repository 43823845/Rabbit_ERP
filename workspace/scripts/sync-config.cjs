/**
 * sync-config.cjs — 从 app.config.cjs 同步字段到 package.json
 *
 * 由 prebuild/predev 脚本自动调用
 */
const path = require('node:path');
const fs   = require('node:fs');

const root = path.resolve(__dirname, '..');
const config = require(path.join(root, 'app.config.cjs'));
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

let changed = false;

// 同步基础字段
const basicFields = ['name', 'version', 'description', 'author'];
for (const f of basicFields) {
  if (config[f] !== undefined && pkg[f] !== config[f]) {
    pkg[f] = config[f];
    changed = true;
    console.log(`  [sync] package.json.${f} → ${config[f]}`);
  }
}

// 同步 build 子配置
if (!pkg.build) pkg.build = {};
const buildFields = [
  { src: 'appId',         dst: 'appId' },
  { src: 'productName',   dst: 'productName' },
  { src: 'buildOutputDir', dst: ['directories', 'output'] },
  { src: 'winIcon',       dst: ['win', 'icon'] },
  { src: ['nsis', 'shortcutName'], dst: ['nsis', 'shortcutName'] },
  { src: ['nsis', 'createDesktopShortcut'], dst: ['nsis', 'createDesktopShortcut'] },
  { src: ['nsis', 'createStartMenuShortcut'], dst: ['nsis', 'createStartMenuShortcut'] },
];

for (const { src, dst } of buildFields) {
  const srcKeys = Array.isArray(src) ? src : [src];
  let value = config;
  for (const k of srcKeys) value = value?.[k];

  if (value !== undefined) {
    const dstKeys = Array.isArray(dst) ? dst : [dst];
    let target = pkg.build;
    for (let i = 0; i < dstKeys.length - 1; i++) {
      if (!target[dstKeys[i]]) target[dstKeys[i]] = {};
      target = target[dstKeys[i]];
    }
    const lastKey = dstKeys[dstKeys.length - 1];
    if (target[lastKey] !== value) {
      target[lastKey] = value;
      changed = true;
      console.log(`  [sync] package.json.build${dstKeys.map(k => '.' + k).join('')} → ${JSON.stringify(value)}`);
    }
  }
}

// 同步 files 列表中的图标
if (config.winIcon && !pkg.build.files.includes(config.winIcon)) {
  // 确保有 logo.png 和 logo.ico
  if (!pkg.build.files.includes('logo.png')) pkg.build.files.push('logo.png');
  if (!pkg.build.files.includes('logo.ico')) pkg.build.files.push('logo.ico');
  changed = true;
  console.log('  [sync] package.json.build.files → ensured logo files');
}

if (changed) {
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('  [sync] package.json 已更新');
} else {
  console.log('  [sync] 无需更新（配置一致）');
}
