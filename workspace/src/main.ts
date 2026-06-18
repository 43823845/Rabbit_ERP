/**
 * main.ts — 应用入口文件
 *
 * 职责：创建 Vue 应用实例、注册 Element Plus（中文语言包）、路由、全局样式
 */
import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import './styles.css';
import App from './App.vue';
import router from './router';
import { createFinanceApi } from './api';

(async () => {
  await createFinanceApi();
  createApp(App).use(router).use(ElementPlus, { locale: zhCn as any }).mount('#app');
})();
