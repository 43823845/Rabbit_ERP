// ponytail: API工厂 — MockFinanceApi(浏览器) / ElectronFinanceApi(IPC→SQLite)
import type { FinanceApi } from '../vite-env';

export type { FinanceApi } from '../vite-env';
export type * from '../vite-env';

let instance: FinanceApi | null = null;

/** 将实例挂到 window 上以应对 Vite HMR 导致的模块重新加载 */
function persistInstance(val: FinanceApi) {
  window.__financeApiInstance = val;
}

function isValidApi(api: FinanceApi | null | undefined): boolean {
  return !!api && 'uploadAttachment' in api && typeof api.uploadAttachment === 'function';
}

export async function createFinanceApi(): Promise<FinanceApi> {
  if (instance && isValidApi(instance)) return instance;

  // HMR 恢复：模块重新加载后从 window 恢复实例
  const saved = window.__financeApiInstance;
  if (saved && isValidApi(saved)) return (instance = saved);

  // 防御：永远不使用不完整的 window.financeApi
  if (window.electronAPI) {
    const { ElectronFinanceApi } = await import('./electron');
    instance = new ElectronFinanceApi();
  } else {
    const { MockFinanceApi } = await import('./mock');
    instance = new MockFinanceApi();
  }
  persistInstance(instance);
  return instance;
}

export function getFinanceApi(): FinanceApi {
  if (instance && isValidApi(instance)) return instance;
  // HMR 恢复：模块重新加载后从 window 恢复实例
  const saved = window.__financeApiInstance;
  if (saved && isValidApi(saved)) return (instance = saved);
  throw new Error('API not initialized. Call createFinanceApi() first.');
}




