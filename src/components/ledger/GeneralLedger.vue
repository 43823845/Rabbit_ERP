<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../../api';
import type { FinanceSubject } from '../../api';
import { downloadExcel } from '../../utils/excelExport';

const props = defineProps<{
  period: string;
  allSubjects: FinanceSubject[];
}>();

const api = getFinanceApi();
const generalLoading = ref(false);

interface GeneralDisplayRow {
  code: string;
  name: string;
  summary: string;
  debit: number;
  credit: number;
  direction: string;
  balance: number;
  rowType: 'opening' | 'periodTotal' | 'yearTotal';
  groupIdx: number;
}

const generalRows = ref<GeneralDisplayRow[]>([]);
const generalPeriodFrom = ref(props.period);
const generalPeriodTo = ref(props.period);
const generalLevel = ref('all'); // '1' | 'all'
const generalShowAux = ref(false);

async function queryGeneralLedger() {
  generalLoading.value = true;
  try {
    // 获取期初余额
    const openings = await api.getOpeningBalances(generalPeriodFrom.value);
    // 获取本期科目余额（含发生额）
    const balance = await api.getSubjectBalance({ period: generalPeriodTo.value });
    // 获取全年累计
    const yearBalances = await api.getSubjectBalance({});

    // 按编码排序的科目（根据级次过滤）
    const subjects = generalLevel.value === '1'
      ? props.allSubjects.filter(s => s.level === 1)
      : props.allSubjects.filter(s => s.level <= 2);
    subjects.sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));

    const rows: GeneralDisplayRow[] = [];
    let groupIdx = 0;

    for (const subj of subjects) {
      const opening = openings.find(o => o.subject_code === subj.code);
      const openingBalance = opening
        ? (Number(opening.debit) - Number(opening.credit))
        : 0;

      const bal = balance.find(b => b.code === subj.code);
      const periodDebit = bal?.debitAmount || 0;
      const periodCredit = bal?.creditAmount || 0;

      const yearBal = yearBalances.find(b => b.code === subj.code);
      const yearDebit = yearBal?.debitAmount || 0;
      const yearCredit = yearBal?.creditAmount || 0;

      const isDebitDir = subj.direction === 'debit';

      // 方向判定
      const openingDir = isDebitDir
        ? (openingBalance >= 0 ? '借' : '贷')
        : (openingBalance >= 0 ? '贷' : '借');

      const periodBalance = isDebitDir
        ? openingBalance + periodDebit - periodCredit
        : openingBalance + periodCredit - periodDebit;
      const periodDir = periodBalance >= 0
        ? (isDebitDir ? '借' : '贷')
        : (isDebitDir ? '贷' : '借');

      const yearBalance = isDebitDir
        ? openingBalance + yearDebit - yearCredit
        : openingBalance + yearCredit - yearDebit;
      const yearDir = yearBalance >= 0
        ? (isDebitDir ? '借' : '贷')
        : (isDebitDir ? '贷' : '借');

      rows.push({
        code: subj.code, name: subj.name,
        summary: '期初余额', debit: 0, credit: 0,
        direction: openingDir, balance: Math.abs(openingBalance),
        rowType: 'opening', groupIdx,
      });
      rows.push({
        code: subj.code, name: subj.name,
        summary: '本期合计', debit: periodDebit, credit: periodCredit,
        direction: periodDir, balance: Math.abs(periodBalance),
        rowType: 'periodTotal', groupIdx,
      });
      rows.push({
        code: subj.code, name: subj.name,
        summary: '本年累计', debit: yearDebit, credit: yearCredit,
        direction: yearDir, balance: Math.abs(yearBalance),
        rowType: 'yearTotal', groupIdx,
      });
      groupIdx++;
    }

    generalRows.value = rows;
  } catch (e: any) {
    ElMessage.error(e.message || '加载总账失败');
  } finally {
    generalLoading.value = false;
  }
}

function generalSpanMethod({ row, rowIndex }: { row: GeneralDisplayRow; column: any; rowIndex: number }) {
  // 我们只合并 code 和 name 列，第一列和第二列 index 为 0, 1
  // 由于 element table column span 可以根据组件内的单元格位置直接返回
  // 我们在 template 绑定中处理了这一逻辑
  const idx = row.groupIdx;
  const firstRow = generalRows.value.findIndex(r => r.groupIdx === idx);
  if (firstRow === rowIndex) {
    return { rowspan: 3, colspan: 1 };
  }
  return { rowspan: 0, colspan: 0 };
}

function handleExportGeneral() {
  const cols = [
    { header: '科目编码', key: 'code', width: 12 },
    { header: '科目名称', key: 'name', width: 22 },
    { header: '摘要', key: 'summary', width: 15 },
    { header: '借方', key: 'debit', width: 16, numFmt: '#,##0.00' },
    { header: '贷方', key: 'credit', width: 16, numFmt: '#,##0.00' },
    { header: '方向', key: 'direction', width: 8 },
    { header: '余额', key: 'balance', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, generalRows.value, `总账_${generalPeriodFrom.value}_${generalPeriodTo.value}`, '总账');
}

function formatMoney(v: number): string {
  return v ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

watch(() => props.period, (newP) => {
  generalPeriodFrom.value = newP;
  generalPeriodTo.value = newP;
  queryGeneralLedger();
});

onMounted(() => {
  queryGeneralLedger();
});
</script>

<template>
  <div class="general-ledger-panel">
    <div class="query-bar">
      <div class="query-left">
        <span class="query-label">期间：</span>
        <el-select v-model="generalPeriodFrom" size="small" style="width:110px">
          <el-option v-for="p in [generalPeriodFrom]" :key="p" :label="p" :value="p" />
        </el-select>
        <span class="query-sep">至</span>
        <el-select v-model="generalPeriodTo" size="small" style="width:110px">
          <el-option v-for="p in [generalPeriodTo]" :key="p" :label="p" :value="p" />
        </el-select>
        <el-radio-group v-model="generalLevel" size="small" @change="queryGeneralLedger">
          <el-radio-button value="1">一级</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
        <el-checkbox v-model="generalShowAux" size="small">显示辅助核算</el-checkbox>
      </div>
      <div class="query-right">
        <el-button type="primary" size="small" @click="queryGeneralLedger">查询</el-button>
        <el-button size="small" @click="handleExportGeneral">导出</el-button>
      </div>
    </div>

    <div class="data-panel" v-loading="generalLoading">
      <el-table
        :data="generalRows" border stripe size="small" height="100%"
        :span-method="generalSpanMethod"
      >
        <el-table-column prop="code" label="科目编码" min-width="85" align="center" />
        <el-table-column prop="name" label="科目名称" min-width="140" align="center" show-overflow-tooltip />
        <el-table-column prop="summary" label="摘要" min-width="130" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'summary-highlight': row.rowType !== 'opening' }">{{ row.summary }}</span>
          </template>
        </el-table-column>
        <el-table-column label="借方" min-width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.debit !== 0" class="money">{{ formatMoney(row.debit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="贷方" min-width="110" align="center">
          <template #default="{ row }">
            <span v-if="row.credit !== 0" class="money">{{ formatMoney(row.credit) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="方向" width="55" align="center">
          <template #default="{ row }">
            <span v-if="row.direction" :class="['dir-tag', row.direction === '借' ? 'dir-debit' : 'dir-credit']">
              {{ row.direction }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="余额" min-width="110" align="center">
          <template #default="{ row }">
            <span class="money">{{ formatMoney(row.balance) }}</span>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.general-ledger-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.data-panel {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.summary-highlight {
  font-weight: bold;
  color: var(--epp-ink);
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
