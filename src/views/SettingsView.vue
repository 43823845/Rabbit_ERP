<script setup lang="ts">
// ponytail: 系统设置 — 基础信息/账套/凭证字/期间结账/用户/数据/系统
import { computed, onMounted, reactive, ref, watch, provide } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  User, OfficeBuilding, Calendar, Setting, Edit,
  Tickets, FolderOpened, Clock, Collection,
} from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import { useAuth } from '../auth';
import SettingsSubView from '../components/SettingsSubView.vue';
import type { Company, SysUser, UserRole, VoucherWordType, VoucherWordPayload, DatabaseInfo, OpLogEntry, AuxProjectType, AuxProjectValue } from '../api';

const api = getFinanceApi();
const auth = useAuth();

/* ---- 状态 ---- */
const loading = ref(false);
/** 当前激活的设置菜单项 */
const activeMenu = ref('accounts');

/** 导航菜单定义 */
interface NavItem { key: string; label: string; icon: typeof OfficeBuilding; adminOnly?: boolean }
interface NavGroup { label: string; items: NavItem[] }
const navGroups: NavGroup[] = [
  {
    label: '账套设置',
    items: [
      { key: 'accounts', label: '账套管理', icon: Tickets },
      { key: 'voucherWords', label: '凭证字', icon: Edit },
      { key: 'auxProjects', label: '辅助核算', icon: Collection },
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

/* ---- 账套管理 ---- */
/** 删除确认：需要输入账套名称 + 管理密码授权 */
const deleteConfirmOpen = ref(false);
const deleteTarget = ref<Company | null>(null);
const deleteConfirmInput = ref('');
const deleteAuthPassword = ref('');
const deleting = ref(false);

/** 编辑账套弹窗 */
const editCompanyDialogOpen = ref(false);
const editCompanyTarget = ref<Company | null>(null);
const editCompanyForm = reactive({ name: '', contactPerson: '', legalRepresentative: '', phone: '', address: '', taxNo: '' });
const savingEditCompany = ref(false);

function notifyCompanyChanged() {
  window.dispatchEvent(new CustomEvent('company-changed'));
}

function openEditCompany(c: Company) {
  editCompanyTarget.value = c;
  editCompanyForm.name = c.name || '';
  editCompanyForm.contactPerson = c.contactPerson || '';
  editCompanyForm.legalRepresentative = c.legalRepresentative || '';
  editCompanyForm.phone = c.phone || '';
  editCompanyForm.address = c.address || '';
  editCompanyForm.taxNo = c.taxNo || '';
  editCompanyDialogOpen.value = true;
}

async function handleSaveEditCompany() {
  const c = editCompanyTarget.value;
  if (!c) return;
  if (!editCompanyForm.name.trim()) {
    ElMessage.warning('账套名称不能为空'); return;
  }
  if (editCompanyForm.phone && !/^[\d\-\s()+]*$/.test(editCompanyForm.phone)) {
    ElMessage.warning('联系电话只能包含数字、短横线和空格'); return;
  }
  if (editCompanyForm.taxNo && editCompanyForm.taxNo.length > 0 && editCompanyForm.taxNo.length !== 18) {
    ElMessage.warning('纳税人识别号应为18位（统一社会信用代码）'); return;
  }

  savingEditCompany.value = true;
  try {
    const updated = await api.updateCompany(c.id, { ...editCompanyForm });
    companies.value = await api.getCompanies();
    if (company.value?.id === c.id) company.value = updated;
    editCompanyDialogOpen.value = false;
    ElMessage.success('账套信息已更新');
    notifyCompanyChanged();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '保存失败'); }
  finally { savingEditCompany.value = false; }
}

async function handleCreateCompany() {
  try {
    const { value: name, action } = await ElMessageBox.prompt('请输入新账套名称：', '新增账套', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '账套名称不能为空',
    });
    if (action !== 'confirm' || !name || !name.trim()) return;
    const c = await api.createCompany(name.trim());
    // 重新从 API 获取完整列表，避免本地 push 与 App.vue 不同步
    companies.value = await api.getCompanies();
    ElMessage.success(`账套「${c.name}」已创建`);
    notifyCompanyChanged();
  } catch (e: unknown) {
    if (e === 'cancel' || (e as any)?.action === 'cancel') return;
    ElMessage.error((e as Error)?.message || '创建失败');
  }
}


function openDeleteConfirm(c: Company) {
  deleteTarget.value = c;
  deleteConfirmInput.value = '';
  deleteAuthPassword.value = '';
  deleteConfirmOpen.value = true;
}

async function confirmDeleteCompany() {
  if (!deleteTarget.value) return;
  if (deleteConfirmInput.value !== deleteTarget.value.name) {
    ElMessage.warning('输入的账套名称不一致'); return;
  }
  if (!deleteAuthPassword.value) {
    ElMessage.warning('请输入管理员密码进行授权'); return;
  }
  deleting.value = true;
  try {
    // 验证管理员密码
    const loginResult = await api.login(currentUser.value?.username || '', deleteAuthPassword.value);
    if (!loginResult || loginResult.role !== 'admin') {
      ElMessage.error('管理员密码验证失败'); deleting.value = false; return;
    }
    await api.deleteCompany(deleteTarget.value.id);
    companies.value = await api.getCompanies();
    ElMessage.success('账套已删除');
    deleteConfirmOpen.value = false;
    notifyCompanyChanged();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '删除失败'); }
  finally { deleting.value = false; }
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

/* ---- 重置密码（管理员） ---- */
const pwdDialogOpen = ref(false);
const pwdTargetUser = ref<SysUser | null>(null);
const pwdForm = reactive({ newPassword: '', confirmPassword: '' });
const savingPwd = ref(false);

function openResetPassword(u: SysUser) {
  pwdTargetUser.value = u;
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
  pwdDialogOpen.value = true;
}

async function resetPassword() {
  if (!pwdForm.newPassword) {
    ElMessage.warning('请输入新密码'); return;
  }
  if (pwdForm.newPassword.length < 4) {
    ElMessage.warning('密码至少4位'); return;
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    ElMessage.warning('两次输入的新密码不一致'); return;
  }
  if (!pwdTargetUser.value) return;
  savingPwd.value = true;
  try {
    await api.resetUserPassword(pwdTargetUser.value.id, pwdForm.newPassword);
    ElMessage.success(`用户「${pwdTargetUser.value.username}」的密码已重置`);
    pwdDialogOpen.value = false;
    pwdForm.newPassword = '';
    pwdForm.confirmPassword = '';
  } catch (e: any) { ElMessage.error(e?.message || '密码重置失败'); }
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

async function handleDeleteVw(row: VoucherWordType) {
  // 先检查是否有凭证引用了该凭证字
  vwLoading.value = true;
  try {
    const vouchers = await api.listVouchers({ voucherWord: row.word });
    if (vouchers.length > 0) {
      ElMessage.warning(`凭证字「${row.word}」已被 ${vouchers.length} 张凭证使用，无法删除。请先将相关凭证改为其他凭证字后再操作。`);
      return;
    }
  } catch (e: any) {
    ElMessage.error('检查凭证引用失败：' + (e?.message || '未知错误'));
    return;
  } finally {
    vwLoading.value = false;
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除凭证字「${row.word}」吗？此操作不可撤销。`,
      '确认删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch { return; }
  try {
    await api.deleteVoucherWord(row.id);
    ElMessage.success(`凭证字「${row.word}」已删除`);
    await loadVoucherWords();
  } catch (e: any) { ElMessage.error(e?.message || '删除失败'); }
}

/* ---- 辅助核算类别管理 ---- */
const auxTypes = ref<AuxProjectType[]>([]);
const auxValues = ref<AuxProjectValue[]>([]);
const auxTypesLoading = ref(false);
const selectedAuxType = ref<AuxProjectType | null>(null);

interface AuxTypeDialogState {
  open: boolean; mode: 'create' | 'edit';
  id?: number; code: string; name: string;
}
const auxTypeDialog = reactive<AuxTypeDialogState>({ open: false, mode: 'create', code: '', name: '' });
const savingAuxType = ref(false);

interface AuxValueDialogState {
  open: boolean; mode: 'create' | 'edit';
  id?: number; code: string; name: string;
}
const auxValueDialog = reactive<AuxValueDialogState>({ open: false, mode: 'create', code: '', name: '' });
const savingAuxValue = ref(false);

async function loadAuxProjectTypes() {
  auxTypesLoading.value = true;
  try {
    auxTypes.value = await api.listAuxProjectTypes();
    // 保持选中状态：如果之前选中的类型还存在则保留
    if (selectedAuxType.value) {
      const found = auxTypes.value.find(t => t.id === selectedAuxType.value!.id);
      if (found) { selectedAuxType.value = found; await loadAuxValues(found.id); }
      else { selectedAuxType.value = null; auxValues.value = []; }
    }
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '加载辅助核算类别失败'); }
  finally { auxTypesLoading.value = false; }
}

async function loadAuxValues(typeId: number) {
  try { auxValues.value = await api.listAuxProjectValues(typeId); }
  catch (e: unknown) { ElMessage.error((e as Error)?.message || '加载核算项目失败'); }
}

function selectAuxType(t: AuxProjectType) {
  selectedAuxType.value = t;
  loadAuxValues(t.id);
}

function openCreateAuxType() {
  Object.assign(auxTypeDialog, { open: true, mode: 'create', id: undefined, code: '', name: '' });
}

function openEditAuxType(t: AuxProjectType) {
  Object.assign(auxTypeDialog, { open: true, mode: 'edit', id: t.id, code: t.code, name: t.name });
}

async function saveAuxType() {
  if (!auxTypeDialog.code.trim() || !auxTypeDialog.name.trim()) {
    ElMessage.warning('编码和名称不能为空'); return;
  }
  savingAuxType.value = true;
  try {
    if (auxTypeDialog.mode === 'create') {
      await api.createAuxProjectType({ code: auxTypeDialog.code.trim(), name: auxTypeDialog.name.trim() });
      ElMessage.success('辅助核算类别已创建');
    } else {
      await api.updateAuxProjectType({ id: auxTypeDialog.id!, code: auxTypeDialog.code.trim(), name: auxTypeDialog.name.trim() });
      ElMessage.success('辅助核算类别已更新');
    }
    auxTypeDialog.open = false;
    await loadAuxProjectTypes();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '操作失败'); }
  finally { savingAuxType.value = false; }
}

async function deleteAuxType(t: AuxProjectType) {
  try {
    const { value, action } = await ElMessageBox.prompt(
      `删除类别将同时删除其下所有核算项目，此操作不可恢复。\n请输入类别名称「${t.name}」以确认：`,
      '确认删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        inputPattern: new RegExp(`^${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        inputErrorMessage: `请输入「${t.name}」确认`,
      },
    );
    if (action !== 'confirm' || value !== t.name) return;
  } catch { return; }
  try {
    await api.deleteAuxProjectType(t.id);
    if (selectedAuxType.value?.id === t.id) { selectedAuxType.value = null; auxValues.value = []; }
    ElMessage.success('辅助核算类别已删除');
    await loadAuxProjectTypes();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '删除失败'); }
}

function openCreateAuxValue() {
  Object.assign(auxValueDialog, { open: true, mode: 'create', id: undefined, code: '', name: '' });
}

function openEditAuxValue(v: AuxProjectValue) {
  Object.assign(auxValueDialog, { open: true, mode: 'edit', id: v.id, code: v.code, name: v.name });
}

async function saveAuxValue() {
  if (!auxValueDialog.code.trim() || !auxValueDialog.name.trim()) {
    ElMessage.warning('编码和名称不能为空'); return;
  }
  if (!selectedAuxType.value) return;
  savingAuxValue.value = true;
  try {
    if (auxValueDialog.mode === 'create') {
      await api.createAuxProjectValue({ typeId: selectedAuxType.value.id, code: auxValueDialog.code.trim(), name: auxValueDialog.name.trim() });
      ElMessage.success('核算项目已创建');
    } else {
      await api.updateAuxProjectValue({ id: auxValueDialog.id!, code: auxValueDialog.code.trim(), name: auxValueDialog.name.trim() });
      ElMessage.success('核算项目已更新');
    }
    auxValueDialog.open = false;
    await loadAuxValues(selectedAuxType.value.id);
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '操作失败'); }
  finally { savingAuxValue.value = false; }
}

async function deleteAuxValue(v: AuxProjectValue) {
  try {
    const { value, action } = await ElMessageBox.prompt(
      `请输入项目名称「${v.name}」以确认删除：`,
      '确认删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        inputPattern: new RegExp(`^${v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
        inputErrorMessage: `请输入「${v.name}」确认`,
      },
    );
    if (action !== 'confirm' || value !== v.name) return;
  } catch { return; }
  try {
    await api.deleteAuxProjectValue(v.id);
    ElMessage.success('核算项目已删除');
    if (selectedAuxType.value) await loadAuxValues(selectedAuxType.value.id);
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '删除失败'); }
}

/* 切换菜单时自动加载数据 */
watch(activeMenu, (key) => {
  if (key === 'voucherWords') loadVoucherWords();
  if (key === 'auxProjects') loadAuxProjectTypes();
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

async function handleExportAll() {
  exporting.value = true;
  try {
    const res = await api.exportAllData();
    if (res.canceled) { exporting.value = false; return; }
    if (res.__error) { ElMessage.error(res.__error); exporting.value = false; return; }
    ElMessage.success(res.path ? `完整备份已导出至 ${res.path}` : '数据已导出');
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '导出失败'); }
  finally { exporting.value = false; }
}

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

/* 通过 provide/inject 向 SettingsSubView 共享所有状态 */
const settingsState = reactive({
  activeMenu, loading, companies, company, users,
  voucherWords, vwLoading,
  auxTypes, auxValues, selectedAuxType, auxTypesLoading,
  opLogs, opLogDateRange, opLogLimit, opLogsLoading,
  dbInfo, dbLoading, vacuuming, backingUp, exporting,
  isAdmin, currentUser, roleLabel,
  handleCreateCompany, openEditCompany, openDeleteConfirm,
  openCreateVw, openEditVw, handleSetDefaultVw, handleDeleteVw,
  openCreateAuxType, openEditAuxType, saveAuxType, deleteAuxType,
  selectAuxType, openCreateAuxValue, openEditAuxValue, saveAuxValue, deleteAuxValue,
  openCreateUser, openEditUser, handleToggleUser, openResetPassword,
  loadOpLogs, resetOpLogFilter, exportOpLogs, actionLabel, actionTagType,
  loadDbInfo, handleVacuum, handleBackup, handleExportJson, handleExportAll, formatFileSize,
  subjectsCount,
})
provide('settingsState', settingsState)
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

        <SettingsSubView />

      </div><!-- /sp-content -->
    </div><!-- /sp-layout -->

    <!-- ========== 编辑账套对话框 ========== -->
    <el-dialog v-model="editCompanyDialogOpen" :title="`编辑账套 — ${editCompanyTarget?.name || ''}`" width="540px" :close-on-click-modal="false" draggable>
      <el-form :model="editCompanyForm" label-width="110px" class="sp-company-form">
        <el-form-item label="账套名称" required>
          <el-input v-model="editCompanyForm.name" placeholder="请输入账套名称" maxlength="100" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="editCompanyForm.contactPerson" placeholder="联系人姓名" maxlength="50" />
        </el-form-item>
        <el-form-item label="法人代表">
          <el-input v-model="editCompanyForm.legalRepresentative" placeholder="法人代表姓名" maxlength="50" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="editCompanyForm.phone" placeholder="如 010-12345678" maxlength="30" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="editCompanyForm.address" placeholder="公司地址" maxlength="200" />
        </el-form-item>
        <el-form-item label="统一社会信用代码">
          <el-input v-model="editCompanyForm.taxNo" placeholder="18位统一社会信用代码" maxlength="18" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editCompanyDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="savingEditCompany" @click="handleSaveEditCompany">保存</el-button>
      </template>
    </el-dialog>

    <!-- ========== 删除账套确认对话框（输入名称 + 密码授权） ========== -->
    <el-dialog v-model="deleteConfirmOpen" title="删除账套" width="440px" :close-on-click-modal="false">
      <div style="margin-bottom:16px;font-size:14px;color:#303133">
        此操作<strong style="color:#f56c6c">不可恢复</strong>，关联的所有数据将被同时删除。
      </div>
      <div style="margin-bottom:8px;font-size:13px;color:#909399">
        请输入账套名称 <strong style="color:#303133">{{ deleteTarget?.name }}</strong> 以确认删除：
      </div>
      <el-input v-model="deleteConfirmInput" placeholder="请输入账套名称" style="margin-bottom:16px" />
      <div style="margin-bottom:8px;font-size:13px;color:#909399">
        请输入<strong style="color:#303133">管理员密码</strong>进行授权：
      </div>
      <el-input v-model="deleteAuthPassword" type="password" show-password placeholder="请输入管理员密码" @keyup.enter="confirmDeleteCompany" />
      <template #footer>
        <el-button @click="deleteConfirmOpen = false">取消</el-button>
        <el-button type="danger" :disabled="deleteConfirmInput !== deleteTarget?.name || !deleteAuthPassword" :loading="deleting" @click="confirmDeleteCompany">
          确认删除
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== 重置密码对话框（管理员） ========== -->
    <el-dialog v-model="pwdDialogOpen" title="重置密码" width="420px" :close-on-click-modal="false" draggable>
      <div style="margin-bottom:16px;font-size:14px;color:#303133">
        正在为用户 <strong>{{ pwdTargetUser?.username }}</strong>{{ pwdTargetUser?.alias ? `（${pwdTargetUser.alias}）` : '' }} 重置密码
      </div>
      <el-form :model="pwdForm" label-width="90px">
        <el-form-item label="新密码">
          <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="请输入新密码（至少4位）" />
        </el-form-item>
        <el-form-item label="确认新密码">
          <el-input v-model="pwdForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="savingPwd" @click="resetPassword">确认重置</el-button>
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

    <!-- ========== 辅助核算类别新增/编辑对话框 ========== -->
    <el-dialog v-model="auxTypeDialog.open" :title="auxTypeDialog.mode === 'create' ? '新增辅助核算类别' : '编辑辅助核算类别'" width="440px" :close-on-click-modal="false" draggable>
      <el-form :model="auxTypeDialog" label-width="90px">
        <el-form-item label="类别编码" required>
          <el-input v-model="auxTypeDialog.code" placeholder="如 DEPT、CUSTOMER" maxlength="20" />
        </el-form-item>
        <el-form-item label="类别名称" required>
          <el-input v-model="auxTypeDialog.name" placeholder="如 部门、客户" maxlength="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="auxTypeDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="savingAuxType" @click="saveAuxType">
          {{ auxTypeDialog.mode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- ========== 辅助核算项目值新增/编辑对话框 ========== -->
    <el-dialog v-model="auxValueDialog.open" :title="auxValueDialog.mode === 'create' ? '新增核算项目' : '编辑核算项目'" width="440px" :close-on-click-modal="false" draggable>
      <el-form :model="auxValueDialog" label-width="90px">
        <el-form-item label="项目编码" required>
          <el-input v-model="auxValueDialog.code" placeholder="如 001、A001" maxlength="20" />
        </el-form-item>
        <el-form-item label="项目名称" required>
          <el-input v-model="auxValueDialog.name" placeholder="如 财务部、张三" maxlength="50" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="auxValueDialog.open = false">取消</el-button>
        <el-button type="primary" :loading="savingAuxValue" @click="saveAuxValue">
          {{ auxValueDialog.mode === 'create' ? '创建' : '保存' }}
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
   Element Plus 深度覆盖 — 对话框 / 表单（外壳内元素）
   ================================================================ */
/* 主按钮：绿色 */
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

/* 对话框 */
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

/* 编辑账套表单 */
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
</style>
