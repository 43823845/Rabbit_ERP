import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// 读取 app.config.cjs（ESM 环境用 createRequire 加载 CommonJS）
const require = createRequire(import.meta.url);
const appConfig = require('./app.config.cjs');

export default defineConfig({
  plugins: [
    vue(),
    // 注入 HTML 模板变量
    {
      name: 'html-inject',
      transformIndexHtml(html) {
        return html.replace(/<title>.*?<\/title>/, `<title>${appConfig.title}</title>`);
      },
    },
  ],
  define: {
    __APP_CONFIG__: JSON.stringify({
      title: appConfig.title,
      version: appConfig.version,
      productName: appConfig.productName,
      developer: appConfig.developer,
      loginSubtitle: appConfig.loginSubtitle,
    }),
  },
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['exceljs'],
  },
  server: {
    allowedHosts: ['.monkeycode-ai.online'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus'],
          'element-icons': ['@element-plus/icons-vue'],
          'vue-vendor': ['vue', 'vue-router'],
          'exceljs': ['exceljs'],
        },
      },
    },
  },
});
