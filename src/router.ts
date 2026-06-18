/**
 * router.ts — Vue Router 路由配置
 *
 * 职责：定义页面路由表、含登录守卫，使用 Hash 模式适配 Electron 环境
 */
import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuth } from './auth';
import LoginView from './views/LoginView.vue';
import DashboardView from './views/DashboardView.vue';
import VoucherView from './views/VoucherView.vue';
import LedgerView from './views/LedgerView.vue';
import ReportsView from './views/ReportsView.vue';
import ClosingView from './views/ClosingView.vue';
import OpeningBalanceView from './views/OpeningBalanceView.vue';
import AccountSubject from './views/AccountSubject.vue';
import SettingsView from './views/SettingsView.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/dashboard', name: 'dashboard', component: DashboardView, meta: { requiresAuth: true } },
    { path: '/voucher', name: 'voucher', component: VoucherView, meta: { requiresAuth: true } },
    { path: '/ledger', name: 'ledger', component: LedgerView, meta: { requiresAuth: true } },
    { path: '/reports', name: 'reports', component: ReportsView, meta: { requiresAuth: true } },
    { path: '/closing', name: 'closing', component: ClosingView, meta: { requiresAuth: true } },
    { path: '/opening', name: 'opening', component: OpeningBalanceView, meta: { requiresAuth: true } },
    { path: '/subjects', name: 'subjects', component: AccountSubject, meta: { requiresAuth: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach((to, _from, next) => {
  const auth = useAuth();
  if (to.meta.requiresAuth && !auth.isLoggedIn()) {
    next('/login');
  } else if (to.path === '/login' && auth.isLoggedIn()) {
    next('/dashboard');
  } else {
    next();
  }
});

export default router;
