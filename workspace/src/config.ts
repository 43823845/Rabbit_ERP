/**
 * config.ts — 应用配置访问模块
 *
 * Vite 通过 define 将 app.config.cjs 的关键字段注入为 __APP_CONFIG__ 全局常量。
 * 本模块提供带类型推导的导出，在 Vue 组件中 import 即可使用。
 */
const raw = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {
  title: 'Rabbit_ERP',
  version: '0.1.1',
  productName: 'Rabbit_ERP',
  developer: 'Origin',
  loginSubtitle: '专业财务管理系统',
};

export const APP_CONFIG = {
  title: raw.title as string,
  version: raw.version as string,
  productName: raw.productName as string,
  developer: raw.developer as string,
  loginSubtitle: raw.loginSubtitle as string,
} as const;
