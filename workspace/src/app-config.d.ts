/**
 * app-config.d.ts — __APP_CONFIG__ 全局类型声明
 *
 * Vite 在 define 中注入该常量，值来自 app.config.cjs
 * 此文件无 import/export，为全局脚本声明
 */
declare const __APP_CONFIG__: {
  readonly title: string;
  readonly version: string;
  readonly productName: string;
  readonly developer: string;
  readonly loginSubtitle: string;
};
