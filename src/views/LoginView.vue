<script setup lang="ts">
// ponytail: 登录页 — 用户认证/账套创建与选择
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { User, Lock, OfficeBuilding, Plus, Minus, CopyDocument, Close } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import { useAuth } from '../auth';
import AppIcon from '../components/AppIcon.vue';
import type { Company } from '../api';
import { APP_CONFIG } from '../config';

const api = getFinanceApi();

/* Electron 窗口控制 */
function winMin() { window.electronAPI!.windowMin(); }
function winMax() { window.electronAPI!.windowMax(); }
function winClose() { window.electronAPI!.windowClose(); }
const router = useRouter();
const auth = useAuth();

const username = ref('');
const password = ref('');
const loading = ref(false);
const companies = ref<Company[]>([]);
const selectedCompany = ref('');

/* 新建账套弹窗 */
const showCreateDialog = ref(false);
const newCompanyForm = reactive({
  name: '',
  contactPerson: '',
  legalRepresentative: '',
  phone: '',
  address: '',
  taxNo: '',
});
const creating = ref(false);

const canLogin = computed(() => {
  return !!username.value && !!password.value && (companies.value.length > 0 && !!selectedCompany.value);
});

onMounted(async () => {
  try {
    companies.value = await api.getCompanies();
    if (companies.value.length > 0) {
      selectedCompany.value = String(companies.value[0].id);
    }
  } catch {
    /* API 未就绪时静默 */
  }
});

async function handleLogin() {
  if (!username.value || !password.value) { ElMessage.warning('请输入用户名和密码'); return; }

  if (companies.value.length === 0) {
    ElMessage.warning('请先创建一个账套');
    showCreateDialog.value = true;
    return;
  }

  if (!selectedCompany.value) { ElMessage.warning('请选择账套'); return; }

  loading.value = true;
  try {
    const user = await api.login(username.value, password.value);
    if (!user) { ElMessage.error('用户名或密码错误，或账号已禁用'); return; }
    if (selectedCompany.value && selectedCompany.value !== user.companyId) {
      await api.switchCompany(selectedCompany.value);
      const c = companies.value.find(x => String(x.id) === selectedCompany.value);
      user.companyId = selectedCompany.value;
      user.companyName = c?.name || '未知账套';
    }
    auth.login(user);
    window.dispatchEvent(new CustomEvent('company-changed'));
    ElMessage.success(`欢迎回来，${user.alias || user.username}`);
    router.replace('/dashboard');
  } catch (e: any) {
    ElMessage.error(e.message || '登录失败');
  } finally {
    loading.value = false;
  }
}

function openCreateDialog() {
  newCompanyForm.name = '';
  newCompanyForm.contactPerson = '';
  newCompanyForm.legalRepresentative = '';
  newCompanyForm.phone = '';
  newCompanyForm.address = '';
  newCompanyForm.taxNo = '';
  showCreateDialog.value = true;
}

/** 联系电话：只允许输入数字 */
function onPhoneInput(val: string) {
  newCompanyForm.phone = val.replace(/\D/g, '');
}
/** 税号：只允许大写字母 + 数字 */
function onTaxNoInput(val: string) {
  newCompanyForm.taxNo = val.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

async function handleCreateCompany() {
  if (!newCompanyForm.name.trim()) { ElMessage.warning('请输入公司名称'); return; }
  if (newCompanyForm.name.trim().length < 2) { ElMessage.warning('公司名称至少2个字符'); return; }
  if (!newCompanyForm.contactPerson.trim()) { ElMessage.warning('请输入联系人'); return; }
  if (newCompanyForm.contactPerson.trim().length < 2) { ElMessage.warning('联系人姓名至少2个字符'); return; }
  if (!newCompanyForm.legalRepresentative.trim()) { ElMessage.warning('请输入企业法人'); return; }
  if (newCompanyForm.legalRepresentative.trim().length < 2) { ElMessage.warning('企业法人至少2个字符'); return; }
  if (newCompanyForm.phone && !/^\d{11}$/.test(newCompanyForm.phone.trim())) {
    ElMessage.warning('联系电话必须为11位数字'); return;
  }
  if (!newCompanyForm.taxNo.trim()) { ElMessage.warning('请输入税号'); return; }
  if (!/^[A-Z0-9]{15,18}$/.test(newCompanyForm.taxNo.trim())) {
    ElMessage.warning('税号必须为15-18位大写字母或数字'); return;
  }
  creating.value = true;
  try {
    const c = await api.createCompany(newCompanyForm.name.trim(), {
      contactPerson: newCompanyForm.contactPerson.trim(),
      legalRepresentative: newCompanyForm.legalRepresentative.trim(),
      phone: newCompanyForm.phone.trim(),
      address: newCompanyForm.address.trim(),
      taxNo: newCompanyForm.taxNo.trim(),
    });
    companies.value = await api.getCompanies();
    selectedCompany.value = String(c.id);
    showCreateDialog.value = false;
    ElMessage.success(`账套「${newCompanyForm.name}」创建成功`);
  } catch (e: any) {
    ElMessage.error(e.message || '创建失败');
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Electron 窗口控制栏 -->
    <div class="login-win-ctrl">
      <span class="win-ctrl-btn" @click="winMin" title="最小化"><el-icon><Minus /></el-icon></span>
      <span class="win-ctrl-btn" @click="winMax" title="最大化"><el-icon><CopyDocument /></el-icon></span>
      <span class="win-ctrl-btn win-ctrl-close" @click="winClose" title="关闭"><el-icon><Close /></el-icon></span>
    </div>

    <!-- 左侧品牌区 -->
    <div class="login-brand">
      <div class="login-brand__inner">
        <AppIcon :size="56" class="login-brand__logo" />
        <h1 class="login-brand__title">{{ APP_CONFIG.productName }}</h1>
        <p class="login-brand__desc">{{ APP_CONFIG.loginSubtitle }}</p>
        <div class="login-features">
          <div class="login-feature-item">
            <el-icon><OfficeBuilding /></el-icon>
            <span>凭证管理 · 借贷平衡</span>
          </div>
          <div class="login-feature-item">
            <el-icon><OfficeBuilding /></el-icon>
            <span>账簿报表 · 自动生成</span>
          </div>
          <div class="login-feature-item">
            <el-icon><OfficeBuilding /></el-icon>
            <span>财务报表 · 一键导出</span>
          </div>
        </div>
      </div>
      <div class="login-brand__footer">
        <div class="login-brand__footer-line">v{{ APP_CONFIG.version }}</div>
        <div class="login-brand__footer-line">开发者 &nbsp; {{ APP_CONFIG.productName }} &nbsp; {{ APP_CONFIG.developer }}</div>
      </div>
    </div>

    <!-- 右侧登录区 -->
    <div class="login-form-area">
      <div class="login-card">
        <h2 class="login-card__title">登录</h2>
        <p class="login-card__desc">请输入账号信息</p>

        <el-form label-position="top" @submit.prevent="handleLogin" class="login-form">
          <el-form-item label="用户名">
            <el-input v-model="username" size="large" placeholder="请输入用户名" clearable>
              <template #prefix><el-icon><User /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-form-item label="密码">
            <el-input v-model="password" type="password" show-password size="large"
              placeholder="请输入密码" @keyup.enter="handleLogin">
              <template #prefix><el-icon><Lock /></el-icon></template>
            </el-input>
          </el-form-item>

          <el-form-item label="选择账套">
            <div v-if="companies.length === 0" class="no-company-hint">
              <el-icon><OfficeBuilding /></el-icon>
              <span>暂无账套，请先新建</span>
            </div>
            <el-select v-else v-model="selectedCompany" size="large" style="width:100%" placeholder="请选择账套">
              <el-option v-for="c in companies" :key="c.id" :value="String(c.id)" :label="c.name" />
            </el-select>
          </el-form-item>

          <el-button type="primary" size="large" :loading="loading"
            class="login-submit-btn" @click="handleLogin" style="width:100%"
            :disabled="!canLogin">
            登录
          </el-button>
        </el-form>

        <div class="login-card__actions">
          <el-button type="primary" link size="small" @click="openCreateDialog">
            <el-icon><Plus /></el-icon> 新建账套
          </el-button>
        </div>
      </div>
    </div>

    <!-- 新建账套弹窗 -->
    <el-dialog
      v-model="showCreateDialog"
      title="新建账套（公司）"
      width="500px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="90px" label-position="right" size="default">
        <el-form-item label="公司名称" required>
          <el-input v-model="newCompanyForm.name" placeholder="如：某某科技有限公司" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="联系人" required>
          <el-input v-model="newCompanyForm.contactPerson" placeholder="联系人姓名" maxlength="20" />
        </el-form-item>
        <el-form-item label="企业法人" required>
          <el-input v-model="newCompanyForm.legalRepresentative" placeholder="企业法人姓名" maxlength="20" />
        </el-form-item>
        <el-form-item label="联系电话">
          <el-input v-model="newCompanyForm.phone" placeholder="请输入11位手机号" maxlength="11" show-word-limit
            @input="(v: string) => onPhoneInput(v)" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="newCompanyForm.address" placeholder="公司注册/经营地址" maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item label="税号" required>
          <el-input v-model="newCompanyForm.taxNo" placeholder="15-18位大写字母或数字" maxlength="18" show-word-limit
            @input="(v: string) => onTaxNoInput(v)" />
        </el-form-item>
      </el-form>
      <p class="create-tips">提示：创建账套后，系统将按该公司独立管理所有做账数据。</p>
      <template #footer>
        <el-button @click="showCreateDialog = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreateCompany">
          创建账套
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ================================================================
   LoginView — 墨蓝渐变品牌区 + 账簿纸登录卡
   ================================================================ */
.login-page {
  display: flex; min-height: 100vh;
  background: var(--epp-ledger);
  position: relative;
}

/* Electron 窗口控制栏 */
.login-win-ctrl {
  position: fixed; top: 0; right: 0; z-index: 999;
  display: flex; gap: 0; padding: 4px 6px;
  -webkit-app-region: no-drag;
}
.login-win-ctrl .win-ctrl-btn {
  width: 36px; height: 32px; display: flex; align-items: center; justify-content: center;
  color: rgba(0,0,0,.35); cursor: pointer; border-radius: 3px; font-size: 14px;
  transition: background .12s, color .12s;
}
.login-win-ctrl .win-ctrl-btn:hover { background: rgba(0,0,0,.06); color: #333; }
.login-win-ctrl .win-ctrl-close:hover { background: #e81123; color: #fff; }

/* ---- 左侧品牌区：墨蓝渐变 + 底部金线 ---- */
.login-brand {
  width: 440px; min-width: 360px;
  background: linear-gradient(165deg, var(--epp-ink) 0%, #1e3a5f 40%, #162d4a 100%);
  color: #f0ede6; display: flex; flex-direction: column;
  justify-content: center; padding: 60px 48px; position: relative;
  -webkit-app-region: drag;
  border-right: 2px solid var(--epp-accent);
}

.login-brand__inner { position: relative; z-index: 1; }

.login-brand__logo {
  border-radius: 12px;
  background: rgba(255,255,255,.1);
  backdrop-filter: blur(8px);
  margin-bottom: 24px;
  border: 1px solid rgba(255,255,255,.1);
}

.login-brand__title {
  font-size: 30px; font-weight: 800; letter-spacing: 3px; margin: 0 0 8px;
  color: #f0ede6;
}

.login-brand__desc {
  font-size: 15px; opacity: .65; margin: 0 0 40px; font-weight: 300;
  color: var(--epp-accent-light);
}

.login-features { display: flex; flex-direction: column; gap: 16px; }

.login-feature-item {
  display: flex; align-items: center; gap: 10px; font-size: 13px; opacity: .7;
  padding: 9px 14px; border-radius: 3px; background: rgba(255,255,255,.04);
  transition: background .2s, opacity .2s;
}
.login-feature-item:hover { background: rgba(255,255,255,.08); opacity: 1; }
.login-feature-item .el-icon { color: var(--epp-accent-light); }

.login-brand__footer {
  position: absolute; bottom: 32px; left: 48px;
  display: flex; flex-direction: column; gap: 4px;
}

.login-brand__footer-line {
  font-size: 11px; opacity: .3; color: #f0ede6;
}

/* ---- 右侧登录区 ---- */
.login-form-area {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 40px; -webkit-app-region: no-drag;
}

.login-card {
  width: 420px; background: var(--epp-paper);
  border-radius: 2px;
  box-shadow: 0 2px 20px rgba(10, 30, 61, 0.06), 0 1px 4px rgba(10, 30, 61, 0.03);
  padding: 36px 36px 28px;
  -webkit-app-region: no-drag;
  border: 1px solid var(--epp-line-light);
}

.login-card__title {
  margin: 0 0 4px; font-size: 22px; font-weight: 700;
  color: var(--epp-ink-text);
}

.login-card__desc {
  margin: 0 0 28px; font-size: 13px; color: var(--epp-ink-sub);
}

.login-submit-btn {
  height: 44px; font-size: 15px; font-weight: 600;
  border-radius: 2px; margin-top: 4px;
}

.login-card__actions {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 16px;
}

.login-hint { font-size: 11px; color: var(--epp-line); }

/* 无账套提示 */
.no-company-hint {
  display: flex; align-items: center; gap: 8px;
  height: 40px; padding: 0 14px;
  border: 1px dashed var(--epp-line-light); border-radius: 2px;
  color: var(--epp-ink-sub); font-size: 13px;
  background: #f8fafc;
}

/* 创建弹窗提示 */
.create-tips {
  margin: 0; font-size: 12px; color: var(--epp-ink-sub);
  line-height: 1.6; padding-top: 8px;
}

@media (max-width: 800px) {
  .login-brand { display: none; }
  .login-form-area { min-height: 100vh; }
}
</style>
