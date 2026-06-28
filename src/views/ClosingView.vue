<script setup lang="ts">
// ponytail: 期末结账 — 卡片式期间选择 + 检查项校验(凭证/试算/期初/方向/报表/断号)
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowLeft, ArrowRight, CircleCheck, CircleCheckFilled, Check,
  Loading, Close, WarningFilled, TrendCharts,
} from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';

const api = getFinanceApi();
const periods = ref<Array<{ period: string; status: string; exists: boolean }>>([]);
const currentPeriod = ref('');
const loading = ref(false);
const closing = ref(false);

const displayYear = ref(2026);

/* ======== 检查项系统 ======== */

interface CheckItem {
  key: string;
  label: string;
  desc: string;
  enabled: boolean;        // 用户可开关
  status: 'idle' | 'running' | 'pass' | 'fail' | 'warn';
  detail: string;          // 结果详情
}

// ponytail: 从 localStorage 读取启用的检查项，默认开前4项
function loadCheckConfig(): string[] {
  try { const raw = localStorage.getItem('closing_checks_enabled'); if (raw) return JSON.parse(raw); } catch {}
  return ['unposted', 'trial_balance', 'opening_exists', 'negative_balance'];
}

function saveCheckConfig(keys: string[]) {
  localStorage.setItem('closing_checks_enabled', JSON.stringify(keys));
}

const checkItems = ref<CheckItem[]>([
  { key: 'unposted',       label: '未过账凭证',   desc: '检查是否存在未过账（草稿/已审核）凭证',       enabled: true, status: 'idle', detail: '' },
  { key: 'trial_balance',  label: '试算平衡',     desc: '检查期间借贷发生额与余额是否平衡',              enabled: true, status: 'idle', detail: '' },
  { key: 'opening_exists', label: '期初余额',     desc: '检查当前年度是否已设置期初余额',                enabled: true, status: 'idle', detail: '' },
  { key: 'negative_balance', label: '科目方向异常', desc: '检查科目期末余额方向是否与科目性质一致',        enabled: true, status: 'idle', detail: '' },
  { key: 'bs_balance',     label: '资产负债表平衡', desc: '检查资产负债表是否满足 资产=负债+所有者权益',   enabled: false, status: 'idle', detail: '' },
  { key: 'voucher_continuity', label: '凭证断号', desc: '检查各凭证字下编号是否连续',                    enabled: false, status: 'idle', detail: '' },
]);

const checkDialogVisible = ref(false);
const checkRunning = ref(false);
const checkTargetPeriod = ref('');  // 正在检查的期间

// 初始化时加载用户配置
onMounted(async () => {
  const saved = loadCheckConfig();
  checkItems.value.forEach(c => { c.enabled = saved.includes(c.key); });
  await loadPeriods();
});

function toggleCheckItem(item: CheckItem) { // ponytail: 失败/警告项点击重置状态；正常项切换开关
  if (item.status === 'fail' || item.status === 'warn') {
    item.status = 'idle';
    item.detail = '';
    // 不切换 enabled，保持已启用状态
  } else {
    item.enabled = !item.enabled;
  }
  saveCheckConfig(checkItems.value.filter(c => c.enabled).map(c => c.key));
}

// ponytail: 重置所有检查状态
function resetCheckStatus() {
  checkItems.value.forEach(c => {
    c.status = 'idle';
    c.detail = '';
  });
}

// ponytail: 并行运行全部启用的检查项
async function runAllChecks(period: string) {
  checkRunning.value = true;
  resetCheckStatus();
  checkTargetPeriod.value = period;

  const enabledItems = checkItems.value.filter(c => c.enabled);

  // 并行执行所有检查
  const tasks = enabledItems.map(async (item) => {
    item.status = 'running';
    try {
      switch (item.key) {
        case 'unposted': {
          const vouchers = await api.listVouchers({ period, status: 'draft' });
          const audited = await api.listVouchers({ period, status: 'audited' });
          const total = vouchers.length + audited.length;
          if (total === 0) {
            item.status = 'pass';
            item.detail = '所有凭证均已过账';
          } else {
            item.status = 'fail';
            item.detail = `存在 ${total} 张未过账凭证（草稿 ${vouchers.length}，已审核 ${audited.length}）`;
          }
          break;
        }
        case 'trial_balance': {
          const tb = await api.getTrialBalance(period);
          const debitOk = Math.abs(tb.totals.amountDebit - tb.totals.amountCredit) < 0.01;
          const endOk = Math.abs(tb.totals.endingDebit - tb.totals.endingCredit) < 0.01;
          if (debitOk && endOk) {
            item.status = 'pass';
            item.detail = `借方发生额 ${tb.totals.amountDebit.toFixed(2)} = 贷方发生额 ${tb.totals.amountCredit.toFixed(2)}`;
          } else {
            item.status = 'fail';
            const parts: string[] = [];
            if (!debitOk) parts.push(`发生额不平衡：借方 ${tb.totals.amountDebit.toFixed(2)} ≠ 贷方 ${tb.totals.amountCredit.toFixed(2)}（差异 ${Math.abs(tb.totals.amountDebit - tb.totals.amountCredit).toFixed(2)}）`);
            if (!endOk) parts.push(`期末余额不平衡：借方 ${tb.totals.endingDebit.toFixed(2)} ≠ 贷方 ${tb.totals.endingCredit.toFixed(2)}（差异 ${Math.abs(tb.totals.endingDebit - tb.totals.endingCredit).toFixed(2)}）`);
            item.detail = parts.join('；');
          }
          break;
        }
        case 'opening_exists': {
          const year = period.substring(0, 4);
          const startPeriod = `${year}-01`;
          const openings = await api.getOpeningBalances(startPeriod);
          if (openings.length > 0) {
            item.status = 'pass';
            item.detail = `已设置 ${openings.length} 个科目的期初余额`;
          } else {
            item.status = 'fail';
            item.detail = '该年度期初余额为空，请先设置期初余额';
          }
          break;
        }
        case 'negative_balance': {
          const [balances, subjects] = await Promise.all([
            api.getSubjectBalance({ period }),
            api.listSubjects(),
          ]);
          const abnormal: string[] = [];
          for (const b of balances) {
            if (Math.abs(b.balance) < 0.005) continue;
            const sub = subjects.find(s => s.code === b.code);
            if (!sub) continue;
            // balance 已按科目方向归一化：正数=自然方向，负数=反向余额（异常）
            if (b.balance < 0) {
              abnormal.push(`${b.code} ${b.name}`);
            }
          }
          if (abnormal.length === 0) {
            item.status = 'pass';
            item.detail = '所有科目余额方向正常';
          } else {
            item.status = 'warn';
            item.detail = `${abnormal.length} 个科目余额方向异常：${abnormal.slice(0, 3).join('、')}${abnormal.length > 3 ? '…' : ''}（请确认科目性质与实际余额方向一致）`;
          }
          break;
        }
        case 'bs_balance': {
          const bs = await api.getBalanceSheet(period);
          const assetTotal = bs.asset_rows.find(r => r.is_total && r.name.includes('合计'))?.amount || 0;
          const liabTotal = bs.liability_rows.find(r => r.is_total && r.name.includes('合计'))?.amount || 0;
          const equityTotal = bs.equity_rows.find(r => r.is_total && r.name.includes('合计'))?.amount || 0;
          if (Math.abs(assetTotal - (liabTotal + equityTotal)) < 0.01) {
            item.status = 'pass';
            item.detail = `资产 ${assetTotal.toFixed(2)} = 负债 ${liabTotal.toFixed(2)} + 权益 ${equityTotal.toFixed(2)}`;
          } else {
            item.status = 'fail';
            item.detail = `资产负债表不平！资产 ${assetTotal.toFixed(2)} ≠ 负债 ${liabTotal.toFixed(2)} + 权益 ${equityTotal.toFixed(2)}（差异 ${Math.abs(assetTotal - liabTotal - equityTotal).toFixed(2)}）`;
          }
          break;
        }
        case 'voucher_continuity': {
          const vouchers = await api.listVouchers({ period });
          // 按凭证字分组检查编号连续性
          const groups: Record<string, number[]> = {};
          for (const v of vouchers) {
            if (!groups[v.voucher_word]) groups[v.voucher_word] = [];
            groups[v.voucher_word].push(v.voucher_no);
          }
          const gaps: string[] = [];
          for (const [word, nos] of Object.entries(groups)) {
            nos.sort((a, b) => a - b);
            for (let i = 1; i < nos.length; i++) {
              if (nos[i] - nos[i - 1] > 1) {
                for (let g = nos[i - 1] + 1; g < nos[i]; g++) {
                  gaps.push(`${word}-${g}`);
                }
              }
            }
          }
          if (gaps.length === 0) {
            item.status = 'pass';
            item.detail = '所有凭证字编号连续';
          } else {
            item.status = 'warn';
            item.detail = `发现 ${gaps.length} 处断号：${gaps.slice(0, 3).join('、')}${gaps.length > 3 ? '…' : ''}`;
          }
          break;
        }
      }
    } catch (e: any) {
      item.status = 'fail';
      item.detail = `检查异常：${e?.message || '未知错误'}`;
    }
  });

  await Promise.all(tasks);
  checkRunning.value = false;
}

// ponytail: 检查结果汇总
const checkSummary = computed(() => {
  const enabled = checkItems.value.filter(c => c.enabled);
  const passCount = enabled.filter(c => c.status === 'pass').length;
  const failCount = enabled.filter(c => c.status === 'fail').length;
  const warnCount = enabled.filter(c => c.status === 'warn').length;
  const allPassed = enabled.length > 0 && passCount === enabled.length;
  return { total: enabled.length, passCount, failCount, warnCount, allPassed };
});

/** 打开检查对话框（默认检查下一个可结账期间） */
async function openCheckDialog() {
  const target = nextCloseable.value?.period || currentPeriod.value;
  if (!target) {
    ElMessage.warning('没有可检查的期间');
    return;
  }
  resetCheckStatus();
  checkDialogVisible.value = true;
  await runAllChecks(target);
}

/** 点击卡片时打开检查对话框（针对指定期间） */
let pendingClosePeriod = ''; // 检查通过后要结账的期间
async function openCheckForPeriod(period: string) {
  if (!period) return;
  pendingClosePeriod = period;
  resetCheckStatus();
  checkDialogVisible.value = true;
  await runAllChecks(period);
}

/** 检查通过后执行结账 */
async function handleCheckedClose() {
  if (!checkSummary.value.allPassed) {
    ElMessage.warning('存在未通过的检查项，请处理后重试');
    return;
  }
  const periodToClose = pendingClosePeriod || nextCloseable.value?.period;
  if (!periodToClose) {
    ElMessage.warning('没有可结账的期间');
    return;
  }
  checkDialogVisible.value = false;
  try {
    await ElMessageBox.confirm(
      `确认关闭期间「${periodToClose}」？关闭后该期间凭证将不可修改。`,
      '结账确认',
      { confirmButtonText: '确认结账', cancelButtonText: '取消', type: 'warning' },
    );
    closing.value = true;
    await api.closePeriod(periodToClose);
    await refreshData();
    ElMessage.success(`期间「${periodToClose}」结账完成`);
  } catch { /* 取消 */ }
  finally {
    closing.value = false;
    pendingClosePeriod = '';
  }
}

async function loadPeriods() {
  loading.value = true;
  try {
    const data = await api.bootstrap();
    currentPeriod.value = data.book.current_period;
    const match = currentPeriod.value.match(/^(\d{4})-/);
    const year = match ? parseInt(match[1]) : 2026;
    displayYear.value = year;
    buildPeriods(year, data.periods || []);
    await loadCarryForwardInfo();
  } finally { loading.value = false; }
}

// ponytail: 生成全年12个月期间结构，匹配已存在期间的状态
function buildPeriods(year: number, existing: Array<{ period: string; status: string }>) {
  periods.value = Array.from({ length: 12 }, (_, i) => {
    const p = `${year}-${String(i + 1).padStart(2, '0')}`;
    const found = existing.find(e => e.period === p);
    return { period: p, status: found ? found.status : 'future', exists: !!found };
  });
}

async function goPrevYear() { displayYear.value--; await refreshData(); }
async function goNextYear() { displayYear.value++; await refreshData(); }

/** 下一个可结账期间 */
const nextCloseable = computed(() => {
  return periods.value.find(p => p.status === 'open' && p.exists) || null;
});

/** 期间状态图标和颜色 */
// ponytail: status 即 CSS 类名后缀
function periodCardClass(p: typeof periods.value[0]) { return `period-card--${p.status}`; }

function periodStatusLabel(p: typeof periods.value[0]) { return p.status === 'closed' ? '已结账' : p.status === 'open' ? '进行中' : '未开始'; }

async function handleReopenPeriod(period: string) {
  try {
    await ElMessageBox.confirm(
      `确认反结账期间「${period}」？`,
      '反结账确认',
      { confirmButtonText: '确认', cancelButtonText: '取消', type: 'warning' },
    );
    await api.reopenPeriod(period);
    await refreshData();
    ElMessage.success(`期间「${period}」已重新打开`);
  } catch { /* 取消 */ }
}

async function refreshData() {
  const data = await api.bootstrap();
  currentPeriod.value = data.book.current_period;
  buildPeriods(displayYear.value, data.periods || []);
  await loadCarryForwardInfo();
}

/** 计算当前显示年份的损益结转凭证数量 */
const carryForwardCount = ref(0);
async function loadCarryForwardInfo() {
  try {
    const yearStr = String(displayYear.value);
    const vouchers = await api.listVouchers({
      startDate: `${yearStr}-01-01`,
      endDate: `${yearStr}-12-31`,
    });
    carryForwardCount.value = vouchers.filter(v => v.remark?.includes('[损益结转]')).length;
  } catch { carryForwardCount.value = 0; }
}
</script>

<template>
  <div class="page-wrap" v-loading="loading">
    <!-- 顶部标题栏 + 年份切换 -->
    <div class="cl-header">
      <div class="cl-header-left">
        <h2 class="cl-title">期末结账</h2>
      </div>
      <div class="cl-year-switch">
        <button class="yr-btn" @click="goPrevYear" :disabled="loading">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <span class="yr-label">{{ displayYear }}年</span>
        <button class="yr-btn" @click="goNextYear" :disabled="loading">
          <el-icon><ArrowRight /></el-icon>
        </button>
      </div>
    </div>

    <!-- 当前期间提示条 -->
    <div class="cl-current-bar">
      <span class="cl-current-dot"></span>
      当前期间：<strong>{{ currentPeriod }}</strong>
    </div>

    <!-- 12 月卡片网格 -->
    <div class="cl-card-grid">
      <div
        v-for="p in periods"
        :key="p.period"
        class="period-card"
        :class="[periodCardClass(p), { 'period-card--current': p.period === currentPeriod }]"
        @click="p.status === 'open' ? openCheckForPeriod(p.period) : p.status === 'closed' ? handleReopenPeriod(p.period) : undefined"
        :title="p.status === 'open' ? '点击检查并结账' : p.status === 'closed' ? '点击反结账' : ''"
      >
        <div class="pc-icon-wrap">
          <div class="pc-icon-circle" :class="`pc-icon-circle--${p.status}`">
            <el-icon v-if="p.status === 'closed'" :size="20"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="p.status === 'open'" :size="20"><CircleCheck /></el-icon>
            <span v-else class="pc-icon-dot"></span>
          </div>
        </div>
        <div class="pc-month">{{ p.period.split('-')[1] }}月</div>
        <div class="pc-status" :class="`pc-status--${p.status}`">
          {{ periodStatusLabel(p) }}
        </div>
        <div v-if="p.period === currentPeriod" class="pc-current-tag">当前</div>
      </div>
    </div>

    <!-- 损益结转凭证统计 -->
    <div class="cl-carry-info" v-if="carryForwardCount > 0 || periods.some(p => p.status === 'closed')">
      <div class="cl-carry-label">
        <el-icon :size="16"><TrendCharts /></el-icon>
        <span>损益结转凭证</span>
      </div>
      <div class="cl-carry-body">
        <span class="cl-carry-count">{{ carryForwardCount }} 张</span>
        <span class="cl-carry-hint">结账时系统自动生成，将当期损益类科目余额结转至「本年利润」</span>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div class="cl-action-bar">
      <el-button
        type="primary"
        size="large"
        :disabled="!nextCloseable || closing"
        :loading="closing"
        @click="openCheckDialog"
      >
        <el-icon style="margin-right:4px"><Check /></el-icon>
        检查并结账
      </el-button>
      <el-button text size="small" @click="openCheckDialog">检查项设置</el-button>
      <span class="cl-hint" v-if="nextCloseable">
        下一个待结账期间：<strong>{{ nextCloseable.period }}</strong>
      </span>
      <span class="cl-hint cl-hint--done" v-else-if="periods.some(p => p.status === 'closed')">
        当年所有期间已结账完成
      </span>
      <span class="cl-hint cl-hint--empty" v-else>
        当年暂无待结账期间
      </span>
    </div>

    <!-- ====== 检查项对话框 ====== -->
    <el-dialog
      v-model="checkDialogVisible"
      title="结账检查项"
      width="600px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <!-- 检查目标 -->
      <div class="ck-target">
        <span class="ck-target-label">检查期间</span>
        <el-tag type="info" size="small">{{ checkTargetPeriod }}</el-tag>
        <el-button
          v-if="!checkRunning"
          size="small"
          text
          @click="runAllChecks(checkTargetPeriod)"
        >
          重新检查
        </el-button>
      </div>

      <!-- 检查项列表 -->
      <div class="ck-list">
        <div
          v-for="item in checkItems"
          :key="item.key"
          class="ck-item"
          :class="`ck-item--${item.status}`"
        >
          <!-- 开关 -->
          <el-switch
            :model-value="item.enabled && item.status !== 'fail' && item.status !== 'warn'"
            size="small"
            :disabled="checkRunning"
            @change="toggleCheckItem(item)"
            class="ck-switch"
          />

          <!-- 名称和描述 -->
          <div class="ck-body">
            <div class="ck-name">
              {{ item.label }}
              <span class="ck-desc">— {{ item.desc }}</span>
            </div>
            <div v-if="item.status !== 'idle'" class="ck-detail">
              <el-icon
                v-if="item.status === 'running'"
                class="ck-icon-spin"
                :size="14"
              ><Loading /></el-icon>
              <el-icon v-else-if="item.status === 'pass'" class="ck-icon-pass" :size="14"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="item.status === 'fail'" class="ck-icon-fail" :size="14"><Close /></el-icon>
              <el-icon v-else-if="item.status === 'warn'" class="ck-icon-warn" :size="14"><WarningFilled /></el-icon>
              <span>{{ item.detail }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 结账提示信息 -->
      <div v-if="!checkRunning && checkSummary.total > 0" class="ck-summary" :class="checkSummary.allPassed ? 'ck-summary--ok' : 'ck-summary--ng'">
        <el-icon :size="16">
          <CircleCheckFilled v-if="checkSummary.allPassed" />
          <WarningFilled v-else />
        </el-icon>
        <span v-if="checkSummary.allPassed">
          全部 {{ checkSummary.total }} 项检查通过，可以执行结账
        </span>
        <span v-else>
          {{ checkSummary.passCount }}/{{ checkSummary.total }} 通过，
          <template v-if="checkSummary.failCount">{{ checkSummary.failCount }} 项失败</template>
          <template v-if="checkSummary.warnCount">，{{ checkSummary.warnCount }} 项警告</template>
        </span>
      </div>

      <template #footer>
        <el-button @click="checkDialogVisible = false; pendingClosePeriod = ''">取消</el-button>
        <el-button
          type="primary"
          :disabled="!checkSummary.allPassed || checkRunning"
          :loading="closing"
          @click="handleCheckedClose"
        >
          检查通过，执行结账
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ======== 整体布局 ======== */
.page-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

/* ======== 顶部标题栏 + 年份切换 ======== */
.cl-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.cl-title {
  margin: 0;
  font-size: clamp(16px, 2vw, 20px);
  font-weight: 700;
  color: var(--epp-ink-text);
  white-space: nowrap;
}

.cl-year-switch {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.yr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: clamp(28px, 4vw, 32px);
  height: clamp(28px, 4vw, 32px);
  border: 1px solid var(--epp-line-light);
  border-radius: 4px;
  background: var(--epp-paper);
  color: var(--epp-ink-text);
  cursor: pointer;
  transition: all 0.2s;
}

.yr-btn:hover:not(:disabled) {
  border-color: var(--epp-accent);
  color: var(--epp-accent);
  background: #f0fdfa;
}

.yr-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.yr-label {
  font-size: clamp(14px, 1.8vw, 16px);
  font-weight: 600;
  color: var(--epp-ink-text);
  user-select: none;
  white-space: nowrap;
}

/* ======== 当前期间提示条 ======== */
.cl-current-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #f8fafc;
  border: 1px solid var(--epp-line-light);
  border-radius: 4px;
  font-size: 13px;
  color: var(--epp-ink-sub);
  flex-wrap: wrap;
}

.cl-current-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--epp-success);
  flex-shrink: 0;
}

.cl-current-bar strong {
  color: var(--epp-ink-text);
}

/* ======== 卡片网格 — 流体自适应 ======== */
.cl-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(200px, 100%), 1fr));
  gap: 12px;
}

/* ======== 单张卡片 ======== */
.period-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: clamp(16px, 2.5vw, 24px) clamp(10px, 2vw, 16px) clamp(14px, 2vw, 20px);
  min-height: 120px;
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 6px;
  cursor: default;
  transition: all 0.25s ease;
  user-select: none;
}

.period-card--open {
  cursor: pointer;
  border-color: var(--epp-accent-light);
  background: linear-gradient(180deg, #f0fdfa 0%, var(--epp-paper) 100%);
}

.period-card--open:hover {
  border-color: var(--epp-accent);
  box-shadow: 0 2px 12px rgba(8, 145, 178, 0.12);
  transform: translateY(-2px);
}

.period-card--closed {
  cursor: pointer;
  background: #f8fafc;
  border-color: var(--epp-line-light);
}

.period-card--closed:hover {
  border-color: #94a3b8;
  box-shadow: 0 2px 8px rgba(100, 116, 139, 0.1);
  transform: translateY(-1px);
}

.period-card--future {
  opacity: 0.55;
  background: #fafbfc;
  border-style: dashed;
}

/* 当前期间高亮环 */
.period-card--current {
  box-shadow: inset 0 0 0 1px var(--epp-accent-light);
}

/* ======== 状态图标 ======== */
.pc-icon-wrap {
  margin-bottom: 2px;
}

.pc-icon-circle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: clamp(32px, 5vw, 40px);
  height: clamp(32px, 5vw, 40px);
  border-radius: 50%;
  transition: all 0.25s;
}

.pc-icon-circle--closed {
  background: var(--epp-success);
  color: #fff;
}

.pc-icon-circle--open {
  background: #f0fdfa;
  color: var(--epp-accent);
  border: 2px solid var(--epp-accent-light);
}

.pc-icon-circle--future {
  background: #f1f5f9;
  border: 2px dashed var(--epp-line-light);
}

.pc-icon-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--epp-line);
}

/* ======== 月份编号 ======== */
.pc-month {
  font-size: clamp(16px, 2.2vw, 20px);
  font-weight: 700;
  color: var(--epp-ink-text);
  letter-spacing: 0.5px;
}

.period-card--future .pc-month {
  color: var(--epp-ink-sub);
}

/* ======== 状态文字 ======== */
.pc-status {
  font-size: clamp(11px, 1.3vw, 12px);
  font-weight: 500;
  padding: 2px 10px;
  border-radius: 10px;
  white-space: nowrap;
}

.pc-status--closed {
  color: var(--epp-success);
  background: #ecfdf5;
}

.pc-status--open {
  color: var(--epp-accent);
  background: #ecfeff;
}

.pc-status--future {
  color: var(--epp-ink-sub);
  background: #f1f5f9;
}

/* ======== 当前标记 ======== */
.pc-current-tag {
  position: absolute;
  top: 8px;
  right: 8px;
  font-size: 10px;
  color: var(--epp-accent);
  background: #ecfeff;
  border: 1px solid #99f6e4;
  border-radius: 3px;
  padding: 1px 6px;
  line-height: 1.4;
}

/* ======== 结转凭证统计条 ======== */
.cl-carry-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #ecfeff;
  border: 1px solid #a5f3fc;
  border-radius: 4px;
  flex-wrap: wrap;
}
.cl-carry-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #0e7490;
  flex-shrink: 0;
}
.cl-carry-body {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.cl-carry-count {
  font-size: 14px;
  font-weight: 700;
  color: var(--epp-accent);
}
.cl-carry-hint {
  font-size: 12px;
  color: var(--epp-ink-sub);
}

/* ======== 底部操作栏 ======== */
.cl-action-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: clamp(12px, 2vw, 16px) clamp(14px, 2.5vw, 20px);
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.03);
}

.cl-hint {
  font-size: clamp(12px, 1.4vw, 13px);
  color: var(--epp-ink-sub);
}

.cl-hint strong {
  color: var(--epp-ink-text);
}

.cl-hint--done {
  color: var(--epp-success);
}

.cl-hint--empty {
  color: var(--epp-ink-sub);
}

/* ======== 检查对话框 ======== */
.ck-target {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 4px;
  margin-bottom: 16px;
  font-size: 13px;
}

.ck-target-label {
  color: var(--epp-ink-sub);
}

.ck-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ck-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--epp-line-light);
  border-radius: 6px;
  background: var(--epp-paper);
  transition: border-color 0.2s, background 0.2s;
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

.ck-switch {
  flex-shrink: 0;
  margin-top: 1px;
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
  gap: 6px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--epp-ink-sub);
}

.ck-icon-spin {
  animation: ck-spin 1s linear infinite;
  color: var(--epp-ink-sub);
}

.ck-icon-pass { color: #10b981; }
.ck-icon-fail { color: #ef4444; }
.ck-icon-warn { color: #f59e0b; }

@keyframes ck-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* 检查结果汇总 */
.ck-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
}

.ck-summary--ok {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.ck-summary--ng {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
</style>
