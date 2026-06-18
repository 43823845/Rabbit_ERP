# Rabbit_ERP 构建打包指南

## 环境要求

- Node.js >= 18
- npm >= 9
- Windows 10/11 x64

## 命令速查

| 命令 | 说明 | 产物 |
|------|------|------|
| `npm run dev` | 启动 Vite 开发服务器（仅前端） | `http://localhost:5173` |
| `npm run dev:electron` | 启动 Electron 开发模式（前端 + 桌面壳） | 桌面窗口 |
| `npm run build` | 仅编译前端（TypeScript + Vue） | `dist/` 文件夹 |
| `npm run build:exe` | **完整打包 → NSIS 安装包** | `release\Rabbit_ERP Setup 0.1.0.exe` |

## 完整打包流程

### 方式一：一键命令

```bash
npm run build:exe
```

> 注意：如果本机有代理软件且未运行，必须先关闭代理，否则 `electron-builder` 下载 Electron 二进制会失败。

### 方式二：分步执行

```bash
# 步骤 1：编译前端（TypeScript 类型检查 + Vite 构建）
npm run build

# 步骤 2：打包 Electron 应用（需要设置镜像环境变量）
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_CUSTOM_DIR=v35.7.5
npx electron-builder --win --x64 --publish=never
```

### 方式三：使用构建脚本

双击运行项目根目录的 `build-exe.bat`，脚本会自动：
1. 清理代理环境变量
2. 设置中国镜像加速下载
3. 编译前端
4. 打包安装包

---

## 产物说明

构建成功后在 `release/` 目录生成：

| 文件 | 大小 | 说明 |
|------|------|------|
| `Rabbit_ERP Setup 0.1.0.exe` | ~106 MB | NSIS 安装包（推荐分发） |
| `win-unpacked/Rabbit_ERP.exe` | ~201 MB | 免安装绿色版（直接运行） |

---

## 常见问题

### 1. `ECONNREFUSED 127.0.0.1:443`

**原因**：本机有代理软件（如 Clash、v2ray）但未启动，electron-builder 走代理连接失败。

**解决**：
```powershell
# 临时关闭 Windows 系统代理
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 0

# 打包完成后恢复代理
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -Name ProxyEnable -Value 1
```

### 2. Electron 下载慢或失败

`build:exe` 命令已内置中国镜像 `npmmirror.com`，无需额外处理。

### 3. TypeScript 编译报错

确保先修复所有 TS 错误再打包：
```bash
npx vue-tsc --noEmit
```

---

## 项目结构（构建相关）

```
workspace/
├── package.json          # 项目配置 + electron-builder 配置
├── vite.config.ts        # Vite 前端构建配置
├── tsconfig.json         # TypeScript 配置（noEmit: true）
├── build-exe.bat         # 一键构建脚本
├── logo.png              # 应用图标
├── public/
│   └── logo.png          # 前端引用图标
├── src/                  # Vue 前端源码
├── electron/
│   ├── main.cjs          # Electron 主进程
│   ├── preload.cjs       # 预加载脚本
│   └── services/         # 数据库服务
├── dist/                 # 前端构建产物（Vite 输出）
└── release/              # Electron 打包产物
    ├── Rabbit_ERP Setup 0.1.0.exe   # NSIS 安装包
    └── win-unpacked/                # 免安装目录
```

---

## 构建配置说明

`package.json` 中的 `"build"` 字段控制 electron-builder 行为：

- **appId**：应用唯一标识
- **win.target**：NSIS 安装包 + x64 架构
- **win.icon**：应用图标（`logo.png`）
- **win.signExecutable**：`false`（跳过代码签名）
- **nsis**：安装程序配置（非一键安装、允许选目录、创建快捷方式）
- **asarUnpack**：`better-sqlite3` 原生模块不解压无法运行
