// ponytail: 认证管理 — 登录/登出/localStorage持久化，useAuth()获取单例
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

  return { state, login, logout, isLoggedIn, persist };
}
