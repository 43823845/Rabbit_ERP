/**
 * app.config.cjs — 应用统一配置（单文件管理所有元信息）
 *
 * 修改后运行 `node scripts/sync-config.cjs` 同步到 package.json，
 * 或直接执行 `npm run dev` / `npm run build:exe`（已集成自动同步）
 */
module.exports = {
  /** 应用内部名称（npm name） */
  name: 'rabbit-erp-desktop',

  /** 版本号 */
  version: '1.2.0',

  /** 应用描述 */
  description: 'Rabbit ERP - 财务管理系统',

  /** 作者 / 团队 */
  author: 'Rabbit ERP',

  /** 开发者署名（登录页底部） */
  developer: 'Origin QQ:43823845',

  /** Electron appId（唯一标识） */
  appId: 'com.rabbit-erp.desktop',

  /** 产品名称（exe 文件名、快捷方式名） */
  productName: 'Rabbit_ERP',

  /** 窗口标题 / 页面标题 */
  title: 'Rabbit_ERP',

  /** 登录页副标题 */
  loginSubtitle: '内部财务管理系统',

  /** Windows 应用图标（相对项目根目录） */
  winIcon: 'logo.ico',

  /** 托盘图标候选（相对 electron 目录） */
  trayIconCandidates: [
    { dev: '../public/logo.png',  prod: '../logo.png' },
    { dev: '../public/logo.ico',  prod: '../logo.ico' },
  ],

  /** NSIS 安装器配置 */
  nsis: {
    shortcutName: 'Rabbit_ERP',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },

  /** 密码加密盐值 */
  passwordSalt: 'rabbit_erp_salt_v1',

  /** 构建输出目录 */
  buildOutputDir: 'release',

  /** 窗口默认尺寸 */
  window: {
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
  },
};
