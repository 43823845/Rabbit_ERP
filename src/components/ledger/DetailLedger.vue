<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../../api';
import type { FinanceSubject, DetailLedgerResult } from '../../api';
import { downloadExcel } from '../../utils/excelExport';

const props = defineProps<{
  period: string;
  selectedSubjectCode: string;
  allSubjects: FinanceSubject[];
}>();

const api = getFinanceApi();
const loading = ref(false);

interface DetailDisplayRow {
  type: 'opening' | 'carryForward' | 'entry' | 'periodTotal' | 'yearTotal' | 'carriedForward';
  date: string;
  voucher: string;
  summary: string;
  debit: number;
  credit: number;
  direction: string;
  balance: number;
}

const detailRows = ref<DetailDisplayRow[]>([]);
const detailTotal = ref(0);
const detailPage = ref(1);
const detailPageSize = 50;

const detailStartDate = ref('');
const detailEndDate = ref('');
const detailIncludeUnposted = ref(false);

const detailSubject = computed(() => 
  props.allSubjects.find(s => s.code === props.selectedSubjectCode)
);
const detailSubjectName = computed(() => detailSubject.value?.name || '');

async function queryDetailLedger(resetPage = true) {
  if (!props.selectedSubjectCode) return;
  if (resetPage) detailPage.value = 1;
  loading.value = true;
  try {
    const subj = detailSubject.value;

    // 查询期初余额
    const openings = await api.getOpeningBalances(props.period);
    const opening = openings.find(o => o.subject_code === props.selectedSubjectCode);
    const openingBalance = opening
      ? (Number(opening.debit) - Number(opening.credit))
      : 0;

    // 查询本期明细（带翻页）
    const result: DetailLedgerResult = await api.getDetailLedger({
      subjectCode: props.selectedSubjectCode,
      period: props.period,
      startDate: detailStartDate.value || undefined,
      endDate: detailEndDate.value || undefined,
      page: detailPage.value,
      pageSize: detailPageSize,
    });
    detailTotal.value = result.total;

    const isDebitDir = subj?.direction === 'debit';
    const rows = result.rows;
    const display: DetailDisplayRow[] = [];
    let runningBalance = openingBalance;

    // 确定期初余额方向
    const openingDir = isDebitDir
      ? (openingBalance >= 0 ? '借' : '贷')
      : (openingBalance >= 0 ? '贷' : '借');

    // 承前页行（非第一页时显示）
    if (detailPage.value > 1 && result.carryForward !== undefined) {
      const cfBalance = result.carryForward;
      const cfDir = cfBalance >= 0
        ? (isDebitDir ? '借' : '贷')
        : (isDebitDir ? '贷' : '借');
      runningBalance = cfBalance;
      display.push({
        type: 'carryForward',
        date: '', voucher: '', summary: '承前页',
        debit: 0, credit: 0,
        direction: cfDir,
        balance: Math.abs(cfBalance),
      });
    } else {
      // 期初余额行（第一页）
      display.push({
        type: 'opening',
        date: '', voucher: '', summary: '期初余额',
        debit: 0, credit: 0,
        direction: openingDir,
        balance: Math.abs(openingBalance),
      });
    }

    // 本期发生额累计
    let periodDebit = 0;
    let periodCredit = 0;

    // 逐笔分录
    for (const r of rows) {
      const d = Number(r.debit || 0);
      const c = Number(r.credit || 0);
      periodDebit += d;
      periodCredit += c;

      if (isDebitDir) {
        runningBalance = runningBalance + d - c;
      } else {
        runningBalance = runningBalance + c - d;
      }

      const dir = runningBalance >= 0
        ? (isDebitDir ? '借' : '贷')
        : (isDebitDir ? '贷' : '借');

      display.push({
        type: 'entry',
        date: r.voucher_date,
        voucher: `${r.voucher_word}-${r.voucher_no}`,
        summary: r.summary,
        debit: d,
        credit: c,
        direction: dir,
        balance: Math.abs(runningBalance),
      });
    }

    // 本年累计（从年初至今）
    const yearStart = props.period.substring(0, 4) + '-01';
    const yearResult = await api.getDetailLedger({
      subjectCode: props.selectedSubjectCode,
      startDate: yearStart + '-01',
      endDate: props.period + '-31',
    });
    let yearDebit = 0;
    let yearCredit = 0;
    for (const r of yearResult.rows) {
      yearDebit += Number(r.debit || 0);
      yearCredit += Number(r.credit || 0);
    }

    // 本期合计行
    display.push({
      type: 'periodTotal',
      date: '', voucher: '', summary: '本期合计',
      debit: periodDebit, credit: periodCredit,
      direction: '',
      balance: Math.abs(runningBalance),
    });

    // 本年累计行
    const yearBalance = isDebitDir
      ? openingBalance + yearDebit - yearCredit
      : openingBalance + yearCredit - yearDebit;
    display.push({
      type: 'yearTotal',
      date: '', voucher: '', summary: '本年累计',
      debit: yearDebit, credit: yearCredit,
      direction: runningBalance >= 0
        ? (isDebitDir ? '借' : '贷')
        : (isDebitDir ? '贷' : '借'),
      balance: Math.abs(yearBalance),
    });

    // 过次页行（非最后一页时显示）
    if (result.carriedForward !== undefined && detailPage.value * detailPageSize < detailTotal.value) {
      const cfBalance = result.carriedForward;
      const cfDir = cfBalance >= 0
        ? (isDebitDir ? '借' : '贷')
        : (isDebitDir ? '贷' : '借');
      display.push({
        type: 'carriedForward',
        date: '', voucher: '', summary: '过次页',
        debit: 0, credit: 0,
        direction: cfDir,
        balance: Math.abs(cfBalance),
      });
    }

    detailRows.value = display;
  } catch (e: any) {
    ElMessage.error(e.message || '加载明细账失败');
  } finally {
    loading.value = false;
  }
}

function handleExportDetail() {
  const cols = [
    { header: '日期', key: 'date', width: 12 },
    { header: '凭证字号', key: 'voucher', width: 12 },
    { header: '摘要', key: 'summary', width: 22 },
    { header: '借方', key: 'debit', width: 16, numFmt: '#,##0.00' },
    { header: '贷方', key: 'credit', width: 16, numFmt: '#,##0.00' },
    { header: '方向', key: 'direction', width: 8 },
    { header: '余额', key: 'balance', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, detailRows.value, `明细账_${props.selectedSubjectCode}_${props.period}`, '明细账');
}

function formatMoney(v: number): string {
  return v ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

watch(() => [props.period, props.selectedSubjectCode], () => {
  queryDetailLedger();
});

onMounted(() => {
  queryDetailLedger();
});
</script>

<template>
  <div class="ledger-detail-panel">
    <div class="query-bar">
      <div class="query-left">
        <span class="period-show">期间：{{ period }}</span>
        <el-date-picker v-model="detailStartDate" type="date" placeholder="开始日期" size="small" style="width:125px" value-format="YYYY-MM-DD" clearable />
        <span class="query-sep">-</span>
        <el-date-picker v-model="detailEndDate" type="date" placeholder="结束日期" size="small" style="width:125px" value-format="YYYY-MM-DD" clearable />
        <el-checkbox v-model="detailIncludeUnposted" size="small">包含未过账</el-checkbox>
      </div>
      <div class="query-right">
        <el-button type="primary" size="small" @click="queryDetailLedger(true)">查询</el-button>
        <el-button size="small" @click="detailStartDate='';detailEndDate='';detailIncludeUnposted=false;queryDetailLedger(true)">重置</el-button>
        <el-button size="small" @click="handleExportDetail">导出</el-button>
      </div>
    </div>

    <div v-if="selectedSubjectCode" class="detail-content-wrap">
      <!-- 科目信息头 -->
      <div class="subject-header">
        <span class="subject-code-tag">{{ selectedSubjectCode }}</span>
        <span class="subject-name-text">{{ detailSubjectName }}</span>
        <el-tag v-if="detailSubject" :type="detailSubject.direction === 'debit' ? 'success' : 'danger'" size="small" class="subject-dir-tag">
          {{ detailSubject.direction === 'debit' ? '借方科目' : '贷方科目' }}
        </el-tag>
      </div>

      <!-- 明细账表格 -->
      <div class="data-panel" v-loading="loading">
        <el-table :data="detailRows" border stripe size="small" height="100%" :show-header="true">
          <el-table-column prop="date" label="日期" min-width="90" align="center" />
          <el-table-column prop="voucher" label="凭证字号" min-width="95" align="center" />
          <el-table-column prop="summary" label="摘要" min-width="180" align="center" show-overflow-tooltip>
            <template #default="{ row }">
              <span :class="{ 'summary-highlight': row.type !== 'entry' }">
                {{ row.summary }}
              </span>
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
        <!-- 分页 -->
        <div class="pagination-bar" v-if="detailTotal > detailPageSize">
          <el-pagination
            v-model:current-page="detailPage"
            :page-size="detailPageSize"
            :total="detailTotal"
            layout="total, prev, pager, next"
            size="small"
            @current-change="queryDetailLedger(false)"
          />
        </div>
      </div>
    </div>
    <div v-else class="ledger-placeholder">
      <el-empty description="请在左侧科目树选择科目查看明细账" :image-size="80" />
    </div>
  </div>
</template>

<style scoped>
.ledger-detail-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.detail-content-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.subject-header {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: var(--epp-ledger);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--epp-line-light);
}
.subject-code-tag {
  font-family: 'Consolas', monospace;
  font-weight: bold;
  background-color: var(--epp-ink);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}
.subject-name-text {
  font-weight: 700;
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
  letter-spacing: -0.2px;
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
.summary-highlight {
  font-weight: bold;
  color: var(--epp-ink);
}
.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
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
.ledger-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
