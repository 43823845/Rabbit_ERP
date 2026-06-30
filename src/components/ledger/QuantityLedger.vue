<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../../api';
import type { FinanceSubject, QuantityDetailLedgerRow, QuantityGeneralLedgerRow } from '../../api';
import { downloadExcel } from '../../utils/excelExport';

const props = defineProps<{
  period: string;
  selectedSubjectCode: string;
  allSubjects: FinanceSubject[];
}>();

const api = getFinanceApi();
const loading = ref(false);
const showDetail = ref(true); // 控制明细账/总账

const currentYear = computed(() => props.period.slice(0, 4) || String(new Date().getFullYear()));
const qdSubjectName = computed(() => 
  props.allSubjects.find(s => s.code === props.selectedSubjectCode)?.name || ''
);

/* ========== 数量金额明细账 ========== */
const qdStartDate = ref('');
const qdEndDate = ref('');
const qdPage = ref(1);
const qdPageSize = 50;
const qdTotal = ref(0);
const qdRows = ref<QuantityDetailLedgerRow[]>([]);

async function queryQtyDetail(resetPage = true) {
  if (!props.selectedSubjectCode) return;
  if (resetPage) qdPage.value = 1;
  loading.value = true;
  try {
    const result = await api.getQuantityDetailLedger({
      subjectCode: props.selectedSubjectCode,
      period: props.period,
      startDate: qdStartDate.value || undefined,
      endDate: qdEndDate.value || undefined,
      page: qdPage.value,
      pageSize: qdPageSize,
    });
    qdRows.value = result.rows;
    qdTotal.value = result.total;
  } catch (e: any) {
    ElMessage.error(e.message || '加载数量金额明细账失败');
  } finally {
    loading.value = false;
  }
}

function handleExportQtyDetail() {
  const cols = [
    { header: '日期', key: 'voucher_date', width: 12 },
    { header: '凭证字号', key: 'voucher_no', width: 12 },
    { header: '摘要', key: 'summary', width: 22 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '单价', key: 'unit_price', width: 12, numFmt: '#,##0.00' },
    { header: '入库数量', key: 'quantity', width: 12, numFmt: '#,##0.00' },
    { header: '借方金额', key: 'debit', width: 16, numFmt: '#,##0.00' },
    { header: '贷方金额', key: 'credit', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, qdRows.value, `数量金额明细账_${props.selectedSubjectCode}_${props.period}`, '数量金额明细账');
}

/* ========== 数量金额总账 ========== */
const qgRows = ref<QuantityGeneralLedgerRow[]>([]);
const qgLoading = ref(false);

async function queryQtyGeneral() {
  qgLoading.value = true;
  try {
    const result = await api.getQuantityGeneralLedger({
      period: props.period,
      subjectCode: props.selectedSubjectCode || undefined,
      page: 1,
      pageSize: 50,
    });
    qgRows.value = result.rows;
  } catch (e: any) {
    ElMessage.error(e.message || '加载数量金额总账失败');
  } finally {
    qgLoading.value = false;
  }
}

function handleExportQtyGeneral() {
  const cols = [
    { header: '科目编码', key: 'code', width: 12 },
    { header: '科目名称', key: 'name', width: 22 },
    { header: '单位', key: 'unit', width: 8 },
    { header: '借方发生量', key: 'in_quantity', width: 14, numFmt: '#,##0.00' },
    { header: '贷方发生量', key: 'out_quantity', width: 14, numFmt: '#,##0.00' },
    { header: '借方累计金额', key: 'total_debit', width: 16, numFmt: '#,##0.00' },
    { header: '贷方累计金额', key: 'total_credit', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, qgRows.value, `数量金额总账_${props.period}`, '数量金额总账');
}

function formatMoney(v: number): string {
  return v ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

watch(() => [props.period, props.selectedSubjectCode], () => {
  if (showDetail.value) {
    queryQtyDetail();
  } else {
    queryQtyGeneral();
  }
});

onMounted(() => {
  if (showDetail.value) {
    queryQtyDetail();
  } else {
    queryQtyGeneral();
  }
});
</script>

<template>
  <div class="quantity-ledger-panel">
    <div class="ledger-tab-header">
      <el-radio-group v-model="showDetail" size="small" @change="showDetail ? queryQtyDetail() : queryQtyGeneral()">
        <el-radio-button :value="true">数量金额明细账</el-radio-button>
        <el-radio-button :value="false">数量金额总账</el-radio-button>
      </el-radio-group>
    </div>

    <!-- ==================== 数量金额明细账 ==================== -->
    <div v-if="showDetail" class="qty-detail-section">
      <div class="query-bar">
        <div class="query-left">
          <span class="period-show">期间：{{ period }}</span>
          <el-date-picker v-model="qdStartDate" type="date" placeholder="开始" size="small" style="width:120px" value-format="YYYY-MM-DD" clearable />
          <span class="query-sep">-</span>
          <el-date-picker v-model="qdEndDate" type="date" placeholder="结束" size="small" style="width:120px" value-format="YYYY-MM-DD" clearable />
        </div>
        <div class="query-right">
          <el-button type="primary" size="small" @click="queryQtyDetail(true)">查询</el-button>
          <el-button size="small" @click="qdStartDate='';qdEndDate='';queryQtyDetail(true)">重置</el-button>
          <el-button size="small" @click="handleExportQtyDetail">导出</el-button>
        </div>
      </div>

      <div v-if="selectedSubjectCode" class="detail-content-wrap">
        <div class="subject-header">
          <span class="subject-code">{{ selectedSubjectCode }}</span>
          <span class="subject-name">{{ qdSubjectName }}</span>
        </div>

        <div class="data-panel" v-loading="loading">
          <el-table :data="qdRows" border stripe size="small" height="100%">
            <el-table-column prop="voucher_date" label="日期" min-width="90" align="center" />
            <el-table-column label="凭证字号" min-width="105" align="center">
              <template #default="{ row }">{{ row.voucher_word }}-{{ row.voucher_no }}</template>
            </el-table-column>
            <el-table-column prop="summary" label="摘要" min-width="150" align="center" show-overflow-tooltip />
            <el-table-column prop="unit" label="单位" width="70" align="center" />
            <el-table-column label="单价" min-width="100" align="center">
              <template #default="{ row }"><span class="money">{{ formatMoney(row.unit_price) }}</span></template>
            </el-table-column>
            <el-table-column prop="quantity" label="入库数量" min-width="90" align="center">
              <template #default="{ row }"><span class="money">{{ row.quantity }}</span></template>
            </el-table-column>
            <el-table-column label="借方金额" min-width="110" align="center">
              <template #default="{ row }"><span class="money">¥{{ formatMoney(row.debit) }}</span></template>
            </el-table-column>
            <el-table-column label="贷方金额" min-width="110" align="center">
              <template #default="{ row }"><span class="money">¥{{ formatMoney(row.credit) }}</span></template>
            </el-table-column>
          </el-table>
          <div class="pagination-bar" v-if="qdTotal > qdPageSize">
            <el-pagination
              v-model:current-page="qdPage"
              :page-size="qdPageSize"
              :total="qdTotal"
              layout="total, prev, pager, next"
              size="small"
              @current-change="queryQtyDetail(false)"
            />
          </div>
        </div>
      </div>
      <div v-else class="ledger-placeholder">
        <el-empty description="请在左侧科目树选择科目查看明细账" :image-size="80" />
      </div>
    </div>

    <!-- ==================== 数量金额总账 ==================== -->
    <div v-else class="qty-general-section">
      <div class="query-bar">
        <div class="query-left">
          <span class="period-show">期间：{{ period }}</span>
        </div>
        <div class="query-right">
          <el-button type="primary" size="small" @click="queryQtyGeneral">查询</el-button>
          <el-button size="small" @click="handleExportQtyGeneral">导出</el-button>
        </div>
      </div>

      <div class="data-panel" v-loading="qgLoading">
        <el-table :data="qgRows" border stripe size="small" height="100%">
          <el-table-column prop="code" label="科目编码" min-width="95" align="center" />
          <el-table-column prop="name" label="科目名称" min-width="150" align="center" show-overflow-tooltip />
          <el-table-column prop="unit" label="单位" width="70" align="center" />
          <el-table-column prop="in_quantity" label="借方发生量" min-width="100" align="center">
            <template #default="{ row }"><span class="money">{{ row.in_quantity }}</span></template>
          </el-table-column>
          <el-table-column prop="out_quantity" label="贷方发生量" min-width="100" align="center">
            <template #default="{ row }"><span class="money">{{ row.out_quantity }}</span></template>
          </el-table-column>
          <el-table-column label="借方累计金额" min-width="120" align="center">
            <template #default="{ row }"><span class="money">¥{{ formatMoney(row.total_debit) }}</span></template>
          </el-table-column>
          <el-table-column label="贷方累计金额" min-width="120" align="center">
            <template #default="{ row }"><span class="money">¥{{ formatMoney(row.total_credit) }}</span></template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quantity-ledger-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.ledger-tab-header {
  margin-bottom: 12px;
}
.qty-detail-section, .qty-general-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.detail-content-wrap {
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
.subject-header {
  margin-bottom: 12px;
  background-color: var(--epp-ledger);
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--epp-line-light);
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
