/**
 * auth.ts — 认证状态管理模块
 *
 * 职责：用户登录/登出、状态持久化（localStorage）、全局认证状态响应式管理
 * 使用方式：通过 useAuth() 获取单例认证实例
 */
import { reactive } from 'vue';
import type { AuthUser } from './vite-env';

const AUTH_KEY = 'finance_auth_state';

function loadState(): { loggedIn: boolean; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { loggedIn: false, user: null };
}

const state = reactive(loadState());

export function useAuth() {
  function login(user: AuthUser) {
    state.loggedIn = true;
    state.user = user;
    persist();
  }

  function logout() {
    state.loggedIn = false;
    state.user = null;
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem('finance_last_company');
  }

  function isLoggedIn(): boolean {
    return state.loggedIn && !!state.user;
  }

  function persist() {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ loggedIn: state.loggedIn, user: state.user }));
  }

  return { state, login, logout, isLoggedIn };
}
