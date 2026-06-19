/**
 * 构建前清理：终止旧进程 + 强制删除 release + 注册 Windows Defender 排除
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RELEASE_DIR = path.join(__dirname, '..', 'release');

// 1. 终止进程
for (const p of ['Rabbit_ERP.exe', 'electron.exe']) {
  try { execSync(`taskkill /f /im "${p}"`, { stdio: 'ignore' }); } catch {}
}

// 2. 等待进程退出
const start = Date.now();
while (Date.now() - start < 3000) {
  let running = false;
  try { execSync('tasklist 2>nul | findstr /i Rabbit_ERP', { stdio: 'pipe', timeout: 2000 }); running = true; } catch {}
  if (!running) break;
}

// 3. Windows Defender 排除（无管理员权限则跳过）
try {
  execSync(
    `powershell -Command "Add-MpPreference -ExclusionPath '${RELEASE_DIR}' -ErrorAction Stop"`,
    { stdio: 'pipe', timeout: 10000 }
  );
  console.log('[cleanup] Defender 排除已添加');
} catch {
  console.log('[cleanup] Defender 排除添加失败(非管理员)，继续...');
}

// 4. 强制删除 release
if (!fs.existsSync(RELEASE_DIR)) return;
try { fs.rmSync(RELEASE_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); }
catch {
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      try { e.isDirectory() ? (walk(p), fs.rmdirSync(p)) : fs.unlinkSync(p); } catch {}
    }
  };
  try { walk(RELEASE_DIR); fs.rmdirSync(RELEASE_DIR); } catch {}
}
