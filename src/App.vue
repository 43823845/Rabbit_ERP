<script setup lang="ts">
// ponytail: 根组件 — 侧栏导航/顶栏/主内容区/公司切换/Electron窗口控制
import { computed, onMounted, onUnmounted, ref, provide } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { HomeFilled, Document, Wallet, Notebook, DataAnalysis, Grid, Tools, User, SwitchButton, Sort, Fold, Expand, Minus, CopyDocument, TrendCharts, Coin, Lock } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAuth } from './auth';
import { getFinanceApi } from './api';
import AppIcon from './components/AppIcon.vue';
import type { Company } from './api';
import { APP_CONFIG } from './config';

const route = useRoute();
const router = useRouter();
const auth = useAuth();
const api = getFinanceApi();

const companies = ref<Company[]>([]);
const collapsed = ref(false);
const routerViewKey = ref(0);

function winMin() { window.electronAPI!.windowMin(); }
function winMax() { window.electronAPI!.windowMax(); }

/* ---- 系统状态指示器 ---- */
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | null = null;
let statusTimer: ReturnType<typeof setInterval> | null = null;
const dbConnected = ref<boolean | null>(null); // null=检测中, true=已连接, false=异常

async function checkDbStatus() {
  try {
    await api.getDatabaseInfo();
    dbConnected.value = true;
  } catch {
    dbConnected.value = false;
  }
}

onMounted(() => {
  clockTimer = setInterval(() => { now.value = new Date(); }, 1000);
  checkDbStatus();
  statusTimer = setInterval(checkDbStatus, 30000);
  loadCompanies();
  window.addEventListener('company-changed', refreshCompanies);
});

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer);
  if (statusTimer) clearInterval(statusTimer);
  window.removeEventListener('company-changed', refreshCompanies);
});

const timeStr = computed(() => {
  const d = now.value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
});

/* 是否处于登录页面 —— 登录页不展示侧栏和顶栏 */
const isLoginPage = computed(() => route.path === '/login');

const menuItems = [
  { key: '/dashboard', label: '仪表盘',   icon: HomeFilled },
  { key: '/voucher',   label: '凭证',     icon: Document },
  { key: '/ledger',    label: '账簿',     icon: Notebook },
  { key: '/reports',   label: '报表',     icon: DataAnalysis },
  { key: '/closing',   label: '期末结账', icon: TrendCharts },
  { key: '/subjects',  label: '科目管理', icon: Grid },
  { key: '/opening',   label: '初始余额', icon: Wallet },
  { key: '/assets',   label: '固定资产', icon: Coin },
  { key: '/settings',  label: '设置',     icon: Tools },
];

const currentTitle = computed(() => menuItems.find(m => m.key === route.path)?.label || APP_CONFIG.title);

function handleMenuClick(key: string) {
  if (key !== route.path) {
    router.push(key);
  }
}

const companiesCache = ref<Company[]>([]);
const companiesLoaded = ref(false);
const companiesLoading = ref(false);

const displayedCompanyCount = computed(() => {
  if (companies.value.length > 0) return `${companies.value.length}个`;
  if (companiesLoading.value) return '加载中...';
  if (companiesCache.value.length > 0) return `${companiesCache.value.length}个`;
  return '0个';
});

async function loadCompanies() {
  companiesLoading.value = true;
  try {
    companies.value = await api.getCompanies();
    companiesCache.value = companies.value;
  } catch {
    // 获取失败时保留旧数据，不覆盖
    if (companiesCache.value.length > 0) {
      companies.value = companiesCache.value;
    }
  } finally {
    companiesLoaded.value = true;
    companiesLoading.value = false;
  }
}

async function refreshCompanies() {
  companiesLoading.value = true;
  try {
    const list = await api.getCompanies();
    companies.value = list;
    companiesCache.value = list;
  } catch {
    // 刷新失败时保留旧数据
    if (companiesCache.value.length > 0) {
      companies.value = companiesCache.value;
    }
  } finally {
    companiesLoading.value = false;
  }
}

async function handleSwitchCompany(companyId: string) {
  await api.switchCompany(companyId);
  const c = companies.value.find(x => x.id === companyId);
  if (auth.state.user) {
    auth.state.user.companyId = companyId;
    auth.state.user.companyName = c?.name || '';
    auth.persist();
  }
  routerViewKey.value++;
  ElMessage.success(`已切换到「${c?.name || companyId}」`);
}

// 暴露刷新公司列表方法，供设置页面修改公司后调用
const companyRefreshKey = Symbol('companyRefresh');
provide(companyRefreshKey, refreshCompanies);

function handleLogout() {
  auth.logout();
  router.replace('/login');
}

/* ---- 自改密码 ---- */
const pwdDialogVisible = ref(false);
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' });
const savingPwd = ref(false);

function openChangePwd() {
  pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' };
  pwdDialogVisible.value = true;
}

async function submitChangePwd() {
  if (!pwdForm.value.oldPassword || !pwdForm.value.newPassword) {
    ElMessage.warning('请填写完整密码信息'); return;
  }
  if (pwdForm.value.newPassword.length < 4) {
    ElMessage.warning('密码至少4位'); return;
  }
  if (pwdForm.value.newPassword !== pwdForm.value.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致'); return;
  }
  savingPwd.value = true;
  try {
    await api.changePassword(pwdForm.value.oldPassword, pwdForm.value.newPassword);
    ElMessage.success('密码已修改，下次登录请使用新密码');
    pwdDialogVisible.value = false;
  } catch (e: any) { ElMessage.error(e?.message || '密码修改失败'); }
  finally { savingPwd.value = false; }
}

function handleUserCmd(cmd: string) {
  if (cmd === 'logout') handleLogout();
  if (cmd === 'changePwd') openChangePwd();
}
</script>

<template>
  <!-- 未登录 / 登录页：只显示 router-view -->
  <div v-if="isLoginPage" class="login-wrapper">
    <router-view />
  </div>

  <!-- 已登录：完整管理后台布局 -->
  <div v-else class="app-shell">
    <!-- 顶部栏 -->
    <header class="app-topbar">
      <div class="topbar-left">
        <AppIcon :size="28" class="brand-icon" />
        <span class="brand-text">{{ APP_CONFIG.productName }}</span>
        <span class="brand-version">v{{ APP_CONFIG.version }}</span>
        <span class="topbar-divider">|</span>
        <span class="topbar-title">{{ currentTitle }}</span>
      </div>
      <div class="topbar-right" v-if="auth.state.loggedIn">
        <!-- 系统状态指示器 -->
        <span class="topbar-status">
          <span class="topbar-status-dot online" title="Electron 桌面端"></span>
          服务器
        </span>
        <span class="topbar-divider">|</span>
        <span class="topbar-status">
          <span class="topbar-status-dot" :class="dbConnected === true ? 'online' : dbConnected === false ? 'offline' : 'checking'" :title="dbConnected === true ? '数据库已连接' : dbConnected === false ? '数据库连接异常' : '检测中...'"></span>
          数据库
        </span>
        <span class="topbar-divider">|</span>
        <span class="topbar-clock" :title="timeStr">{{ timeStr }}</span>
        <span class="topbar-divider">|</span>
        <el-dropdown @command="handleSwitchCompany" trigger="click" class="topbar-company-dropdown" popper-class="company-popper">
          <span class="topbar-link">
            <el-icon><Sort /></el-icon>
            {{ auth.state.user?.companyName || '未选择' }}
            <el-tag type="primary" size="small" effect="plain" style="margin-left:4px;font-size:10px;">{{ displayedCompanyCount }}</el-tag>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="c in companies"
                :key="c.id"
                :command="c.id"
                :class="{ 'is-active': c.id === auth.state.user?.companyId }"
              >
                <span style="display:flex;align-items:center;justify-content:space-between;width:100%;min-width:160px;">
                  <span>{{ c.name }}</span>
                  <el-tag v-if="c.id === auth.state.user?.companyId" type="primary" size="small">✓</el-tag>
                </span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-divider direction="vertical" />
        <el-dropdown trigger="click" @command="handleUserCmd">
          <span class="topbar-link">
            <el-icon><User /></el-icon> {{ auth.state.user?.username }}
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="changePwd">
                <el-icon><Lock /></el-icon> 修改密码
              </el-dropdown-item>
              <el-dropdown-item command="logout">
                <el-icon><SwitchButton /></el-icon> 退出登录
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- 窗口控制按钮（Electron 无边框模式） -->
        <template>
          <span class="win-ctrl-spacer"></span>
          <span class="win-ctrl-btn" @click="winMin" title="最小化"><el-icon><Minus /></el-icon></span>
          <span class="win-ctrl-btn" @click="winMax" title="最大化"><el-icon><CopyDocument /></el-icon></span>
        </template>
      </div>
    </header>

    <!-- 下方主体 -->
    <div class="app-body">
      <!-- 左侧导航 -->
      <aside class="app-sidebar" :class="{ 'sidebar-fold': collapsed }">
        <el-menu
          :default-active="route.path"
          :collapse="collapsed"
          :collapse-transition="false"
          @select="handleMenuClick"
        >
          <el-menu-item
            v-for="item in menuItems"
            :key="item.key"
            :index="item.key"
            class="sidebar-menu-item"
          >
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.label }}</template>
          </el-menu-item>
        </el-menu>
        <div class="sidebar-foot">
          <el-button text size="small" class="fold-btn" @click="collapsed = !collapsed">
            <el-icon><Fold v-if="!collapsed" /><Expand v-else /></el-icon>
            {{ !collapsed ? '收起' : '' }}
          </el-button>
        </div>
      </aside>

      <!-- 内容区 -->
      <main class="app-content">
        <router-view :key="routerViewKey" />
      </main>
    </div>

    <!-- ========== 修改密码对话框 ========== -->
    <el-dialog v-model="pwdDialogVisible" title="修改密码" width="420px" :close-on-click-modal="false" draggable append-to-body>
      <el-form :model="pwdForm" label-width="90px">
        <el-form-item label="原密码">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码（至少4位）" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPwd" @click="submitChangePwd">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style>
html, body, #app { margin: 0; padding: 0; width: 100%; height: 100%; }

/* ---- 登录页容器（无顶栏/侧栏） ---- */
.login-wrapper {
  position: fixed; inset: 0;
}

/* ---- 管理后台外壳 ---- */
.app-shell {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  display: flex; flex-direction: column; overflow: hidden;
  background: var(--epp-ledger);
}

.app-topbar {
  height: 50px; min-height: 50px; padding: 0 12px;
  background: var(--epp-ink);
  border-bottom: 2px solid var(--epp-accent);
  display: flex; align-items: center;
  justify-content: space-between; flex-shrink: 0; z-index: 100;
  -webkit-app-region: drag;
}
.app-topbar .el-dropdown,
.app-topbar .el-button,
.app-topbar .el-input,
.win-ctrl-btn,
.topbar-link {
  -webkit-app-region: no-drag;
}
.topbar-left { display: flex; align-items: center; gap: 12px; }
.brand-icon {
  width: 26px; height: 26px; border-radius: 4px; flex-shrink: 0;
}
.brand-text { font-size: 15px; font-weight: 700; color: #f0ede6; letter-spacing: 1px; }
.brand-version {
  font-size: 10px; color: rgba(255,255,255,.35); font-weight: 400;
  background: rgba(255,255,255,.08); padding: 1px 6px; border-radius: 3px; margin-left: 2px;
}
.topbar-divider { color: rgba(255,255,255,.15); font-size: 17px; user-select: none; }
.topbar-title { font-size: 14px; font-weight: 500; color: rgba(255,255,255,.8); margin: 0; }
.topbar-right { display: flex; align-items: center; gap: 4px; }
.topbar-company-label {
  color: rgba(255,255,255,.6); font-size: 12px; margin-right: 4px;
  max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 系统状态指示器 */
.topbar-status {
  display: inline-flex; align-items: center; gap: 4px;
  color: rgba(255,255,255,.55); font-size: 11px;
  padding: 2px 8px; margin: 0 2px;
  border-radius: 3px; background: rgba(255,255,255,.05);
  white-space: nowrap;
}
.topbar-status-dot {
  width: 6px; height: 6px; border-radius: 50%; display: inline-block; flex-shrink: 0;
}
.topbar-status-dot.online  { background: #10b981; box-shadow: 0 0 4px rgba(16,185,129,.5); }
.topbar-status-dot.offline { background: #ef4444; box-shadow: 0 0 4px rgba(239,68,68,.5); }
.topbar-status-dot.checking { background: #94a3b8; animation: pulse-dot 1.2s infinite; }
@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: .3; }
}
/* 系统时钟 */
.topbar-clock {
  color: rgba(255,255,255,.7); font-size: 12px; font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  padding: 2px 10px; margin-left: 2px;
  border-radius: 3px; background: rgba(255,255,255,.06);
  white-space: nowrap; letter-spacing: 0.5px;
}
.topbar-link {
  color: rgba(255,255,255,.7); font-size: 12px; cursor: pointer;
  display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 3px;
}
.topbar-link:hover { color: #fff; background: rgba(255,255,255,.08); }

/* el-divider 在墨蓝色顶栏中 */
.app-topbar :deep(.el-divider--vertical) {
  border-left-color: rgba(255,255,255,.12);
}

/* 窗口控制按钮 */
.win-ctrl-spacer { width: 8px; }
.win-ctrl-btn {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,.5); cursor: pointer; border-radius: 3px;
  transition: background .12s; font-size: 14px;
}
.win-ctrl-btn:hover { background: rgba(255,255,255,.08); color: #fff; }

.app-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

.app-sidebar {
  width: 135px; min-width: 135px; max-width: 135px;
  background: var(--epp-paper);
  border-right: 1px solid var(--epp-line-light);
  display: flex; flex-direction: column; flex-shrink: 0; overflow: hidden;
}
.sidebar-fold { width: 64px !important; min-width: 64px !important; max-width: 64px !important; }

/* Element Plus Menu — 账簿风格 */
.app-sidebar .el-menu {
  flex: 1;
  background: transparent;
  border-right: none;
  padding: 8px 0;
}
.app-sidebar .el-menu-item {
  height: 42px; line-height: 42px; margin-bottom: 2px;
  padding-left: 12px !important; font-size: 14px;
  color: var(--epp-ink-sub); border-radius: 2px;
}
.app-sidebar .el-menu-item:hover {
  color: var(--epp-ink-text);
  background-color: rgba(8, 145, 178, 0.06);
}
.app-sidebar .el-menu-item.is-active {
  color: var(--epp-ink);
  background-color: rgba(8, 145, 178, 0.1);
  font-weight: 600;
  border-right: 2px solid var(--epp-accent);
}
.app-sidebar .el-menu-item.is-disabled {
  opacity: .35;
}
.app-sidebar .el-icon {
  width: 18px; height: 18px; font-size: 18px; margin-right: 10px;
}

.sidebar-foot {
  padding: 12px 16px; border-top: 1px solid var(--epp-line-light); flex-shrink: 0;
}
.fold-btn { width: 100%; color: var(--epp-ink-sub); font-size: 13px; }
.fold-btn:hover { color: var(--epp-accent); }

.app-content {
  flex: 1; padding: 20px 28px; overflow-y: auto;
  overflow-x: hidden; min-width: 0;
  background: var(--epp-ledger);
}
</style>
