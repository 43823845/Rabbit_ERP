<script setup lang="ts">
// ponytail: 系统设置 — 基础信息/账套/凭证字/期间结账/用户/数据/系统
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  User, OfficeBuilding, Calendar, Setting, Plus, Edit,
  Lock, Tickets, FolderOpened, Download, RefreshRight, Coin,
  View, Clock,
} from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import { useAuth } from '../auth';
import ClosingView from './ClosingView.vue';
import type { Company, SysUser, UserRole, VoucherWordType, VoucherWordPayload, DatabaseInfo, OpLogEntry } from '../api';

const api = getFinanceApi();
const auth = useAuth();

/* ---- 状态 ---- */
const loading = ref(false);
/** 当前激活的设置菜单项 */
const activeMenu = ref('company');

/** 导航菜单定义 */
interface NavItem { key: string; label: string; icon: typeof OfficeBuilding; adminOnly?: boolean }
interface NavGroup { label: string; items: NavItem[] }
const navGroups: NavGroup[] = [
  {
    label: '账套设置',
    items: [
      { key: 'company', label: '基础信息', icon: OfficeBuilding },
      { key: 'accounts', label: '账套管理', icon: Tickets },
      { key: 'voucherWords', label: '凭证字', icon: Edit },
      { key: 'periods', label: '期间管理', icon: Calendar },
    ],
  },
  {
    label: '系统管理',
    items: [
      { key: 'users', label: '用户管理', icon: User, adminOnly: true },
      { key: 'opLogs', label: '操作日志', icon: Clock },
      { key: 'dataManage', label: '数据管理', icon: FolderOpened },
      { key: 'system', label: '系统信息', icon: Setting },
    ],
  },
];
const company = ref<Company | null>(null);
const companies = ref<Company[]>([]);
const users = ref<SysUser[]>([]);
const subjectsCount = ref(0);

const currentUser = computed(() => auth.state.user);
const isAdmin = computed(() => currentUser.value?.role === 'admin');
const isElectron = computed(() => !!window.electronAPI);

const roleLabel = computed(() => {
  const map: Record<string, string> = {
    admin: '系统管理员', accountant: '会计', auditor: '审计员', viewer: '查看者',
  };
  return map[currentUser.value?.role || ''] || currentUser.value?.role || '—';
});

/* ---- 初始化加载 ---- */
onMounted(async () => {
  loading.value = true;
  try {
    const [bootstrap, cList, userList] = await Promise.all([
      api.bootstrap(),
      api.getCompanies(),
      isAdmin.value ? api.listUsers() : Promise.resolve([] as SysUser[]),
    ]);
    // Electron 模式下 getCurrentCompany 依赖 auth 缓存的 companyId 匹配账套列表
    company.value = api.getCurrentCompany() || cList[0] || null;
    companies.value = cList;
    users.value = userList;
    subjectsCount.value = bootstrap.subjects?.length || 0;
  } finally { loading.value = false; }
});

/* ---- 公司信息编辑（使用 reactive 确保 v-model 正常） ---- */
const editingCompany = ref(false);
const companyForm = reactive({ contactPerson: '', legalRepresentative: '', phone: '', address: '', taxNo: '' });
const savingCompany = ref(false);

function startEditCompany() {
  if (!company.value) return;
  companyForm.contactPerson = company.value.contactPerson || '';
  companyForm.legalRepresentative = company.value.legalRepresentative || '';
  companyForm.phone = company.value.phone || '';
  companyForm.address = company.value.address || '';
  companyForm.taxNo = company.value.taxNo || '';
  editingCompany.value = true;
}
function cancelEditCompany() { editingCompany.value = false; }

async function saveCompany() {
  if (!company.value) return;

  // 基础格式校验
  if (companyForm.phone && !/^[\d\-\s()+]*$/.test(companyForm.phone)) {
    ElMessage.warning('联系电话只能包含数字、短横线和空格'); return;
  }
  if (companyForm.taxNo && companyForm.taxNo.length > 0 && companyForm.taxNo.length !== 18) {
    ElMessage.warning('纳税人识别号应为18位（统一社会信用代码）'); return;
  }

  savingCompany.value = true;
  try {
    const updated = await api.updateCompany(company.value.id, { ...companyForm });
    company.value = updated;
    editingCompany.value = false;
    ElMessage.success('公司信息已更新');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '保存失败'); }
  finally { savingCompany.value = false; }
}

/* ---- 账套管理 ---- */
const editingAccountId = ref<string | null>(null);
const editingAccountName = ref('');
/** 删除确认：需要输入账套名称 */
const deleteConfirmOpen = ref(false);
const deleteTarget = ref<Company | null>(null);
const deleteConfirmInput = ref('');

function notifyCompanyChanged() {
  window.dispatchEvent(new CustomEvent('company-changed'));
}

async function handleCreateCompany() {
  try {
    const name = prompt('请输入新账套名称：');
    if (!name || !name.trim()) return;
    const c = await api.createCompany(name.trim());
    companies.value.push(c);
    ElMessage.success(`账套「${c.name}」已创建`);
    notifyCompanyChanged();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '创建失败'); }
}

function startRenameAccount(c: Company) {
  editingAccountId.value = c.id;
  editingAccountName.value = c.name;
}
function cancelRenameAccount() { editingAccountId.value = null; }
async function saveRenameAccount(c: Company) {
  try {
    await api.updateCompany(c.id, { name: editingAccountName.value });
    const target = companies.value.find(x => x.id === c.id);
    if (target) target.name = editingAccountName.value;
    if (company.value?.id === c.id) company.value.name = editingAccountName.value;
    editingAccountId.value = null;
    ElMessage.success('账套已重命名');
    notifyCompanyChanged();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '重命名失败'); }
}

function openDeleteConfirm(c: Company) {
  deleteTarget.value = c;
  deleteConfirmInput.value = '';
  deleteConfirmOpen.value = true;
}

async function confirmDeleteCompany() {
  if (!deleteTarget.value) return;
  if (deleteConfirmInput.value !== deleteTarget.value.name) {
    ElMessage.warning('输入的账套名称不一致'); return;
  }
  try {
    await api.deleteCompany(deleteTarget.value.id);
    companies.value = companies.value.filter(x => x.id !== deleteTarget.value!.id);
    ElMessage.success('账套已删除');
    deleteConfirmOpen.value = false;
    notifyCompanyChanged();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '删除失败'); }
}

/* ---- 用户管理 ---- */
interface UserDialogState {
  open: boolean; mode: 'create' | 'edit';
  id?: number; username: string; alias: string; role: UserRole; password: string;
}
const userDialog = reactive<UserDialogState>({ open: false, mode: 'create', username: '', alias: '', role: 'accountant', password: '' });
const savingUser = ref(false);

function openCreateUser() {
  Object.assign(userDialog, { open: true, mode: 'create', username: '', alias: '', role: 'accountant', password: '' });
}
function openEditUser(u: SysUser) {
  Object.assign(userDialog, { open: true, mode: 'edit', id: u.id, username: u.username, alias: u.alias, role: u.role, password: '' });
}
async function saveUser() {
  savingUser.value = true;
  try {
    if (userDialog.mode === 'create') {
      if (!userDialog.username || !userDialog.password) {
        ElMessage.warning('请填写用户名和密码'); savingUser.value = false; return;
      }
      if (userDialog.password.length < 4) {
        ElMessage.warning('密码至少4位'); savingUser.value = false; return;
      }
      await api.createUser({
        username: userDialog.username, password: userDialog.password,
        alias: userDialog.alias, role: userDialog.role,
      });
      ElMessage.success('用户已创建');
    } else {
      await api.updateUser(userDialog.id!, {
        alias: userDialog.alias, role: userDialog.role,
      });
      ElMessage.success('用户信息已更新');
    }
    userDialog.open = false;
    users.value = await api.listUsers();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '操作失败'); }
  finally { savingUser.value = false; }
}

async function handleToggleUser(u: SysUser) {
  // 管理员账号不允许禁用，防止无法登录
  if (u.role === 'admin') {
    ElMessage.warning('系统管理员账号不允许禁用');
    return;
  }
  try {
    await api.updateUser(u.id, { enabled: u.enabled ? 0 : 1 });
    users.value = await api.listUsers();
    ElMessage.success(u.enabled ? '用户已禁用' : '用户已启用');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '操作失败'); }
}

/* ---- 修改密码 ---- */
const pwdDialogOpen = ref(false);
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const savingPwd = ref(false);

async function changePassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) {
    ElMessage.warning('请填写完整密码信息'); return;
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致'); return;
  }
  savingPwd.value = true;
  try {
    await api.changePassword(pwdForm.oldPassword, pwdForm.newPassword);
    ElMessage.success('密码已修改，下次登录请使用新密码');
    pwdDialogOpen.value = false;
    pwdForm.oldPassword = '';
    pwdForm.newPassword = '';
    pwdForm.confirmPassword = '';
  } catch (e: any) { ElMessage.error(e?.message || '密码修改失败'); }
  finally { savingPwd.value = false; }
}

/* ---- 凭证字管理 ---- */
const voucherWords = ref<VoucherWordType[]>([]);
const vwLoading = ref(false);

interface VwDialogState {
  open: boolean; mode: 'create' | 'edit';
  id?: number; word: string; printTitle: string; isDefault: number;
}
const vwDialog = reactive<VwDialogState>({ open: false, mode: 'create', word: '', printTitle: '', isDefault: 0 });
const savingVw = ref(false);
const presetVoucherWords = ['记', '收', '付', '转'];

async function loadVoucherWords() {
  vwLoading.value = true;
  try {
    voucherWords.value = await api.listVoucherWords();
  } finally { vwLoading.value = false; }
}

function openCreateVw() {
  Object.assign(vwDialog, { open: true, mode: 'create', id: undefined, word: '', printTitle: '', isDefault: 0 });
}

function openEditVw(row: VoucherWordType) {
  Object.assign(vwDialog, {
    open: true, mode: 'edit', id: row.id,
    word: row.word, printTitle: row.print_title, isDefault: row.is_default,
  });
}

async function saveVoucherWord() {
  if (!vwDialog.word.trim()) { ElMessage.warning('请输入凭证字'); return; }
  savingVw.value = true;
  try {
    const payload: VoucherWordPayload = {
      word: vwDialog.word.trim(),
      printTitle: vwDialog.printTitle.trim(),
      isDefault: vwDialog.isDefault,
    };
    if (vwDialog.mode === 'create') {
      await api.createVoucherWord(payload);
      ElMessage.success('凭证字已创建');
    } else {
      await api.updateVoucherWord(vwDialog.id!, payload);
      ElMessage.success('凭证字已更新');
    }
    vwDialog.open = false;
    await loadVoucherWords();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '操作失败'); }
  finally { savingVw.value = false; }
}

async function handleSetDefaultVw(row: VoucherWordType) {
  try {
    await api.updateVoucherWord(row.id, { word: row.word, printTitle: row.print_title, isDefault: 1 });
    ElMessage.success(`已将「${row.word}」设为默认凭证字`);
    await loadVoucherWords();
  } catch (e: any) { ElMessage.error(e?.message || '操作失败'); }
}

/* 切换菜单时自动加载数据 */
watch(activeMenu, (key) => {
  if (key === 'voucherWords') loadVoucherWords();
  if (key === 'dataManage') loadDbInfo();
  if (key === 'opLogs') loadOpLogs();
});

/* ---- 操作日志 ---- */
const opLogs = ref<OpLogEntry[]>([]);
const opLogsLoading = ref(false);
const opLogDateRange = ref<string[]>([]);
const opLogLimit = ref(100);

async function loadOpLogs() {
  opLogsLoading.value = true;
  try {
    const filter: { startDate?: string; endDate?: string; limit?: number } = { limit: opLogLimit.value };
    if (opLogDateRange.value && opLogDateRange.value.length === 2) {
      filter.startDate = opLogDateRange.value[0];
      filter.endDate = opLogDateRange.value[1];
    }
    opLogs.value = await api.getOperationLogs(filter);
  } catch (e: unknown) {
    ElMessage.error((e as Error)?.message || '获取操作日志失败');
  } finally { opLogsLoading.value = false; }
}

function resetOpLogFilter() {
  opLogDateRange.value = [];
  opLogLimit.value = 100;
  loadOpLogs();
}

function exportOpLogs() {
  if (opLogs.value.length === 0) { ElMessage.warning('无日志可导出'); return; }
  const csv = ['\uFEFF日期,操作类型,目标,详情,用户']
    .concat(opLogs.value.map(l =>
      `${l.createdAt},${l.action},"${l.target}","${l.detail}",${l.username}`
    )).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `操作日志_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('操作日志已导出');
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    '创建凭证': '创建', '删除凭证': '删除', '审核': '审核', '批量审核': '审核',
    '过账': '过账', '批量过账': '过账', '创建模板': '模板', '删除模板': '模板',
    '添加摘要': '摘要', '删除摘要': '摘要', '期末结账': '结账',
  };
  return map[action] || action;
}

function actionTagType(action: string): 'success' | 'warning' | 'info' | 'danger' | 'primary' {
  if (action.includes('创建') || action.includes('添加')) return 'success';
  if (action.includes('删除')) return 'danger';
  if (action.includes('审核')) return 'warning';
  if (action.includes('过账')) return 'info';
  if (action.includes('结账')) return 'success';
  return 'primary';
}

/* ---- 数据管理 ---- */
const dbInfo = ref<DatabaseInfo | null>(null);
const dbLoading = ref(false);
const vacuuming = ref(false);
const backingUp = ref(false);
const exporting = ref(false);

async function loadDbInfo() {
  dbLoading.value = true;
  try { dbInfo.value = await api.getDatabaseInfo(); }
  catch (e: unknown) { ElMessage.error((e as Error)?.message || '获取数据库信息失败'); }
  finally { dbLoading.value = false; }
}

async function handleVacuum() {
  try {
    await ElMessageBox.confirm(
      '数据库整理将重组数据库文件以释放空间。建议在备份后执行。', '确认整理',
      { confirmButtonText: '开始整理', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  vacuuming.value = true;
  try {
    const res = await api.vacuumDatabase();
    const saved = res.beforeSize && res.afterSize
      ? `释放空间 ${((res.beforeSize - res.afterSize) / 1024).toFixed(1)} KB`
      : '';
    ElMessage.success(`数据库整理完成${saved ? '，' + saved : ''}`);
    await loadDbInfo();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '整理失败'); }
  finally { vacuuming.value = false; }
}

async function handleBackup() {
  backingUp.value = true;
  try {
    const res = await api.backupDatabase();
    if (res.canceled) { backingUp.value = false; return; }
    if (res.__error) { ElMessage.error(res.__error); backingUp.value = false; return; }
    ElMessage.success(res.path ? `数据库已备份至 ${res.path}` : '数据库已备份');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '备份失败'); }
  finally { backingUp.value = false; }
}

async function handleExportJson() {
  exporting.value = true;
  try {
    const res = await api.exportDataJson();
    if (res.canceled) { exporting.value = false; return; }
    if (res.__error) { ElMessage.error(res.__error); exporting.value = false; return; }
    ElMessage.success(res.path ? `数据已导出至 ${res.path}` : '数据已导出');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '导出失败'); }
  finally { exporting.value = false; }
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
</script>

<template>
  <div class="settings-page">
    <!-- 页面标题栏 -->
    <div class="sp-header">
      <div class="sp-header-left">
        <el-icon :size="22"><Setting /></el-icon>
        <h2>系统设置</h2>
      </div>
      <div class="sp-header-right">
        <span class="sp-user-badge">
          <el-icon><User /></el-icon>
          {{ currentUser?.username || currentUser?.alias || '—' }}
          <el-tag size="small" effect="dark" type="warning" style="margin-left:6px">{{ roleLabel }}</el-tag>
        </span>
      </div>
    </div>

    <!-- 主体：左侧导航 + 右侧内容 -->
    <div class="sp-layout" v-loading="loading">
      <!-- 左侧导航栏 -->
      <nav class="sp-nav">
        <template v-for="group in navGroups" :key="group.label">
          <div class="sp-nav-group-label">{{ group.label }}</div>
          <div
            v-for="item in group.items"
            v-show="!item.adminOnly || isAdmin"
            :key="item.key"
            class="sp-nav-item"
            :class="{ 'sp-nav-item--active': activeMenu === item.key }"
            @click="activeMenu = item.key"
          >
            <span class="sp-nav-item-icon"><el-icon :size="16"><component :is="item.icon" /></el-icon></span>
            <span class="sp-nav-item-text">{{ item.label }}</span>
          </div>
        </template>
      </nav>

      <!-- 右侧内容区 -->
      <div class="sp-content">

        <!-- ===== 基础信息 ===== -->
        <div v-if="activeMenu === 'company'" class="sp-basic-grid">
          <!-- 左：公司信息 -->
          <div class="sp-basic-card sp-basic-card--company">
            <div class="sp-bc-header">
              <div class="sp-bc-header-left">
                <span class="sp-bc-icon"><el-icon :size="16"><OfficeBuilding /></el-icon></span>
                <span class="sp-bc-title">公司信息</span>
              </div>
              <div class="sp-bc-header-right">
                <template v-if="!editingCompany">
                  <el-button size="small" type="primary" plain @click="startEditCompany">
                    <el-icon><Edit /></el-icon>编辑
                  </el-button>
                </template>
                <template v-else>
                  <el-button size="small" text @click="cancelEditCompany">取消</el-button>
                  <el-button size="small" type="primary" :loading="savingCompany" @click="saveCompany">保存</el-button>
                </template>
              </div>
            </div>
              <div v-if="!editingCompany" class="sp-bc-body">
              <div class="sp-kv-section"><div class="sp-kv-section-title">基本信息</div>
                <div class="sp-kv-row"><span class="sp-kv-label">账套名称</span><span class="sp-kv-value sp-kv-value--strong">{{ company?.name || '—' }}</span></div>
                <div class="sp-kv-row"><span class="sp-kv-label">当前期间</span><span class="sp-kv-value"><el-tag size="small" effect="plain" type="primary">{{ company?.period || '—' }}</el-tag></span></div>
                <div class="sp-kv-row"><span class="sp-kv-label">科目数量</span><span class="sp-kv-value">{{ subjectsCount }} 个</span></div>
              </div>
              <div class="sp-kv-section"><div class="sp-kv-section-title">联系方式</div>
                <div class="sp-kv-row"><span class="sp-kv-label">联系人</span><span class="sp-kv-value">{{ company?.contactPerson || '—' }}</span></div>
                <div class="sp-kv-row"><span class="sp-kv-label">企业法人</span><span class="sp-kv-value">{{ company?.legalRepresentative || '—' }}</span></div>
                <div class="sp-kv-row"><span class="sp-kv-label">电话</span><span class="sp-kv-value">{{ company?.phone || '—' }}</span></div>
              </div>
              <div class="sp-kv-section"><div class="sp-kv-section-title">其他信息</div>
                <div class="sp-kv-row"><span class="sp-kv-label">地址</span><span class="sp-kv-value">{{ company?.address || '—' }}</span></div>
                <div class="sp-kv-row"><span class="sp-kv-label">税号</span><span class="sp-kv-value sp-kv-value--mono">{{ company?.taxNo || '—' }}</span></div>
              </div>
            </div>
            <div v-else class="sp-bc-body sp-bc-body--edit">
              <el-form :model="companyForm" label-position="top" class="sp-company-form">
                <el-form-item label="账套名称"><el-input :model-value="company?.name" disabled /></el-form-item>
                <div class="sp-form-row">
                  <el-form-item label="联系人"><el-input v-model="companyForm.contactPerson" placeholder="联系人姓名" /></el-form-item>
                  <el-form-item label="企业法人"><el-input v-model="companyForm.legalRepresentative" placeholder="企业法人姓名" /></el-form-item>
                </div>
                <el-form-item label="电话"><el-input v-model="companyForm.phone" placeholder="联系电话" /></el-form-item>
                <el-form-item label="地址"><el-input v-model="companyForm.address" placeholder="公司地址" /></el-form-item>
                <el-form-item label="税号"><el-input v-model="companyForm.taxNo" placeholder="纳税人识别号（18位）" maxlength="18" /></el-form-item>
              </el-form>
            </div>
          </div>
          <!-- 右：个人信息 -->
          <div class="sp-basic-card sp-basic-card--user">
            <div class="sp-bc-header">
              <div class="sp-bc-header-left">
                <span class="sp-bc-icon sp-bc-icon--user"><el-icon :size="16"><User /></el-icon></span>
                <span class="sp-bc-title">个人信息</span>
              </div>
            </div>
            <div class="sp-bc-body sp-bc-body--user">
              <div class="sp-user-avatar-row">
                <div class="sp-user-avatar">{{ (currentUser?.alias || currentUser?.username || '?').charAt(0).toUpperCase() }}</div>
                <div class="sp-user-avatar-info">
                  <div class="sp-user-avatar-name">{{ currentUser?.alias || currentUser?.username || '—' }}</div>
                  <el-tag size="small" effect="plain" :type="currentUser?.role === 'admin' ? 'danger' : 'primary'">{{ roleLabel }}</el-tag>
                </div>
              </div>
              <div class="sp-kv-section sp-kv-section--compact">
                <div class="sp-kv-row"><span class="sp-kv-label">用户名</span><span class="sp-kv-value">{{ currentUser?.username || '—' }}</span></div>
                <div class="sp-kv-row"><span class="sp-kv-label">所属账套</span><span class="sp-kv-value sp-kv-value--mono">{{ currentUser?.companyId || '—' }}</span></div>
              </div>
              <div class="sp-user-actions">
                <el-button class="sp-pwd-btn" @click="pwdDialogOpen = true"><el-icon><Lock /></el-icon>修改密码</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 账套管理 ===== -->
        <div v-else-if="activeMenu === 'accounts'" class="sp-panel">
          <div class="sp-panel-header">
            <div class="sp-panel-title-line"></div><span>账套列表</span>
            <el-button size="small" type="primary" style="margin-left:auto" @click="handleCreateCompany"><el-icon><Plus /></el-icon>新增账套</el-button>
          </div>
          <div class="sp-panel-body">
            <div class="ck-list">
              <div v-for="row in companies" :key="row.id" class="ck-item" :class="row.id === company?.id ? 'ck-item--pass' : ''">
                <div class="ck-body">
                  <template v-if="editingAccountId === row.id">
                    <div class="ck-name" style="display:flex;align-items:center;gap:8px">
                      <el-input v-model="editingAccountName" size="small" style="width:200px" @keyup.enter="saveRenameAccount(row)" @keyup.escape="cancelRenameAccount" />
                      <el-button size="small" type="primary" @click="saveRenameAccount(row)">确定</el-button>
                      <el-button size="small" @click="cancelRenameAccount">取消</el-button>
                    </div>
                  </template>
                  <template v-else>
                    <div class="ck-name">
                      <span :class="{ 'sp-current-name': row.id === company?.id }">{{ row.name }}</span>
                      <el-tag v-if="row.id === company?.id" size="small" type="primary" effect="dark" style="margin-left:6px">当前</el-tag>
                    </div>
                    <div class="ck-detail">
                      <span>期间 {{ row.period || '—' }}</span>
                      <span v-if="row.contactPerson">· 联系人 {{ row.contactPerson }}</span>
                      <span v-if="row.legalRepresentative">· 法人 {{ row.legalRepresentative }}</span>
                      <span class="ck-detail-text">· {{ row.createdAt?.slice(0,10) || '' }}</span>
                    </div>
                  </template>
                </div>
                <div v-if="editingAccountId !== row.id" class="ck-actions">
                  <el-button size="small" text type="primary" @click="startRenameAccount(row)" :disabled="editingAccountId !== null">重命名</el-button>
                  <el-button size="small" text type="danger" :disabled="row.id === company?.id" @click="openDeleteConfirm(row)">删除</el-button>
                </div>
              </div>
              <el-empty v-if="!companies.length" description="暂无账套数据" :image-size="80" />
            </div>
          </div>
        </div>

        <!-- ===== 凭证字 ===== -->
        <div v-else-if="activeMenu === 'voucherWords'" class="sp-panel">
          <div class="sp-panel-header">
            <div class="sp-panel-title-line"></div><span>凭证字列表</span>
            <span class="sp-panel-subtitle">全局凭证字号设置，当前账套所有凭证共用</span>
            <el-button size="small" type="primary" style="margin-left:auto" @click="openCreateVw"><el-icon><Plus /></el-icon>新增凭证字</el-button>
          </div>
          <div class="sp-panel-body">
            <div class="ck-list" v-loading="vwLoading">
              <div v-for="row in voucherWords" :key="row.id" class="ck-item" :class="row.is_default ? 'ck-item--pass' : ''">
                <div class="ck-body">
                  <div class="ck-name vw-card-word">{{ row.word }}</div>
                  <div class="ck-desc">打印标题：{{ row.print_title || '—' }}</div>
                </div>
                <div class="ck-actions">
                  <el-radio :model-value="row.is_default" :value="1" size="small" @change="handleSetDefaultVw(row)" :disabled="row.is_default===1">
                    {{ row.is_default===1 ? '默认' : '设为默认' }}
                  </el-radio>
                  <el-button size="small" text type="primary" @click="openEditVw(row)">编辑</el-button>
                </div>
              </div>
              <el-empty v-if="!voucherWords.length && !vwLoading" description="暂无凭证字" :image-size="80" />
            </div>
          </div>
        </div>

        <!-- ===== 期间管理（结账） ===== -->
        <div v-else-if="activeMenu === 'periods'" class="sp-panel">
          <div class="sp-panel-header">
            <div class="sp-panel-title-line"></div><span>全年会计期间</span>
          </div>
          <div class="sp-panel-body">
            <ClosingView />
          </div>
        </div>

        <!-- ===== 用户管理 ===== -->
        <div v-else-if="activeMenu === 'users'" class="sp-panel">
          <div class="sp-panel-header">
            <div class="sp-panel-title-line"></div><span>用户列表</span>
            <el-button size="small" type="primary" style="margin-left:auto" @click="openCreateUser"><el-icon><Plus /></el-icon>新增用户</el-button>
          </div>
          <div class="sp-panel-body">
            <div class="ck-list">
              <div v-for="row in users" :key="row.id" class="ck-item" :class="row.enabled ? '' : 'ck-item--warn'">
                <div class="ck-body">
                  <div class="ck-name">
                    {{ row.username }}
                    <span v-if="row.alias" class="ck-desc">— {{ row.alias }}</span>
                  </div>
                  <div class="ck-detail">
                    <el-tag size="small" :type="row.role==='admin'?'danger':row.role==='auditor'?'warning':'info'">
                      {{ ({admin:'管理员',accountant:'会计',auditor:'审计员',viewer:'查看者'} as Record<string, string>)[row.role]||row.role }}
                    </el-tag>
                    <span class="ck-detail-text">{{ row.createdAt?.slice(0,10) || '' }}</span>
                  </div>
                </div>
                <div class="ck-actions">
                  <el-switch
                    v-if="row.role!=='admin'"
                    :model-value="row.enabled === 1"
                    size="small"
                    @change="handleToggleUser(row)"
                  />
                  <span v-else class="sp-disabled-hint" style="font-size:11px;color:var(--epp-ink-sub)">系统保留</span>
                  <el-button size="small" text type="primary" @click="openEditUser(row)">编辑</el-button>
                </div>
              </div>
              <el-empty v-if="!users.length" description="暂无用户数据" :image-size="80" />
            </div>
          </div>
        </div>

        <!-- ===== 操作日志 ===== -->
        <div v-else-if="activeMenu === 'opLogs'" class="sp-panel">
          <div class="sp-panel-header">
            <div class="sp-panel-title-line" style="background:var(--epp-accent)"></div>
            <span>操作日志</span>
            <span class="sp-panel-subtitle">记录系统关键操作，最多保留 500 条</span>
          </div>
          <div class="sp-panel-body">
            <!-- 过滤栏 -->
            <div class="oplog-filter">
              <div class="oplog-filter-left">
                <el-date-picker
                  v-model="opLogDateRange"
                  type="daterange"
                  range-separator="至"
                  start-placeholder="开始日期"
                  end-placeholder="结束日期"
                  size="small"
                  format="YYYY-MM-DD"
                  value-format="YYYY-MM-DD"
                  style="width:260px"
                  :clearable="true"
                  @change="loadOpLogs"
                />
                <el-select v-model="opLogLimit" size="small" style="width:110px" @change="loadOpLogs">
                  <el-option :value="30" label="最近30条" />
                  <el-option :value="50" label="最近50条" />
                  <el-option :value="100" label="最近100条" />
                  <el-option :value="200" label="最近200条" />
                </el-select>
              </div>
              <div class="oplog-filter-right">
                <el-button size="small" @click="exportOpLogs"><el-icon><Download /></el-icon>导出</el-button>
                <el-button size="small" text @click="resetOpLogFilter"><el-icon><RefreshRight /></el-icon>重置</el-button>
                <span class="oplog-count">共 {{ opLogs.length }} 条</span>
              </div>
            </div>

            <!-- 日志列表 -->
            <div class="oplog-list" v-loading="opLogsLoading">
              <div v-for="log in opLogs" :key="log.id" class="oplog-item">
                <div class="oplog-icon">
                  <el-icon :size="18">
                    <Clock v-if="log.action.includes('结账')" />
                    <Edit v-else-if="log.action.includes('创建') || log.action.includes('添加')" />
                    <View v-else-if="log.action.includes('审核')" />
                    <Download v-else-if="log.action.includes('过账')" />
                    <Tickets v-else />
                  </el-icon>
                </div>
                <div class="oplog-body">
                  <div class="oplog-line1">
                    <el-tag :type="actionTagType(log.action)" size="small" effect="plain" disable-transitions>
                      {{ actionLabel(log.action) }}
                    </el-tag>
                    <span class="oplog-target">{{ log.target }}</span>
                  </div>
                  <div class="oplog-line2">
                    <span class="oplog-detail">{{ log.detail }}</span>
                    <span class="oplog-sep">·</span>
                    <span class="oplog-user">{{ log.username }}</span>
                    <span class="oplog-sep">·</span>
                    <span class="oplog-time">{{ log.createdAt.replace('T', ' ').substring(0, 19) }}</span>
                  </div>
                </div>
              </div>
              <el-empty v-if="!opLogs.length && !opLogsLoading" description="暂无操作日志" :image-size="60" />
            </div>
          </div>
        </div>

        <!-- ===== 数据管理 ===== -->
        <div v-else-if="activeMenu === 'dataManage'" class="sp-data-grid">
          <div class="sp-panel sp-data-panel">
            <div class="sp-panel-header"><div class="sp-panel-title-line" style="background:var(--epp-gold)"></div><span>数据库信息</span><el-button size="small" text style="margin-left:auto" :loading="dbLoading" @click="loadDbInfo"><el-icon><RefreshRight /></el-icon>刷新</el-button></div>
            <div class="sp-panel-body" v-loading="dbLoading">
              <div class="db-info-grid">
                <div class="db-info-item"><span class="db-info-label">数据库路径</span><span class="db-info-value db-info-path">{{ (dbInfo?.dbPath || '—').replace(/\\/g,'\\') }}</span></div>
                <div class="db-info-item"><span class="db-info-label">文件大小</span><span class="db-info-value">{{ dbInfo&&!dbInfo.isMock?formatFileSize(dbInfo.dbSize):'—' }}</span></div>
                <div class="db-info-item"><span class="db-info-label">数据页数</span><span class="db-info-value">{{ dbInfo?.pageCount||'—' }}</span></div>
                <div class="db-info-item"><span class="db-info-label">空闲页数</span><span class="db-info-value">{{ dbInfo?.freelistCount||'—' }}</span></div>
              </div>
              <div v-if="dbInfo?.tableCounts&&Object.keys(dbInfo.tableCounts).length" class="db-table-stats">
                <div class="db-table-stats-title">各表记录数</div>
                <div class="db-table-stats-list"><span v-for="(cnt,name) in dbInfo.tableCounts" :key="name" class="db-table-stat-chip"><code>{{ name }}</code> {{ cnt }}</span></div>
              </div>
              <div v-if="!dbInfo" class="sp-empty-hint"><el-icon><Coin /></el-icon><span>点击右上角刷新按钮加载数据库信息</span></div>
            </div>
          </div>
          <div class="sp-panel sp-data-panel">
            <div class="sp-panel-header"><div class="sp-panel-title-line" style="background:#e6a23c"></div><span>数据库整理</span></div>
            <div class="sp-panel-body">
              <p class="sp-data-desc">数据库在长期使用后会产生碎片，导致文件增大、性能下降。执行整理可重组数据库结构、回收空间，提升查询效率。</p>
              <p class="sp-data-warn"><strong>提示：</strong>建议先备份数据库再执行整理，整理过程中请勿关闭程序。</p>
              <el-button type="warning" :loading="vacuuming" :icon="RefreshRight" @click="handleVacuum">{{ vacuuming?'正在整理...':'开始整理 (VACUUM)' }}</el-button>
            </div>
          </div>
          <div class="sp-panel sp-data-panel">
            <div class="sp-panel-header"><div class="sp-panel-title-line" style="background:#10b981"></div><span>备份与导出</span></div>
            <div class="sp-panel-body">
              <div class="db-actions">
                <div class="db-action-card">
                  <div class="db-action-icon" style="background:rgba(16,185,129,0.1);color:#10b981"><el-icon :size="24"><FolderOpened /></el-icon></div>
                  <div class="db-action-body"><div class="db-action-title">备份数据库</div><div class="db-action-desc">将整个 SQLite 数据库文件复制到指定位置，作为完整备份</div></div>
                  <el-button type="primary" plain :loading="backingUp" @click="handleBackup">{{ backingUp?'备份中...':'备份' }}</el-button>
                </div>
                <div class="db-action-card">
                  <div class="db-action-icon" style="background:rgba(99,102,241,0.1);color:#6366f1"><el-icon :size="24"><Download /></el-icon></div>
                  <div class="db-action-body"><div class="db-action-title">导出数据 (JSON)</div><div class="db-action-desc">将所有表数据导出为 JSON 格式文件，可用于迁移或数据分析</div></div>
                  <el-button type="primary" plain :loading="exporting" @click="handleExportJson">{{ exporting?'导出中...':'导出' }}</el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== 系统信息 ===== -->
        <div v-else-if="activeMenu === 'system'" class="sp-panel">
          <div class="sp-panel-header"><div class="sp-panel-title-line"></div><span>系统信息</span></div>
          <div class="sp-panel-body">
            <el-descriptions :column="1" border size="small" class="sp-desc">
              <el-descriptions-item label="应用名称">ERP 外账系统</el-descriptions-item>
              <el-descriptions-item label="版本号">v1.0.0</el-descriptions-item>
              <el-descriptions-item label="技术栈">Vue 3 + Element Plus + Electron + SQLite</el-descriptions-item>
              <el-descriptions-item label="运行环境">
                <el-tag v-if="isElectron" size="small" type="success" effect="dark">Electron 桌面端</el-tag>
                <el-tag v-else size="small">浏览器开发模式</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="路由模式">Hash 模式 (适配 file:// 协议)</el-descriptions-item>
              <el-descriptions-item label="数据存储">{{ isElectron ? 'SQLite 本地数据库 (Rabbit_ERP.db)' : 'localStorage 浏览器缓存' }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

      </div><!-- /sp-content -->
    </div><!-- /sp-layout -->

    <!-- ========== 删除账套确认对话框（输入名称确认） ========== -->
    <el-dialog v-model="deleteConfirmOpen" title="删除账套" width="440px" :close-on-click-modal="false">
      <div style="margin-bottom:16px;font-size:14px;color:#303133">
        此操作<strong style="color:#f56c6c">不可恢复</strong>，关联的所有数据将被同时删除。
      </div>
      <div style="margin-bottom:8px;font-size:13px;color:#909399">
        请输入账套名称 <strong style="color:#303133">{{ deleteTarget?.name }}</strong> 以确认删除：
      </div>
      <el-input v-model="deleteConfirmInput" placeholder="请输入账套名称" @keyup.enter="confirmDeleteCompany" />
      <template #footer>
        <el-button @click="deleteConfirmOpen = false">取消</el-button>
        <el-button type="danger" :disabled="deleteConfirmInput !== deleteTarget?.name" @click="confirmDeleteCompany">
          确认删除
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== 修改密码对话框 ========== -->
    <el-dialog v-model="pwdDialogOpen" title="修改密码" width="420px" :close-on-click-modal="false" draggable>
      <el-form :model="pwdForm" label-width="90px">
        <el-form-item label="原密码">
          <el-input v-model="pwdForm.oldPassword" type="password" show-password placeholder="请输入原密码" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="savingPwd" @click="changePassword">确认修改</el-button>
      </template>
    </el-dialog>

    <!-- ========== 新增/编辑用户对话框 ========== -->
    <el-dialog v-model="userDialog.open" :title="userDialog.mode === 'create' ? '新增用户' : '编辑用户'" width="440px" :close-on-click-modal="false" draggable>
      <el-form :model="userDialog" label-width="90px">
        <el-form-item label="用户名" v-if="userDialog.mode === 'create'">
          <el-input v-model="userDialog.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="用户名" v-else>
          <span class="sp-form-readonly">{{ userDialog.username }}</span>
        </el-form-item>
        <el-form-item label="密码" v-if="userDialog.mode === 'create'">
          <el-input v-model="userDialog.password" type="password" show-password placeholder="设置登录密码" />
        </el-form-item>
        <el-form-item label="显示名">
          <el-input v-model="userDialog.alias" placeholder="显示名称（可选）" />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userDialog.role" style="width:100%">
            <el-option value="admin" label="系统管理员" />
            <el-option value="accountant" label="会计" />
            <el-option value="auditor" label="审计员" />
            <el-option value="viewer" label="查看者" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="savingUser" @click="saveUser">
          {{ userDialog.mode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== 凭证字新增/编辑对话框 ========== -->
    <el-dialog v-model="vwDialog.open" :title="vwDialog.mode === 'create' ? '新增凭证字' : '编辑凭证字'" width="460px" :close-on-click-modal="false" draggable>
      <el-form :model="vwDialog" label-width="90px">
        <el-form-item label="凭证字">
          <el-select v-model="vwDialog.word" placeholder="请选择凭证字" filterable allow-create style="width: 100%">
            <el-option v-for="w in presetVoucherWords" :key="w" :label="w" :value="w" />
          </el-select>
        </el-form-item>
        <el-form-item label="打印标题">
          <el-input v-model="vwDialog.printTitle" placeholder="如：记账凭证" maxlength="50" />
        </el-form-item>
        <el-form-item label="是否默认">
          <el-radio-group v-model="vwDialog.isDefault">
            <el-radio :value="1">是</el-radio>
            <el-radio :value="0">否</el-radio>
          </el-radio-group>
          <div class="form-hint-sm">设为默认后，新建凭证时将自动选用该凭证字</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="vwDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="savingVw" @click="saveVoucherWord">
          {{ vwDialog.mode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ================================================================
   SettingsView — "Accounting Ledger Modernist" 财务系统设置
   设计方向：物理账簿质感 → 深墨蓝权威 / 烫金强调 / 账簿纸温润
   记忆锚点：统计卡片左侧金边竖条 + 面板标题账簿分隔线
   ================================================================ */

/* ---- CSS 变量（局部重写，仅覆盖与全局不同的值） ---- */
.settings-page {
  --epp-line: #e2e8f0;
  --epp-line-light: #f1f5f9;
  --epp-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);

  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--epp-ledger);
  -webkit-app-region: no-drag;
}

/* ================================================================
   页面标题栏 — 深蓝黑底 + 底部强调线
   ================================================================ */
.sp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 28px;
  background: var(--epp-ink);
  border-bottom: 2px solid var(--epp-accent);
  flex-shrink: 0;
}

.sp-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
}

.sp-header-left .el-icon {
  color: var(--epp-gold-light);
}

.sp-header-left h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #f0ede6;
}

.sp-header-right {
  display: flex;
  align-items: center;
}

.sp-user-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.08);
  padding: 5px 14px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}

.sp-user-badge .el-icon {
  color: var(--epp-gold-light);
}

/* ================================================================
   主体布局：左侧导航 + 右侧内容区
   ================================================================ */
.sp-layout {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ---- 左侧导航 ---- */
.sp-nav {
  width: 170px;
  min-width: 170px;
  background: var(--epp-paper);
  border-right: 1px solid var(--epp-line-light);
  padding: 12px 0;
  overflow-y: auto;
  flex-shrink: 0;
}

.sp-nav-group-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--epp-ink-sub);
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 14px 18px 6px;
}

.sp-nav-group-label:first-child {
  padding-top: 6px;
}

.sp-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  margin: 1px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--epp-ink-sub);
  transition: all 0.15s;
  user-select: none;
}

.sp-nav-item:hover {
  background: rgba(8, 145, 178, 0.05);
  color: var(--epp-ink-text);
}

.sp-nav-item--active {
  background: rgba(8, 145, 178, 0.1);
  color: var(--epp-ink);
  font-weight: 600;
}

.sp-nav-item--active .sp-nav-item-icon {
  color: var(--epp-accent);
}

.sp-nav-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  flex-shrink: 0;
}

/* ---- 右侧内容区 ---- */
.sp-content {
  flex: 1;
  padding: 16px 20px 20px;
  overflow-y: auto;
  overflow-x: hidden;
  min-width: 0;
}

/* ================================================================
   内容面板 — 账簿纸质感
   ================================================================ */
.sp-panel {
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 2px;
  overflow: hidden;
  box-shadow: var(--epp-shadow);
}

.sp-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 22px;
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-bottom: 1px solid var(--epp-line);
  letter-spacing: 0.3px;
}

/* 面板标题左侧装饰线 — 账簿分隔线风格 */
.sp-panel-title-line {
  width: 3px;
  height: 17px;
  border-radius: 1px;
  background: var(--epp-gold);
  flex-shrink: 0;
}

.sp-panel-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--epp-ink-sub);
  letter-spacing: 0.5px;
}

.sp-panel-body {
  padding: 22px;
}

/* ================================================================
   el-descriptions — 账簿标签格
   ================================================================ */
.sp-desc :deep(.el-descriptions__label) {
  background: #f1f5f9;
  font-weight: 500;
  color: var(--epp-ink-sub);
  width: 120px;
  font-size: 13px;
}

.sp-desc :deep(.el-descriptions__content) {
  color: var(--epp-ink-text);
  font-size: 13px;
}

.sp-desc :deep(.el-descriptions__body) {
  border-color: var(--epp-line-light);
}

/* ================================================================
   表格 — 账簿栏线条纹
   ================================================================ */
.sp-panel-body :deep(.el-table) {
  --el-table-border-color: var(--epp-line-light);
  --el-table-header-bg-color: #f1f5f9;
  --el-table-row-hover-bg-color: #f8fafc;
  --el-table-current-row-bg-color: #eef2ff;
}

.sp-panel-body :deep(.el-table th.el-table__cell) {
  background: #f1f5f9 !important;
  color: var(--epp-ink-sub) !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  letter-spacing: 0.4px;
  border-color: var(--epp-line-light) !important;
}

.sp-panel-body :deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #f8fafc;
}

.sp-panel-body :deep(.el-table td.el-table__cell) {
  border-color: var(--epp-line-light);
  color: var(--epp-ink-text);
  font-size: 13px;
}

/* ================================================================
   Element Plus 全局深度覆盖 — 按钮 / 标签 / 对话框
   ================================================================ */
/* 主按钮：绿色（禁用态使用默认灰色保证可读性） */
.sp-panel-body :deep(.el-button--primary),
.sp-basic-card :deep(.el-button--primary),
.settings-page :deep(.el-button--primary) {
  --el-button-bg-color: var(--epp-success);
  --el-button-border-color: var(--epp-success);
  --el-button-hover-bg-color: #059669;
  --el-button-hover-border-color: #059669;
  --el-button-active-bg-color: #047857;
  --el-button-active-border-color: #047857;
  --el-button-disabled-bg-color: var(--el-disabled-bg-color);
  --el-button-disabled-border-color: var(--el-border-color-lighter);
  --el-button-disabled-text-color: var(--el-disabled-text-color);
}

/* plain 按钮：青绿强调风格 */
.sp-panel :deep(.el-button--primary.is-plain),
.sp-basic-card :deep(.el-button--primary.is-plain) {
  --el-button-bg-color: rgba(8, 145, 178, 0.06);
  --el-button-border-color: var(--epp-accent);
  --el-button-text-color: var(--epp-accent);
  --el-button-hover-bg-color: rgba(8, 145, 178, 0.12);
  --el-button-hover-border-color: var(--epp-accent-light);
  --el-button-hover-text-color: var(--epp-accent);
}

/* 标签：金调适配 */
.settings-page :deep(.el-tag--primary) {
  --el-tag-bg-color: rgba(10, 30, 61, 0.08);
  --el-tag-border-color: rgba(10, 30, 61, 0.15);
  --el-tag-text-color: var(--epp-ink);
}

.settings-page :deep(.el-tag--success) {
  --el-tag-bg-color: rgba(82, 196, 26, 0.08);
  --el-tag-text-color: #3a8c1a;
}

/* 对话框：账簿纸底色 */
.settings-page :deep(.el-dialog) {
  --el-dialog-bg-color: var(--epp-paper);
  border-radius: 2px;
  box-shadow: 0 4px 24px rgba(10, 30, 61, 0.12);
}

.settings-page :deep(.el-dialog__header) {
  border-bottom: 1px solid var(--epp-line-light);
  padding: 18px 24px;
  margin: 0;
}

.settings-page :deep(.el-dialog__title) {
  font-weight: 600;
  color: var(--epp-ink-text);
  font-size: 15px;
  letter-spacing: 0.3px;
}

.settings-page :deep(.el-dialog__body) {
  padding: 24px;
}

.settings-page :deep(.el-dialog__footer) {
  border-top: 1px solid var(--epp-line-light);
  padding: 14px 24px;
}

/* 输入框 */
.settings-page :deep(.el-input__inner) {
  border-radius: 2px;
}

.settings-page :deep(.el-input__inner:focus) {
  border-color: var(--epp-gold);
}

/* 下拉选择 */
.settings-page :deep(.el-select .el-input__inner:focus) {
  border-color: var(--epp-gold);
}

/* ================================================================
   杂项
   ================================================================ */
.sp-current-name {
  font-weight: 700;
  color: var(--epp-ink);
}




.sp-form-readonly {
  color: var(--epp-ink-text);
  font-weight: 600;
  font-size: 14px;
}

.sp-disabled-hint {
  color: var(--epp-ink-sub);
  font-size: 13px;
}

/* ---- 凭证字卡片 ---- */
.vw-card-word {
  font-size: 22px;
  font-weight: 700;
  color: var(--epp-ink);
  font-family: 'KaiTi', 'STKaiti', '楷体', serif;
  letter-spacing: 2px;
}

.form-hint-sm {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

/* ================================================================
   ck-* 通用检查项卡片样式（复用于用户管理/凭证字等列表）
   ================================================================ */
.ck-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ck-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid var(--epp-line-light);
  border-radius: 6px;
  background: var(--epp-paper);
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.ck-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 1px 4px rgba(10, 30, 61, 0.05);
}

.ck-item--pass {
  border-color: #a7f3d0;
  background: #f0fdf4;
}

.ck-item--fail {
  border-color: #fecaca;
  background: #fef2f2;
}

.ck-item--warn {
  border-color: #fde68a;
  background: #fffbeb;
}

.ck-body {
  flex: 1;
  min-width: 0;
}

.ck-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
}

.ck-desc {
  font-weight: 400;
  font-size: 12px;
  color: var(--epp-ink-sub);
}

.ck-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--epp-ink-sub);
}

.ck-detail-text {
  color: var(--epp-ink-sub);
}

.ck-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* ================================================================
   数据管理页
   ================================================================ */
.sp-data-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}


/* 数据库信息网格 */
.db-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.db-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid var(--epp-line-light);
}

.db-info-label {
  font-size: 11px;
  color: var(--epp-ink-sub);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.db-info-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--epp-ink-text);
  word-break: break-all;
}

.db-info-path {
  font-size: 11px;
  font-family: 'Courier New', monospace;
}

/* 表记录统计 */
.db-table-stats {
  margin-top: 8px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid var(--epp-line-light);
}

.db-table-stats-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--epp-ink-sub);
  margin-bottom: 8px;
}

.db-table-stats-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.db-table-stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 3px;
  font-size: 12px;
  color: var(--epp-ink-text);
}

.db-table-stat-chip code {
  font-size: 11px;
  color: var(--epp-ink-sub);
  background: none;
}

.sp-empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  font-size: 13px;
  color: #909399;
}

/* 数据管理描述文字 */
.sp-data-desc {
  font-size: 13px;
  color: var(--epp-ink-sub);
  line-height: 1.7;
  margin: 0 0 10px;
}

.sp-data-warn {
  font-size: 12px;
  color: #e6a23c;
  padding: 8px 12px;
  background: rgba(230, 162, 60, 0.06);
  border-radius: 4px;
  margin-bottom: 14px;
  line-height: 1.6;
}

/* 备份/导出操作卡片 */
.db-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.db-action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid var(--epp-line-light);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.db-action-card:hover {
  border-color: var(--epp-line);
  box-shadow: 0 1px 6px rgba(0,0,0,0.04);
}

.db-action-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.db-action-body {
  flex: 1;
  min-width: 0;
}

.db-action-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
  margin-bottom: 4px;
}

.db-action-desc {
  font-size: 12px;
  color: var(--epp-ink-sub);
  line-height: 1.5;
}

/* ================================================================
   基础信息 — 双列卡片布局
   ================================================================ */
.sp-basic-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  align-items: start;
}

/* ---- 基础信息卡片 ---- */
.sp-basic-card {
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: box-shadow 0.25s, border-color 0.25s;
}

.sp-basic-card:hover {
  border-color: var(--epp-line);
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

/* 卡片头部 */
.sp-bc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--epp-line-light);
  background: linear-gradient(180deg, #fafbfc 0%, #f8fafc 100%);
}

.sp-bc-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-bc-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 145, 178, 0.1);
  color: var(--epp-accent);
}

.sp-bc-icon--user {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.sp-bc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
  letter-spacing: 0.3px;
}

.sp-bc-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-bc-edit-btn {
  transition: all 0.2s;
}

/* 卡片内容 */
.sp-bc-body {
  padding: 20px;
}

.sp-bc-body--edit {
  padding: 16px 20px 20px;
}

.sp-bc-body--user {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ---- Key-Value 信息展示 ---- */
.sp-kv-section {
  margin-bottom: 18px;
}

.sp-kv-section:last-child {
  margin-bottom: 0;
}

.sp-kv-section--compact {
  margin-bottom: 14px;
}

.sp-kv-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--epp-ink-sub);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--epp-line-light);
}

.sp-kv-row {
  display: flex;
  align-items: center;
  padding: 7px 0;
}

.sp-kv-label {
  width: 90px;
  min-width: 90px;
  font-size: 13px;
  color: var(--epp-ink-sub);
  letter-spacing: 0.3px;
}

.sp-kv-value {
  font-size: 13px;
  color: var(--epp-ink-text);
  word-break: break-all;
}

.sp-kv-value--strong {
  font-weight: 600;
  font-size: 14px;
}

.sp-kv-value--mono {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  letter-spacing: 0.5px;
}

/* ---- 用户头像区域 ---- */
.sp-user-avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--epp-line-light);
}

.sp-user-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 1px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

.sp-user-avatar-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-user-avatar-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--epp-ink-text);
}

/* 安全操作区 */
.sp-user-actions {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--epp-line-light);
  display: flex;
  justify-content: center;
}

.sp-pwd-btn {
  width: 100%;
  justify-content: center;
  color: var(--epp-ink-sub);
  border-color: var(--epp-line);
  transition: all 0.2s;
}

.sp-pwd-btn:hover {
  color: var(--epp-accent);
  border-color: var(--epp-accent);
  background: rgba(8, 145, 178, 0.04);
}

/* ---- 编辑表单 ---- */
.sp-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.sp-company-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.sp-company-form :deep(.el-form-item__label) {
  font-size: 12px;
  font-weight: 500;
  color: var(--epp-ink-sub);
  padding-bottom: 4px;
}

.sp-company-form :deep(.el-input__inner) {
  border-radius: 4px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.sp-company-form :deep(.el-input__inner:focus) {
  border-color: var(--epp-accent);
  box-shadow: 0 0 0 1px rgba(8, 145, 178, 0.15);
}

/* ---- 操作日志面板 ---- */
.oplog-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid var(--epp-line-light);
  flex-wrap: wrap;
}
.oplog-filter-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.oplog-filter-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.oplog-count {
  font-size: 12px;
  color: var(--epp-ink-sub);
  font-weight: 500;
}

.oplog-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 500px;
  overflow-y: auto;
}
.oplog-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: background 0.15s, border-color 0.15s;
}
.oplog-item:hover {
  background: #f8fafc;
  border-color: var(--epp-line-light);
}
.oplog-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--epp-ink-sub);
}
.oplog-body {
  flex: 1;
  min-width: 0;
}
.oplog-line1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.oplog-target {
  font-size: 13px;
  font-weight: 600;
  color: var(--epp-ink-text);
}
.oplog-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--epp-ink-sub);
  flex-wrap: wrap;
}
.oplog-user {
  font-weight: 500;
}
.oplog-time {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
}
.oplog-sep {
  color: #cbd5e1;
}

/* ---- 响应式：窄屏折叠为单列 ---- */
@media (max-width: 780px) {
  .sp-basic-grid {
    grid-template-columns: 1fr;
  }
}
</style>
