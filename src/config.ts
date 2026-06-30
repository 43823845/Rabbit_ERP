// ponytail: 应用配置 — Vite define 注入 __APP_CONFIG__ 全局常量
const raw = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : {
  title: 'Rabbit_ERP',
  version: '1.2.0',
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
