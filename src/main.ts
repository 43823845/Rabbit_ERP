// ponytail: 应用入口 — Vue实例/ElementPlus(中文)/路由/全局样式
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
