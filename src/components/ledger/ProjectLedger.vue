<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../../api';
import type {
  FinanceSubject,
  AuxProjectType,
  AuxProjectValue,
  AuxProjectBalanceRow,
  AuxProjectDetailRow,
  AuxProjectCombo
} from '../../api';
import { downloadExcel } from '../../utils/excelExport';

const props = defineProps<{
  period: string;
  allSubjects: FinanceSubject[];
}>();

const api = getFinanceApi();
const activeSubTab = ref('balance'); // 'balance' | 'detail' | 'combo'

const currentYear = computed(() => props.period.slice(0, 4) || String(new Date().getFullYear()));

/* ========== 核算类别公共接口 ========== */
const auxTypes = ref<AuxProjectType[]>([]);
async function loadAuxTypes() {
  try {
    auxTypes.value = await api.listAuxProjectTypes();
  } catch (e) {
    console.warn('[ProjectLedger] 加载项目类别失败:', e);
    auxTypes.value = [];
  }
}

/* ========== 核算项目余额表 ========== */
const pbPeriod = ref(props.period);
const pbTypeId = ref<number | null>(null);
const pbValueId = ref<number | null>(null);
const pbAuxValues = ref<AuxProjectValue[]>([]);
const pbRows = ref<AuxProjectBalanceRow[]>([]);
const pbLoading = ref(false);

async function onPbTypeChange() {
  pbValueId.value = null;
  if (pbTypeId.value) {
    try {
      pbAuxValues.value = await api.listAuxProjectValues(pbTypeId.value);
    } catch (e) {
      console.warn('[ProjectLedger] 加载项目值失败:', e);
      pbAuxValues.value = [];
    }
  } else {
    pbAuxValues.value = [];
  }
}

async function queryProjectBalance() {
  pbLoading.value = true;
  try {
    pbRows.value = await api.getAuxProjectBalance({
      auxTypeId: pbTypeId.value || undefined,
      auxValueId: pbValueId.value || undefined,
      period: pbPeriod.value,
    });
  } catch (e: any) {
    ElMessage.error(e.message || '加载项目余额表失败');
  } finally {
    pbLoading.value = false;
  }
}

function handleExportPb() {
  const cols = [
    { header: '科目编码', key: 'subject_code', width: 12 },
    { header: '科目名称', key: 'subject_name', width: 22 },
    { header: '借方金额', key: 'debit_amount', width: 16, numFmt: '#,##0.00' },
    { header: '贷方金额', key: 'credit_amount', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, pbRows.value, `核算项目余额表_${pbPeriod.value}`, '核算项目余额表');
}

/* ========== 核算项目明细账 ========== */
const pdPeriod = ref(props.period);
const pdTypeId = ref<number | null>(null);
const pdValueId = ref<number | null>(null);
const pdAuxValues = ref<AuxProjectValue[]>([]);
const pdStartDate = ref('');
const pdEndDate = ref('');
const pdPage = ref(1);
const pdPageSize = 50;
const pdTotal = ref(0);
const pdRows = ref<AuxProjectDetailRow[]>([]);
const pdLoading = ref(false);

async function onPdTypeChange() {
  pdValueId.value = null;
  if (pdTypeId.value) {
    try {
      pdAuxValues.value = await api.listAuxProjectValues(pdTypeId.value);
    } catch (e) {
      console.warn('[ProjectLedger] 加载项目值失败:', e);
      pdAuxValues.value = [];
    }
  } else {
    pdAuxValues.value = [];
  }
}

async function queryProjectDetail(resetPage = true) {
  if (resetPage) pdPage.value = 1;
  pdLoading.value = true;
  try {
    const result = await api.getAuxProjectDetail({
      auxTypeId: pdTypeId.value || undefined,
      auxValueId: pdValueId.value || undefined,
      period: pdPeriod.value,
      startDate: pdStartDate.value || undefined,
      endDate: pdEndDate.value || undefined,
      page: pdPage.value,
      pageSize: pdPageSize,
    });
    pdRows.value = result.rows;
    pdTotal.value = result.total;
  } catch (e: any) {
    ElMessage.error(e.message || '加载项目明细账失败');
  } finally {
    pdLoading.value = false;
  }
}

function handleExportPd() {
  const cols = [
    { header: '日期', key: 'voucher_date', width: 12 },
    { header: '凭证字号', key: 'voucher_no', width: 12 },
    { header: '摘要', key: 'summary', width: 22 },
    { header: '科目编码', key: 'subject_code', width: 12 },
    { header: '科目名称', key: 'subject_name', width: 20 },
    { header: '借方金额', key: 'debit', width: 16, numFmt: '#,##0.00' },
    { header: '贷方金额', key: 'credit', width: 16, numFmt: '#,##0.00' }
  ];
  downloadExcel(cols, pdRows.value, `核算项目明细账_${pdPeriod.value}`, '核算项目明细账');
}

/* ========== 核算项目组合表 ========== */
const pcTypeId = ref<number | null>(null);
const pcData = ref<AuxProjectCombo | null>(null);
const pcLoading = ref(false);

async function queryProjectCombo() {
  pcLoading.value = true;
  try {
    pcData.value = await api.getAuxProjectCombo({
      period: props.period,
      auxTypeId: pcTypeId.value || undefined,
    });
  } catch (e: any) {
    ElMessage.error(e.message || '加载组合表失败');
  } finally {
    pcLoading.value = false;
  }
}

function formatMoney(v: number): string {
  return v ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

watch(() => props.period, (newP) => {
  pbPeriod.value = newP;
  pdPeriod.value = newP;
  if (activeSubTab.value === 'balance') queryProjectBalance();
  else if (activeSubTab.value === 'detail') queryProjectDetail();
  else queryProjectCombo();
});

onMounted(() => {
  loadAuxTypes();
  queryProjectBalance();
});
</script>

<template>
  <div class="project-ledger-panel">
    <div class="ledger-tab-header">
      <el-radio-group v-model="activeSubTab" size="small">
        <el-radio-button value="balance">核算项目余额表</el-radio-button>
        <el-radio-button value="detail">核算项目明细账</el-radio-button>
        <el-radio-button value="combo">核算项目组合表</el-radio-button>
      </el-radio-group>
    </div>

    <!-- ==================== 核算项目余额表 ==================== -->
    <div v-if="activeSubTab === 'balance'" v-loading="pbLoading" class="project-tab-content">
      <div class="query-bar">
        <div class="query-left">
          <span class="query-label">期间</span>
          <el-select v-model="pbPeriod" size="small" style="width:110px">
            <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="currentYear+'-'+m" :value="currentYear+'-'+m" />
          </el-select>
          <span class="query-label">项目类型</span>
          <el-select v-model="pbTypeId" size="small" style="width:140px" placeholder="全部" clearable @change="onPbTypeChange">
            <el-option v-for="t in auxTypes" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
          <span class="query-label">具体项目</span>
          <el-select v-model="pbValueId" size="small" style="width:160px" placeholder="全部" clearable :disabled="!pbTypeId">
            <el-option v-for="v in pbAuxValues" :key="v.id" :label="v.code + ' ' + v.name" :value="v.id" />
          </el-select>
        </div>
        <div class="query-right">
          <el-button size="small" type="primary" @click="queryProjectBalance">查询</el-button>
          <el-button size="small" @click="handleExportPb" :disabled="pbRows.length === 0 || pbLoading">导出</el-button>
        </div>
      </div>

      <el-table v-if="pbRows.length > 0" :data="pbRows" border stripe size="small" height="100%">
        <el-table-column prop="subject_code" label="科目编码" min-width="90" align="center" fixed />
        <el-table-column prop="subject_name" label="科目名称" min-width="120" align="center" show-overflow-tooltip />
        <el-table-column prop="debit_amount" label="借方金额" align="center" min-width="110">
          <template #default="{ row }"><span class="money">{{ formatMoney(row.debit_amount) }}</span></template>
        </el-table-column>
        <el-table-column prop="credit_amount" label="贷方金额" align="center" min-width="110">
          <template #default="{ row }"><span class="money">{{ formatMoney(row.credit_amount) }}</span></template>
        </el-table-column>
        <el-table-column label="余额方向" align="center" width="65">
          <template #default="{ row }">{{ row.debit_amount >= row.credit_amount ? '借' : '贷' }}</template>
        </el-table-column>
        <el-table-column label="余额" align="center" min-width="110">
          <template #default="{ row }"><span class="money">{{ formatMoney(Math.abs(row.debit_amount - row.credit_amount)) }}</span></template>
        </el-table-column>
      </el-table>
      <div v-else class="mc-empty"><p>点击「查询」按钮加载核算项目数据</p></div>
    </div>

    <!-- ==================== 核算项目明细账 ==================== -->
    <div v-else-if="activeSubTab === 'detail'" v-loading="pdLoading" class="project-tab-content">
      <div class="query-bar">
        <div class="query-left">
          <span class="query-label">期间</span>
          <el-select v-model="pdPeriod" size="small" style="width:110px">
            <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="currentYear+'-'+m" :value="currentYear+'-'+m" />
          </el-select>
          <span class="query-label">项目类型</span>
          <el-select v-model="pdTypeId" size="small" style="width:140px" placeholder="全部" clearable @change="onPdTypeChange">
            <el-option v-for="t in auxTypes" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
          <span class="query-label">具体项目</span>
          <el-select v-model="pdValueId" size="small" style="width:160px" placeholder="全部" clearable :disabled="!pdTypeId">
            <el-option v-for="v in pdAuxValues" :key="v.id" :label="v.code + ' ' + v.name" :value="v.id" />
          </el-select>
        </div>
      </div>
      <div class="query-bar">
        <div class="query-left">
          <span class="query-label">日期范围</span>
          <el-date-picker v-model="pdStartDate" type="date" size="small" style="width:130px" placeholder="开始日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
          <span class="query-sep">-</span>
          <el-date-picker v-model="pdEndDate" type="date" size="small" style="width:130px" placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
        </div>
        <div class="query-right">
          <el-button size="small" type="primary" @click="queryProjectDetail(true)">查询</el-button>
          <el-button size="small" @click="handleExportPd" :disabled="pdRows.length === 0 || pdLoading">导出</el-button>
        </div>
      </div>

      <el-table v-if="pdRows.length > 0" :data="pdRows" border stripe size="small" height="100%">
        <el-table-column prop="voucher_date" label="日期" min-width="90" align="center" fixed />
        <el-table-column label="凭证字号" min-width="105" align="center" fixed>
          <template #default="{ row }">{{ row.voucher_word }}-{{ row.voucher_no }}</template>
        </el-table-column>
        <el-table-column prop="summary" label="摘要" min-width="120" align="center" show-overflow-tooltip />
        <el-table-column prop="subject_code" label="科目编码" min-width="85" align="center" />
        <el-table-column prop="subject_name" label="科目名称" min-width="100" align="center" show-overflow-tooltip />
        <el-table-column prop="debit" label="借方金额" align="center" min-width="100">
          <template #default="{ row }"><span class="money">{{ row.debit > 0 ? formatMoney(row.debit) : '' }}</span></template>
        </el-table-column>
        <el-table-column prop="credit" label="贷方金额" align="center" min-width="100">
          <template #default="{ row }"><span class="money">{{ row.credit > 0 ? formatMoney(row.credit) : '' }}</span></template>
        </el-table-column>
      </el-table>
      <div v-else class="mc-empty"><p>点击「查询」按钮加载核算项目明细</p></div>
      <div v-if="pdTotal > pdPageSize" class="pagination-bar">
        <el-pagination background layout="prev, pager, next" :total="pdTotal" :page-size="pdPageSize" v-model:current-page="pdPage" @current-change="() => queryProjectDetail(false)" />
      </div>
    </div>

    <!-- ==================== 核算项目组合表 ==================== -->
    <div v-else-if="activeSubTab === 'combo'" v-loading="pcLoading" class="project-tab-content">
      <div class="query-bar">
        <div class="query-left">
          <span class="query-label">期间：{{ period }}</span>
          <span class="query-label">核算类别</span>
          <el-select v-model="pcTypeId" size="small" style="width:140px" placeholder="全部" clearable @change="queryProjectCombo">
            <el-option v-for="t in auxTypes" :key="t.id" :label="t.name" :value="t.id" />
          </el-select>
        </div>
        <div class="query-right">
          <el-button size="small" type="primary" @click="queryProjectCombo">查询</el-button>
        </div>
      </div>

      <div v-if="pcData && pcData.columns.length > 0 && pcData.rows.length > 0" class="mc-table-wrap">
        <el-table :data="pcData.rows" border stripe size="small" height="100%">
          <el-table-column prop="subject_code" label="科目编码" min-width="90" align="center" fixed />
          <el-table-column prop="subject_name" label="科目名称" min-width="120" align="center" show-overflow-tooltip fixed />
          <template v-for="(col, ci) in pcData.columns" :key="col.value_id">
            <el-table-column :label="col.value_code + ' ' + col.value_name + '(借)'" align="center" min-width="105">
              <template #default="{ row }">
                <span v-if="row.cells[ci].debit > 0" class="money">{{ formatMoney(row.cells[ci].debit) }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="col.value_code + ' ' + col.value_name + '(贷)'" align="center" min-width="105">
              <template #default="{ row }">
                <span v-if="row.cells[ci].credit > 0" class="money">{{ formatMoney(row.cells[ci].credit) }}</span>
              </template>
            </el-table-column>
          </template>
        </el-table>

        <!-- 合计行 -->
        <div v-if="pcData.totals && pcData.totals.length > 0" class="summary-bar" style="margin-top:8px">
          合计：
          <template v-for="(t, ti) in pcData.totals" :key="ti">
            <template v-if="ti > 0"> | </template>
            {{ pcData.columns[ti].value_name }} 借:{{ formatMoney(t.debit) }} 贷:{{ formatMoney(t.credit) }}
          </template>
        </div>
      </div>
      <div v-else class="mc-placeholder">
        <p>选择项目类别后，系统将自动展开项目名称组合列</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-ledger-panel {
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
.query-label {
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
.mc-table-wrap {
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
.mc-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 48px;
  text-align: center;
  color: var(--epp-ink-sub);
  background-color: var(--epp-ledger);
  border: 1px dashed var(--epp-line);
  border-radius: 8px;
}
.mc-empty {
  padding: 24px;
  text-align: center;
  color: var(--epp-ink-sub);
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
</style>
