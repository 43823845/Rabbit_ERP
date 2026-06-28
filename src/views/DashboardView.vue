<script setup lang="ts">
// ponytail: 工作台 — 凭证搜索/统计/增改查/高亮定位
import { nextTick, onMounted, reactive, ref } from 'vue';
import {
  Document, Checked, CircleCheck,
  Search, Delete, View, Plus,
  ArrowDown, ArrowUp,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FinanceSubject, FinanceVoucher, VoucherFilter } from '../api';
import { getFinanceApi } from '../api';
import VoucherModal from '../components/VoucherModal.vue';
import VoucherListTable from '../components/VoucherListTable.vue';

const api = getFinanceApi();

const subjects = ref<FinanceSubject[]>([]);
const loading = ref(false);

const filter = reactive<VoucherFilter>({
  period: '2026-06', status: undefined, keyword: '',
  subjectCode: undefined, startDate: '', endDate: '',
  amountMin: undefined, amountMax: undefined,
});

const drafts = ref(0);
const audited = ref(0);
const posted = ref(0);
const totalVouchers = ref(0);
const activeCard = ref<string | null>(null);

const voucherModal = reactive({ open: false, voucher: null as FinanceVoucher | null });
const showAdvanced = ref(false);

onMounted(async () => {
  const data = await api.bootstrap();
  filter.period = data.book.current_period;
  subjects.value = data.subjects;
  await refreshStats();
  await doSearch();
});

async function refreshStats() {
  // 只统计当前账期的凭证
  const period = filter.period || '';
  const all = await api.listVouchers(period ? { period } : {});
  totalVouchers.value = all.length;
  drafts.value = all.filter(v => v.status === 'draft').length;
  audited.value = all.filter(v => v.status === 'audited').length;
  posted.value = all.filter(v => v.status === 'posted').length;
}

/* 点击卡片快速筛选 */
async function handleCardClick(status: string | null) {
  // 再次点击取消筛选
  if (activeCard.value === status) {
    activeCard.value = null;
    filter.status = undefined;
  } else {
    activeCard.value = status;
    filter.status = (status as VoucherFilter['status']) ?? undefined;
  }
  await doSearch();
}

const searchList = ref<FinanceVoucher[]>([]);
const highlightRowId = ref<number | null>(null);
const tableRef = ref<{ setCurrentRow?: (row: unknown) => void } | null>(null);

async function doSearch() {
  loading.value = true;
  const f: VoucherFilter = { ...filter };
  // 金额范围在客户端按凭证总金额过滤，不传给 API
  const amountMin = f.amountMin;
  const amountMax = f.amountMax;
  delete f.amountMin;
  delete f.amountMax;
  const hasConditions = Object.values(f).some(v => v !== '' && v !== undefined && v !== null);
  Object.keys(f).forEach(k => { const key = k as keyof VoucherFilter; if (f[key] === '' || f[key] === undefined || f[key] === null) delete f[key]; });
  let result = await api.listVouchers(f);

  // 客户端按凭证总金额（借方合计）过滤
  if (amountMin !== undefined || amountMax !== undefined) {
    result = result.filter(v => {
      const total = v.entries.reduce((sum, e) => sum + (e.debit || 0), 0);
      if (amountMin !== undefined && total < amountMin) return false;
      if (amountMax !== undefined && total > amountMax) return false;
      return true;
    });
  }

  searchList.value = result;
  highlightRowId.value = null;
  loading.value = false;

  // 搜索结果高亮第一行
  if (result.length > 0 && hasConditions) {
    highlightRowId.value = result[0].id;
    await nextTick();
    tableRef.value?.setCurrentRow?.(result[0]);
  }
}

function resetFilter() {
  filter.period = ''; filter.status = undefined; filter.keyword = '';
  filter.subjectCode = undefined; filter.startDate = ''; filter.endDate = '';
  filter.amountMin = undefined; filter.amountMax = undefined;
}

function openVoucher(v: FinanceVoucher) { voucherModal.voucher = v; voucherModal.open = true; }

function newVoucher() { voucherModal.voucher = null; voucherModal.open = true; }

async function handleSaved() {
  await refreshStats(); await doSearch();
}

async function handleDeleted() { voucherModal.open = false; await refreshStats(); await doSearch(); }

async function doAudit(v: FinanceVoucher) {
  if (v.status !== 'draft') { ElMessage.warning('仅草稿状态的凭证可审核'); return; }
  await ElMessageBox.confirm(`确定要审核凭证 ${v.voucher_word}-${v.voucher_no} 号吗？`, '确认审核', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
  await api.auditVoucher(v.id);
  ElMessage.success('审核成功');
  await refreshStats(); await doSearch();
}

async function doPost(v: FinanceVoucher) {
  if (v.status !== 'audited') { ElMessage.warning('仅已审核状态的凭证可过账'); return; }
  await ElMessageBox.confirm(`确定要过账凭证 ${v.voucher_word}-${v.voucher_no} 号吗？过账后不可直接修改。`, '确认过账', { confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning' });
  await api.postVoucher(v.id);
  ElMessage.success('过账成功');
  await refreshStats(); await doSearch();
}

async function doDelete(v: FinanceVoucher) {
  await ElMessageBox.confirm(`确定要删除凭证 ${v.voucher_word}-${v.voucher_no} 号吗？此操作不可撤销。`, '确认删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'error' });
  await api.deleteVoucher(v.id);
  ElMessage.success('删除成功');
  await refreshStats(); await doSearch();
}
</script>

<template>
  <div class="workspace">
    <!-- 统计卡片：点击快速筛选 -->
    <div class="stat-row">
      <div class="stat-card" :class="{ 'stat-card--active': activeCard === null }" @click="handleCardClick(null)" title="显示全部">
        <div class="stat-card__icon" style="background:#e6f4ff;color:#1677ff"><el-icon size="22"><Document /></el-icon></div>
        <div class="stat-card__info"><span class="stat-card__value">{{ totalVouchers }}</span><span class="stat-card__label">本期凭证</span></div>
        <div class="stat-card__bar" style="background:#1677ff"></div>
      </div>
      <div class="stat-card" :class="{ 'stat-card--active': activeCard === 'draft' }" @click="handleCardClick('draft')" title="仅显示草稿">
        <div class="stat-card__icon" style="background:#fffbe6;color:#d48806"><el-icon size="22"><Checked /></el-icon></div>
        <div class="stat-card__info"><span class="stat-card__value">{{ drafts }}</span><span class="stat-card__label">草稿待审</span></div>
        <div class="stat-card__bar" style="background:#faad14"></div>
      </div>
      <div class="stat-card" :class="{ 'stat-card--active': activeCard === 'audited' }" @click="handleCardClick('audited')" title="仅显示已审核">
        <div class="stat-card__icon" style="background:#e6f4ff;color:#1677ff"><el-icon size="22"><CircleCheck /></el-icon></div>
        <div class="stat-card__info"><span class="stat-card__value">{{ audited }}</span><span class="stat-card__label">已审核</span></div>
        <div class="stat-card__bar" style="background:#1677ff"></div>
      </div>
      <div class="stat-card" :class="{ 'stat-card--active': activeCard === 'posted' }" @click="handleCardClick('posted')" title="仅显示已过账">
        <div class="stat-card__icon" style="background:#f6ffed;color:#389e3d"><el-icon size="22"><CircleCheck /></el-icon></div>
        <div class="stat-card__info"><span class="stat-card__value">{{ posted }}</span><span class="stat-card__label">已过账</span></div>
        <div class="stat-card__bar" style="background:#52c41a"></div>
      </div>
    </div>

    <!-- 凭证查询面板 -->
    <div class="panel">
      <div class="panel__header">
        <span class="panel__title"><el-icon><Search /></el-icon> 凭证查询</span>
        <el-button size="small" type="primary" @click="newVoucher"><el-icon><Plus /></el-icon> 新增凭证</el-button>
      </div>

      <div class="filter-bar">
        <!-- 主筛选行：高频筛选项 -->
        <div class="filter-row">
          <el-input
            v-model="filter.keyword"
            placeholder="搜索摘要 / 备注 / 凭证号"
            clearable
            :prefix-icon="Search"
            @keyup.enter="doSearch"
            class="fi-keyword"
          />
          <el-date-picker
            v-model="filter.startDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="开始日期"
            class="fi-date"
          />
          <span class="filter-sep">至</span>
          <el-date-picker
            v-model="filter.endDate"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="结束日期"
            class="fi-date"
          />
          <el-select v-model="filter.status" placeholder="全部状态" clearable class="fi-status">
            <el-option value="draft" label="草稿" />
            <el-option value="audited" label="已审核" />
            <el-option value="posted" label="已过账" />
          </el-select>
          <el-button type="primary" @click="doSearch" :loading="loading" class="fi-search-btn">
            <el-icon><Search /></el-icon>查询
          </el-button>
          <el-button @click="resetFilter">重置</el-button>
          <el-button text type="primary" @click="showAdvanced = !showAdvanced" class="fi-toggle-btn">
            <el-icon><component :is="showAdvanced ? ArrowUp : ArrowDown" /></el-icon>高级筛选
          </el-button>
        </div>

        <!-- 高级筛选行：低频筛选项 -->
        <div class="filter-row filter-row--adv" v-show="showAdvanced">
          <el-select v-model="filter.subjectCode" placeholder="选择科目" clearable filterable class="fi-subject">
            <el-option v-for="s in subjects" :key="s.code" :value="s.code" :label="`${s.code} ${s.name}`" />
          </el-select>
          <div class="amount-range">
            <el-input-number v-model="filter.amountMin" :min="0" :precision="2" controls-position="right" placeholder="最低金额" />
            <span class="filter-sep">—</span>
            <el-input-number v-model="filter.amountMax" :min="0" :precision="2" controls-position="right" placeholder="最高金额" />
          </div>
        </div>
      </div>

      <VoucherListTable
        ref="tableRef"
        :data="searchList"
        :loading="loading"
        :highlight-row="true"
        :highlight-row-id="highlightRowId"
        :show-entry-count="true"
        :show-amounts="true"
      >
        <template #suffix-columns>
          <el-table-column label="操作" width="200">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click="openVoucher(row)"><el-icon><View /></el-icon>查看</el-button>
              <el-button v-if="row.status==='draft'" size="small" link type="primary" @click="openVoucher(row)">编辑</el-button>
              <el-button v-if="row.status==='draft'" size="small" link @click="doAudit(row)">审核</el-button>
              <el-button v-if="row.status==='audited'" size="small" link type="primary" @click="doPost(row)">过账</el-button>
              <el-popconfirm v-if="row.status==='draft'" title="确定删除？" @confirm="doDelete(row)">
                <template #reference>
                  <el-button size="small" link type="danger"><el-icon><Delete /></el-icon></el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </template>
      </VoucherListTable>

      <el-empty v-if="!loading && searchList.length === 0" description="暂无凭证数据" />
    </div>

    <VoucherModal v-model:open="voucherModal.open" :voucher="voucherModal.voucher" :voucher-list="searchList"
      :readonly="!!voucherModal.voucher && voucherModal.voucher.status !== 'draft'"
      @saved="handleSaved" @deleted="handleDeleted" @navigate="voucherModal.voucher = $event"
      @switch-to-create="voucherModal.voucher = null" />
  </div>
</template>

<style scoped>
/* ================================================================
   DashboardView — 账簿金边卡片 + 暖白面板
   ================================================================ */
.workspace { display: flex; flex-direction: column; gap: 16px; }

/* ---- 统计卡片 ---- */
.stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }

@media (max-width: 1200px) { .stat-row { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px)  { .stat-row { grid-template-columns: 1fr; } }

.stat-card {
  background: var(--epp-paper);
  border-radius: 2px;
  padding: 18px 20px;
  display: flex; align-items: center; gap: 16px;
  position: relative; overflow: hidden;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.05);
  border: 1px solid var(--epp-line-light);
  transition: border-color 0.2s, box-shadow 0.25s, transform 0.15s;
  cursor: pointer; user-select: none;
}

.stat-card:hover {
  border-color: var(--epp-line);
  box-shadow: 0 2px 12px rgba(10, 30, 61, 0.07);
  transform: translateY(-1px);
}

.stat-card--active {
  border-color: var(--epp-accent);
  box-shadow: 0 0 0 1px var(--epp-accent), 0 2px 8px rgba(8, 145, 178, 0.15);
  background: rgba(8, 145, 178, 0.03);
}

/* 左侧金边 */
.stat-card__bar {
  position: absolute; left: 0; top: 10px; bottom: 10px; width: 3px;
  border-radius: 0 2px 2px 0;
}

.stat-card__icon {
  width: 46px; height: 46px; border-radius: 4px;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.stat-card__info { display: flex; flex-direction: column; gap: 2px; }

.stat-card__value {
  font-size: 26px; font-weight: 700; color: var(--epp-ink-text);
  line-height: 1.15; font-variant-numeric: tabular-nums;
}

.stat-card__label {
  font-size: 12px; color: var(--epp-ink-sub); letter-spacing: 0.5px;
}

/* ---- 内容面板 ---- */
.panel {
  background: var(--epp-paper);
  border-radius: 2px;
  border: 1px solid var(--epp-line-light);
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.04);
}

.panel__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 22px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-bottom: 1px solid var(--epp-line);
  gap: 10px; flex-wrap: wrap;
}

.panel__title {
  font-size: 14px; font-weight: 600; color: var(--epp-ink-text);
  display: flex; align-items: center; gap: 8px;
}

.panel__title .el-icon { color: var(--epp-accent); }

/* 筛选栏 */
.filter-bar {
  padding: 12px 22px;
  background: #f8fafc;
  border-bottom: 1px solid var(--epp-line-light);
  display: flex; flex-direction: column; gap: 10px;
}

.filter-row {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
}

.filter-row--adv {
  padding-top: 10px;
  border-top: 1px dashed var(--epp-line-light);
}

/* 主筛选项宽度 */
.fi-keyword { flex: 1 1 180px; min-width: 160px; max-width: 280px; }
.fi-date    { flex: 0 1 150px; min-width: 140px; }
.fi-status  { flex: 0 1 120px; min-width: 100px; }
.fi-search-btn { flex-shrink: 0; }
.fi-toggle-btn { flex-shrink: 0; white-space: nowrap; }

/* 高级筛选项宽度 */
.fi-subject { flex: 1 1 200px; min-width: 160px; max-width: 280px; }

.amount-range { display: flex; align-items: center; gap: 8px; }
.amount-range :deep(.el-input-number) { flex: 1; min-width: 130px; max-width: 180px; }
.filter-sep { color: var(--epp-ink-sub); font-size: 12px; flex-shrink: 0; }

/* 表格 — 蓝灰色系，与整体设计统一 */
.panel :deep(.el-table) {
  --el-table-border-color: var(--epp-line-light);
  --el-table-header-bg-color: #f1f5f9;
}

.panel :deep(.el-table__body tr:hover > td) {
  border-bottom-color: var(--epp-line-light) !important;
}

/* 当前行激活/选中 */
.panel :deep(.el-table__body tr.current-row) {
  background-color: #e8f0f8 !important;
}
.panel :deep(.el-table__body tr.current-row > td) {
  background-color: #e8f0f8 !important;
  border-bottom-color: var(--epp-line-light) !important;
}

.panel :deep(.el-table__body-wrapper) {
  border-bottom: 1px solid var(--epp-line-light);
}
</style>
