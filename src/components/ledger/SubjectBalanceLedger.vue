<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../../api';
import type { FinanceSubject, SubjectBalance, TrialBalance } from '../../api';
import { downloadExcel } from '../../utils/excelExport';

const props = defineProps<{
  period: string;
  allSubjects: FinanceSubject[];
}>();

const api = getFinanceApi();
const loading = ref(false);
const showTrial = ref(false); // 控制是余额表还是试算平衡表

/* ========== 科目余额表数据 ========== */
interface BalanceDisplayRow extends SubjectBalance {
  directionLabel: string;
  openingBalance: number;
  endingBalance: number;
}
const balanceListRaw = ref<SubjectBalance[]>([]);
const balanceOpeningMap = ref<Map<string, { debit: number; credit: number }>>(new Map());
const balanceLevel = ref('all');        // '1' | 'all'
const balanceHideZero = ref(false);     // 隐藏余额为0的科目

const balanceList = computed<BalanceDisplayRow[]>(() => {
  let list = balanceListRaw.value.map(r => {
    const subj = props.allSubjects.find(s => s.code === r.code);
    const dir = subj?.direction === 'credit' ? '贷' : '借';
    const opening = balanceOpeningMap.value.get(r.code);
    const openingBal = opening
      ? (dir === '借' ? opening.debit - opening.credit : opening.credit - opening.debit)
      : 0;
    return {
      ...r,
      directionLabel: dir,
      openingBalance: openingBal,
      endingBalance: subj?.direction === 'debit'
        ? openingBal + r.debitAmount - r.creditAmount
        : openingBal + r.creditAmount - r.debitAmount,
    };
  });

  if (balanceLevel.value === '1') {
    list = list.filter(r => {
      const subj = props.allSubjects.find(s => s.code === r.code);
      return subj?.level === 1;
    });
  }

  if (balanceHideZero.value) {
    list = list.filter(r => 
      Math.abs(r.endingBalance) > 0.001 || 
      Math.abs(r.debitAmount) > 0.001 || 
      Math.abs(r.creditAmount) > 0.001 || 
      Math.abs(r.openingBalance) > 0.001
    );
  }
  return list;
});

const balanceSummary = computed(() => {
  let openingDebit = 0, openingCredit = 0;
  let debitAmt = 0, creditAmt = 0, endingDebit = 0, endingCredit = 0;
  balanceList.value.forEach(r => {
    const subj = props.allSubjects.find(s => s.code === r.code);
    const isDebit = subj?.direction !== 'credit';
    openingDebit += isDebit ? Math.max(0, r.openingBalance) : 0;
    openingCredit += isDebit ? 0 : Math.max(0, r.openingBalance);
    debitAmt += r.debitAmount;
    creditAmt += r.creditAmount;
    endingDebit += isDebit ? Math.max(0, r.endingBalance) : 0;
    endingCredit += isDebit ? 0 : Math.abs(Math.min(0, r.endingBalance));
  });
  return { openingDebit, openingCredit, debitAmt, creditAmt, endingDebit, endingCredit };
});

async function queryBalance() {
  loading.value = true;
  try {
    const [balances, openings] = await Promise.all([
      api.getSubjectBalance({ period: props.period }),
      api.getOpeningBalances(props.period)
    ]);
    balanceListRaw.value = balances;
    const opMap = new Map();
    openings.forEach(o => opMap.set(o.subject_code, o));
    balanceOpeningMap.value = opMap;
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function handleExportBalance() {
  const cols = [
    { header: '科目编码', key: 'code', width: 12 },
    { header: '科目名称', key: 'name', width: 22 },
    { header: '方向', key: 'directionLabel', width: 8 },
    { header: '期初余额', key: 'openingBalance', width: 16, numFmt: '#,##0.00' },
    { header: '借方发生额', key: 'debitAmount', width: 16, numFmt: '#,##0.00' },
    { header: '贷方发生额', key: 'creditAmount', width: 16, numFmt: '#,##0.00' },
    { header: '期末余额', key: 'endingBalance', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, balanceList.value, `科目余额表_${props.period}`, '科目余额表');
}

/* ========== 试算平衡表 ========== */
const tbData = ref<TrialBalance | null>(null);
const tbLoading = ref(false);

const tbBalanced = computed(() => {
  const t = tbData.value?.totals;
  if (!t) return false;
  const eps = 0.005;
  return Math.abs(t.openingDebit - t.openingCredit) < eps
    && Math.abs(t.amountDebit - t.amountCredit) < eps
    && Math.abs(t.endingDebit - t.endingCredit) < eps;
});

async function queryTrialBalance() {
  tbLoading.value = true;
  try {
    tbData.value = await api.getTrialBalance(props.period);
  } catch (e: any) {
    ElMessage.error(e.message || '加载试算平衡失败');
  } finally {
    tbLoading.value = false;
  }
}

function handleExportTrialBalance() {
  if (!tbData.value) return;
  const cols = [
    { header: '科目编码', key: 'code', width: 12 },
    { header: '科目名称', key: 'name', width: 22 },
    { header: '期初余额(借)', key: 'openingDebit', width: 16, numFmt: '#,##0.00' },
    { header: '期初余额(贷)', key: 'openingCredit', width: 16, numFmt: '#,##0.00' },
    { header: '本期借方', key: 'debitAmount', width: 16, numFmt: '#,##0.00' },
    { header: '本期贷方', key: 'creditAmount', width: 16, numFmt: '#,##0.00' },
    { header: '期末余额(借)', key: 'endingDebit', width: 16, numFmt: '#,##0.00' },
    { header: '期末余额(贷)', key: 'endingCredit', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, tbData.value.rows, `试算平衡表_${props.period}`, '试算平衡表');
}

function formatMoney(v: number): string {
  return v ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

watch(() => props.period, () => {
  if (showTrial.value) {
    queryTrialBalance();
  } else {
    queryBalance();
  }
});

onMounted(() => {
  queryBalance();
});
</script>

<template>
  <div class="balance-ledger-wrap">
    <div class="ledger-tab-header">
      <el-radio-group v-model="showTrial" size="small" @change="showTrial ? queryTrialBalance() : queryBalance()">
        <el-radio-button :value="false">科目余额表</el-radio-button>
        <el-radio-button :value="true">试算平衡表</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="!showTrial" class="project-tab-content">
      <div class="query-bar">
        <div class="query-left">
          <span class="period-show">期间：{{ period }}</span>
          <el-radio-group v-model="balanceLevel" size="small">
            <el-radio-button value="all">全部</el-radio-button>
            <el-radio-button value="1">一级科目</el-radio-button>
          </el-radio-group>
          <el-checkbox v-model="balanceHideZero" size="small">余额为零不显示</el-checkbox>
        </div>
        <div class="query-right">
          <el-button type="primary" size="small" @click="queryBalance">查询</el-button>
          <el-button size="small" @click="handleExportBalance">导出</el-button>
        </div>
      </div>
      <div class="data-panel" v-loading="loading">
        <el-table :data="balanceList" border stripe size="small" max-height="520">
          <el-table-column prop="code" label="科目编码" min-width="95" align="center" />
          <el-table-column prop="name" label="科目名称" min-width="150" align="center" show-overflow-tooltip />
          <el-table-column label="方向" width="55" align="center">
            <template #default="{ row }">
              <span :class="['dir-tag', row.directionLabel === '借' ? 'dir-debit' : 'dir-credit']">
                {{ row.directionLabel }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="期初余额" align="center" min-width="110">
            <template #default="{ row }">
              <span v-if="row.openingBalance !== 0" class="money">{{ formatMoney(row.openingBalance) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="借方发生额" align="center" min-width="110">
            <template #default="{ row }">
              <span v-if="row.debitAmount !== 0" class="money">{{ formatMoney(row.debitAmount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="贷方发生额" align="center" min-width="110">
            <template #default="{ row }">
              <span v-if="row.creditAmount !== 0" class="money">{{ formatMoney(row.creditAmount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="期末余额" align="center" min-width="110">
            <template #default="{ row }">
              <span v-if="row.endingBalance !== 0" class="money">{{ formatMoney(row.endingBalance) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div class="summary-bar">
          合计：期初 {{ formatMoney(balanceSummary.openingDebit) }}（借） / {{ formatMoney(balanceSummary.openingCredit) }}（贷）
          | 借方发生额 {{ formatMoney(balanceSummary.debitAmt) }}
          | 贷方发生额 {{ formatMoney(balanceSummary.creditAmt) }}
          | 期末 {{ formatMoney(balanceSummary.endingDebit) }}（借） / {{ formatMoney(balanceSummary.endingCredit) }}（贷）
        </div>
      </div>
    </div>

    <!-- ==================== 试算平衡表 ==================== -->
    <div v-else class="project-tab-content">
      <div class="query-bar">
        <div class="query-left">
          <span class="period-show">期间：{{ period }}</span>
        </div>
        <div class="query-right">
          <el-button type="primary" size="small" @click="queryTrialBalance">查询</el-button>
          <el-button size="small" @click="handleExportTrialBalance">导出</el-button>
        </div>
      </div>

      <div class="data-panel" v-loading="tbLoading">
        <el-table v-if="tbData" :data="tbData.rows" border stripe size="small" height="100%">
          <el-table-column prop="code" label="科目编码" min-width="95" align="center" />
          <el-table-column prop="name" label="科目名称" min-width="150" align="center" show-overflow-tooltip />
          <el-table-column label="期初余额(借)" align="center" min-width="105">
            <template #default="{ row }">
              <span v-if="row.openingDebit > 0" class="money">{{ formatMoney(row.openingDebit) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="期初余额(贷)" align="center" min-width="105">
            <template #default="{ row }">
              <span v-if="row.openingCredit > 0" class="money">{{ formatMoney(row.openingCredit) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="本期借方" align="center" min-width="105">
            <template #default="{ row }">
              <span v-if="row.debitAmount > 0" class="money">{{ formatMoney(row.debitAmount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="本期贷方" align="center" min-width="105">
            <template #default="{ row }">
              <span v-if="row.creditAmount > 0" class="money">{{ formatMoney(row.creditAmount) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="期末余额(借)" align="center" min-width="105">
            <template #default="{ row }">
              <span v-if="row.endingDebit > 0" class="money">{{ formatMoney(row.endingDebit) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="期末余额(贷)" align="center" min-width="105">
            <template #default="{ row }">
              <span v-if="row.endingCredit > 0" class="money">{{ formatMoney(row.endingCredit) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <div v-else-if="!tbLoading" class="mc-empty"><p>点击「查询」按钮加载试算平衡表</p></div>

        <!-- 合计行 -->
        <div v-if="tbData" class="summary-bar">
          合计：
          期初 {{ formatMoney(tbData.totals.openingDebit) }}（借） / {{ formatMoney(tbData.totals.openingCredit) }}（贷）
          | 本期 {{ formatMoney(tbData.totals.amountDebit) }}（借） / {{ formatMoney(tbData.totals.amountCredit) }}（贷）
          | 期末 {{ formatMoney(tbData.totals.endingDebit) }}（借） / {{ formatMoney(tbData.totals.endingCredit) }}（贷）
          <span :class="['tb-badge', tbBalanced ? 'tb-balanced' : 'tb-unbalanced']" style="margin-left:12px">
            {{ tbBalanced ? '✓ 试算平衡' : '✗ 试算不平衡' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance-ledger-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.ledger-tab-header {
  margin-bottom: 12px;
}
.project-tab-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.period-show {
  font-size: 13px;
  font-weight: bold;
  color: var(--epp-ink);
}
.data-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.money {
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--epp-ink);
}
.dir-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.dir-debit {
  background-color: rgba(103, 194, 58, 0.12);
  color: #67c23a;
}
.dir-credit {
  background-color: rgba(245, 108, 108, 0.12);
  color: #f56c6c;
}
.tb-badge {
  font-size: 11px;
  font-weight: bold;
  padding: 3px 8px;
  border-radius: 12px;
}
.tb-balanced {
  background-color: rgba(103, 194, 58, 0.15);
  color: #67c23a;
  border: 1px solid rgba(103, 194, 58, 0.3);
}
.tb-unbalanced {
  background-color: rgba(245, 108, 108, 0.15);
  color: #f56c6c;
  border: 1px solid rgba(245, 108, 108, 0.3);
}
.mc-empty {
  padding: 48px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
.query-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  background-color: var(--epp-ledger);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--epp-line-light);
  flex-shrink: 0;
}
.query-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.query-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
