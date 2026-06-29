<script setup lang="ts">
/**
 * OpeningBalanceView.vue — 财务初始余额页面
 *
 * 职责：设置各科目年初/期初余额，是账务初始化的第一步
 */
import { onMounted, ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { QuestionFilled, CircleCheckFilled, CircleCloseFilled, List, Upload, Download } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import type { FinanceSubject, OpeningBalance, FinanceVoucher } from '../api';

const api = getFinanceApi();

const loading = ref(false);
const saving = ref(false);
const subjects = ref<FinanceSubject[]>([]);
const openings = ref<OpeningBalance[]>([]);
const vouchers = ref<FinanceVoucher[]>([]);
const selectedYear = ref(new Date().getFullYear());

const period = computed(() => `${selectedYear.value}-01`);

/* ---- 分类标签卡 ---- */
const categoryTabs = [
  { key: 'asset',   label: '资产' },
  { key: 'liability', label: '负债' },
  { key: 'equity',  label: '权益' },
  { key: 'cost',    label: '成本' },
  { key: 'profit',  label: '损益' },
];
const activeCategory = ref('asset');

// 所有一级科目（用于编辑与保存）
const editableSubjects = computed(() =>
  subjects.value.filter(s => s.level === 1)
);

// 当前标签下的表格数据
const tableData = computed<FinanceSubject[]>(() => {
  if (activeCategory.value === 'profit') {
    return editableSubjects.value.filter(s => s.category === 'income' || s.category === 'expense');
  }
  return editableSubjects.value.filter(s => s.category === activeCategory.value);
});

// 年初余额编辑缓存: code → { balance }
const editMap = ref<Record<string, { balance: number }>>({});

function initEditMap() {
  const map: Record<string, { balance: number }> = {};
  editableSubjects.value.forEach(s => {
    const op = openings.value.find(o => o.subject_code === s.code);
    // 根据科目方向读取对应字段：借方方向取 debit，贷方方向取 credit
    const val = s.direction === 'debit'
      ? (op?.debit || 0)
      : (op?.credit || 0);
    map[s.code] = { balance: val };
  });
  editMap.value = map;
}

const yearOptions = computed(() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1];
});

const stats = computed(() => {
  let totalDebit = 0;
  let totalCredit = 0;
  editableSubjects.value.forEach(s => {
    const b = editMap.value[s.code]?.balance || 0;
    if (s.direction === 'debit') totalDebit += b;
    else totalCredit += b;
  });
  return { totalDebit, totalCredit, diff: totalDebit - totalCredit };
});

/* ---- 试算平衡检查 ---- */
const trialBalanceVisible = ref(false);

// 累计发生额：汇总当前期间已保存的凭证分录
const cumulativeAmounts = computed(() => {
  let debit = 0;
  let credit = 0;
  vouchers.value
    .filter(v => v.period === period.value && v.status !== 'draft')
    .forEach(v => {
      v.entries.forEach(e => {
        debit += Number(e.debit) || 0;
        credit += Number(e.credit) || 0;
      });
    });
  return { debit: Math.round(debit * 100) / 100, credit: Math.round(credit * 100) / 100 };
});

const trialBalanceData = computed(() => {
  const opening = stats.value;
  const cum = cumulativeAmounts.value;
  const totalDebit = opening.totalDebit + cum.debit;
  const totalCredit = opening.totalCredit + cum.credit;
  return {
    opening,
    cumulative: { ...cum, diff: cum.debit - cum.credit },
    total: { debit: totalDebit, credit: totalCredit, diff: totalDebit - totalCredit },
    isBalanced: (totalDebit - totalCredit) === 0,
  };
});

function openTrialBalance() {
  trialBalanceVisible.value = true;
}

function formatMoney(v: number): string {
  return v.toFixed(2);
}

async function loadData() {
  loading.value = true;
  try {
    const data = await api.bootstrap();
    subjects.value = data.subjects;
    vouchers.value = data.vouchers || [];
    openings.value = await api.getOpeningBalances(period.value);
    initEditMap();
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败');
  } finally {
    loading.value = false;
  }
}

async function handleSave() {
  // 先提交当前正在编辑的单元格
  commitEditSync();
  await saveAll();
}

async function saveAll() {
  saving.value = true;
  try {
    // 试算平衡检查
    const s = stats.value;
    if (Math.abs(s.diff) > 0.01) {
      await ElMessageBox.confirm(
        `期初余额借贷不平衡：借方合计 ${s.totalDebit.toFixed(2)}，贷方合计 ${s.totalCredit.toFixed(2)}，差额 ${s.diff.toFixed(2)}。\n\n仍要保存吗？`,
        '试算不平衡',
        { confirmButtonText: '仍要保存', cancelButtonText: '取消', type: 'warning' }
      );
    }
    const entries = editableSubjects.value.map(s => {
      const balance = editMap.value[s.code]?.balance || 0;
      return {
        subjectCode: s.code,
        subjectName: s.name,
        debit: s.direction === 'debit' ? balance : 0,
        credit: s.direction === 'credit' ? balance : 0,
        period: period.value,
      };
    });
    for (const e of entries) {
      if (e.debit !== 0 || e.credit !== 0) {
        await api.setOpeningBalance(e);
      }
    }
    openings.value = await api.getOpeningBalances(period.value);
    ElMessage.success(`${period.value} 期初余额保存成功`);
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

async function saveSingle(code: string) {
  saving.value = true;
  try {
    const s = editableSubjects.value.find(x => x.code === code);
    if (!s) return;
    const balance = editMap.value[code]?.balance || 0;
    if (balance !== 0) {
      await api.setOpeningBalance({
        subjectCode: s.code,
        subjectName: s.name,
        debit: s.direction === 'debit' ? balance : 0,
        credit: s.direction === 'credit' ? balance : 0,
        period: period.value,
      });
    }
    openings.value = await api.getOpeningBalances(period.value);
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败');
  } finally {
    saving.value = false;
  }
}

function onYearChange() {
  loadData();
}

/* ---- 单元格点击编辑 ---- */
const editingCell = ref<string | null>(null);  // 正在编辑的科目 code
const editRawValue = ref('');

function startEdit(code: string) {
  if (saving.value) return;
  const val = editMap.value[code]?.balance || 0;
  editRawValue.value = val === 0 ? '' : String(val);
  editingCell.value = code;
}

function onEditInput(e: Event) {
  editRawValue.value = (e.target as HTMLInputElement).value;
}

function commitEditSync() {
  // 仅同步写入 editMap，不调接口
  if (!editingCell.value) return;
  const code = editingCell.value;
  const v = parseFloat(editRawValue.value) || 0;
  const fixed = Math.round(v * 100) / 100;
  if (!editMap.value[code]) editMap.value[code] = { balance: 0 };
  editMap.value[code].balance = fixed;
  editingCell.value = null;
}

async function commitEdit() {
  // 先同步写入 editMap，再自动保存到后端
  if (!editingCell.value) return;
  const code = editingCell.value;
  commitEditSync();
  await saveSingle(code);
}

function cancelEdit() {
  editingCell.value = null;
}

function onEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') commitEdit();
  if (e.key === 'Escape') cancelEdit();
}

function directionLabel(dir: string): string {
  return dir === 'debit' ? '借' : '贷';
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    asset: '资产', liability: '负债', equity: '权益',
    cost: '成本', income: '收入', expense: '费用',
  };
  return map[cat] || cat;
}

// 表格汇总 —— 按当前标签类别单独计算
function getSummaries(param: any) {
  const { columns, data } = param;
  let totalDebit = 0;
  let totalCredit = 0;
  (data as FinanceSubject[]).forEach((row: FinanceSubject) => {
    const b = editMap.value[row.code]?.balance ?? 0;
    if (row.direction === 'debit') totalDebit += b;
    else totalCredit += b;
  });
  const sums: string[] = [];
  columns.forEach((_col: any, index: number) => {
    if (index === 0) sums[index] = '合计';
    else if (index === 4) sums[index] = totalDebit.toFixed(2);
    else sums[index] = '';
  });
  return sums;
}

onMounted(loadData);

/* ===== 导出期初余额为 CSV ===== */
function handleExport() {
  const rows: string[] = [];
  // BOM + 表头
  rows.push('\uFEFF科目编码,科目名称,类别,方向,年初余额');
  editableSubjects.value.forEach(s => {
    const balance = (editMap.value[s.code]?.balance || 0).toFixed(2);
    const cat = categoryLabel(s.category);
    const dir = directionLabel(s.direction);
    rows.push(`${s.code},${s.name},${cat},${dir},${balance}`);
  });
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `期初余额_${selectedYear.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  ElMessage.success('期初余额导出成功');
}

/* ===== 导入期初余额 CSV ===== */
const importFileInput = ref<HTMLInputElement | null>(null);

function triggerImport() {
  importFileInput.value?.click();
}

async function handleImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { ElMessage.warning('CSV 文件无有效数据'); return; }
    // 跳过表头
    const dataLines = lines[0].includes('科目编码') ? lines.slice(1) : lines;
    let updated = 0;
    let skipped = 0;
    for (const line of dataLines) {
      const cols = parseCSVLine(line);
      if (cols.length < 5) { skipped++; continue; }
      const code = cols[0].trim();
      const balance = parseFloat(cols[4]) || 0;
      const s = editableSubjects.value.find(x => x.code === code);
      if (!s) { skipped++; continue; }
      if (!editMap.value[code]) editMap.value[code] = { balance: 0 };
      editMap.value[code].balance = Math.round(balance * 100) / 100;
      updated++;
    }
    await saveAll();
    ElMessage.success(`导入完成：更新 ${updated} 条，跳过 ${skipped} 条`);
  } catch (e: any) {
    ElMessage.error('导入失败：' + (e.message || '文件格式错误'));
  } finally {
    input.value = ''; // 允许重复导入同一文件
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}
</script>

<template>
  <div class="op-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2 class="ph-title">财务初始余额</h2>
        <p class="ph-desc">设置各科目年初余额，作为后续报表计算的基础</p>
      </div>
      <div class="ph-actions">
        <div class="op-period-box">
          <span class="op-period-label">会计年度</span>
          <el-select v-model="selectedYear" size="small" style="width:110px" @change="onYearChange">
            <el-option v-for="y in yearOptions" :key="y" :label="String(y)" :value="y" />
          </el-select>
        </div>
        <el-button @click="openTrialBalance"><el-icon><List /></el-icon>试算平衡</el-button>
        <el-button @click="handleExport"><el-icon><Download /></el-icon>导出</el-button>
        <el-button @click="triggerImport"><el-icon><Upload /></el-icon>导入</el-button>
        <input ref="importFileInput" type="file" accept=".csv" style="display:none" @change="handleImportFile" />
        <el-button type="primary" @click="handleSave" :loading="saving">保存</el-button>
      </div>
    </div>

    <!-- 提示栏 -->
    <div class="op-notice">
      <p>提示：仅需设置<span class="op-notice-hl">资产类、负债类、权益类</span>科目的年初余额。损益类科目（收入/成本/费用）期初余额自动为零。</p>
      <p>每个科目的年初余额根据其<span class="op-notice-hl">方向</span>确定借方或贷方。借贷合计必须相等（<span :class="{ 'op-match': stats.diff === 0, 'op-mismatch': stats.diff !== 0 }">{{ stats.diff === 0 ? '已平衡' : '差额 ' + stats.diff.toFixed(2) }}</span>）。</p>
    </div>

    <!-- 数据表格 -->
    <div class="panel" v-loading="loading">
      <!-- 分类标签卡 -->
      <el-tabs v-model="activeCategory" class="op-tabs">
        <el-tab-pane
          v-for="tab in categoryTabs"
          :key="tab.key"
          :label="tab.label"
          :name="tab.key"
        >
          <el-table
            :data="tableData"
            border
            stripe
            size="small"
            :show-summary="true"
            :summary-method="getSummaries"
            style="width:100%"
          >
            <el-table-column label="科目编码" width="120" align="center">
              <template #default="{ row }">{{ row.code }}</template>
            </el-table-column>

            <el-table-column label="科目名称" min-width="240" align="center">
              <template #default="{ row }">{{ row.name }}</template>
            </el-table-column>

            <el-table-column label="类别" width="80" align="center">
              <template #default="{ row }">
                <el-tag size="small" disable-transitions :class="'op-tag--' + row.category">
                  {{ categoryLabel(row.category) }}
                </el-tag>
              </template>
            </el-table-column>

            <el-table-column label="方向" width="55" align="center">
              <template #default="{ row }">
                <span :class="'op-dir--' + row.direction">
                  {{ directionLabel(row.direction) }}
                </span>
              </template>
            </el-table-column>

            <el-table-column min-width="160" align="center">
              <template #header>
                <span style="display:inline-flex;align-items:center;gap:4px;">
                  年初余额
                  <el-tooltip placement="top" effect="dark" raw-content>
                    <template #content>
                      <div style="max-width:260px;line-height:1.6;">
                        若账套启用期间为 <b>2022年5期</b>，<br/>
                        年初余额即为 <b>2021年12期</b> 的期末余额。<br/>
                        系统将从数据库自动获取相关期数信息。
                      </div>
                    </template>
                    <el-icon :size="14" style="cursor:help;color:var(--epp-ink-sub);"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <template #default="{ row }">
                <!-- 损益类自动为零，不可编辑 -->
                <span v-if="row.category === 'cost' || row.category === 'income' || row.category === 'expense'" class="op-money">
                  0.00
                </span>
                <template v-else>
                  <input
                    v-if="editingCell === row.code"
                    class="op-edit-input"
                    :value="editRawValue"
                    @input="onEditInput"
                    @blur="commitEdit"
                    @keydown="onEditKeydown"
                    autofocus
                  />
                  <span v-else class="op-money op-cell-clickable" @click="startEdit(row.code)">
                    {{ (editMap[row.code]?.balance || 0).toFixed(2) }}
                  </span>
                </template>
              </template>
            </el-table-column>

            <!-- 空列：无标题无数据，自动填充剩余宽度 -->
            <el-table-column label="" align="center" class-name="op-col--filler" />
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 试算平衡检查弹窗 -->
    <el-dialog v-model="trialBalanceVisible" title="试算平衡检查" width="620px" top="8vh" :close-on-click-modal="false" destroy-on-close>
      <!-- 平衡状态 -->
      <div :class="['tb-status', trialBalanceData.isBalanced ? 'tb-status--ok' : 'tb-status--fail']">
        <el-icon :size="20">
          <CircleCheckFilled v-if="trialBalanceData.isBalanced" />
          <CircleCloseFilled v-else />
        </el-icon>
        <span v-if="trialBalanceData.isBalanced">恭喜您，您录入的财务初始余额平衡！</span>
        <span v-else>借贷不平衡，差额 {{ formatMoney(trialBalanceData.total.diff) }}，请检查录入数据。</span>
      </div>

      <!-- 汇总表 -->
      <table class="tb-table">
        <thead>
          <tr>
            <th style="width:180px;">项目</th>
            <th>借方金额</th>
            <th>贷方金额</th>
            <th>差额</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>期初余额（综合本位币）</td>
            <td class="tb-num">{{ formatMoney(trialBalanceData.opening.totalDebit) }}</td>
            <td class="tb-num">{{ formatMoney(trialBalanceData.opening.totalCredit) }}</td>
            <td class="tb-num" :class="{ 'tb-diff--err': trialBalanceData.opening.diff !== 0 }">
              {{ formatMoney(trialBalanceData.opening.diff) }}
            </td>
          </tr>
          <tr>
            <td>累计发生额（综合本位币）</td>
            <td class="tb-num">{{ formatMoney(trialBalanceData.cumulative.debit) }}</td>
            <td class="tb-num">{{ formatMoney(trialBalanceData.cumulative.credit) }}</td>
            <td class="tb-num" :class="{ 'tb-diff--err': trialBalanceData.cumulative.diff !== 0 }">
              {{ formatMoney(trialBalanceData.cumulative.diff) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td><strong>资产负债表</strong></td>
            <td class="tb-num"><strong>{{ formatMoney(trialBalanceData.total.debit) }}</strong></td>
            <td class="tb-num"><strong>{{ formatMoney(trialBalanceData.total.credit) }}</strong></td>
            <td class="tb-num">
              <strong
                :class="trialBalanceData.isBalanced ? 'tb-balanced' : 'tb-unbalanced'"
              >
                {{ trialBalanceData.isBalanced ? '平衡' : '不平衡' }}
              </strong>
            </td>
          </tr>
        </tfoot>
      </table>

      <template #footer>
        <el-button @click="trialBalanceVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ===== 页面整体 ===== */
.op-page {
  display: flex; flex-direction: column; gap: 16px;
}

/* ===== 页面标题栏 ===== */
.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
}
.ph-title {
  margin: 0; font-size: 20px; font-weight: 700; color: var(--epp-ink-text);
}
.ph-desc {
  margin: 4px 0 0; font-size: 13px; color: var(--epp-ink-sub);
}
.ph-actions {
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0;
}
.op-period-box { display: flex; align-items: center; gap: 6px; }
.op-period-label { font-size: 13px; color: var(--epp-ink-sub); font-weight: 500; }

/* ===== 提示栏 ===== */
.op-notice {
  padding: 11px 16px;
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 2px;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.04);
}
.op-notice p {
  margin: 0 0 4px; font-size: 12px; color: var(--epp-ink-sub); line-height: 1.6;
}
.op-notice p:last-child { margin: 0; }
.op-notice-hl { color: var(--epp-gold); font-weight: 600; }
.op-match { color: var(--epp-success); font-weight: 600; }
.op-mismatch { color: var(--epp-danger); font-weight: 600; }

/* ===== 面板 ===== */
.panel {
  background: var(--epp-paper);
  border-radius: 2px;
  border: 1px solid var(--epp-line-light);
  padding: 24px;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.04);
}

/* ===== 表格 ERP 账簿风格 ===== */
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

/* ===== 分类标签卡 ===== */
.op-tabs { margin-top: -4px; }
.op-tabs :deep(.el-tabs__nav-wrap::after) { height: 1px; }
.op-tabs :deep(.el-tabs__item) {
  font-size: 14px; font-weight: 500; color: var(--epp-ink-sub);
}
.op-tabs :deep(.el-tabs__item.is-active) {
  color: var(--epp-accent); font-weight: 600;
}
.op-tabs :deep(.el-tabs__active-bar) { background-color: var(--epp-accent); }

/* ===== 标签 —— 类别色 ===== */
.op-tag--asset {
  --el-tag-bg-color: #fdf6ec;
  --el-tag-text-color: #c0812b;
  --el-tag-border-color: #f5e4cc;
}
.op-tag--liability {
  --el-tag-bg-color: #eef8ee;
  --el-tag-text-color: #3c7a3c;
  --el-tag-border-color: #d2ebd2;
}
.op-tag--equity {
  --el-tag-bg-color: #e9eff7;
  --el-tag-text-color: #2d4980;
  --el-tag-border-color: #d3dff0;
}
.op-tag--cost {
  --el-tag-bg-color: #fdf2f8;
  --el-tag-text-color: #9b2c5e;
  --el-tag-border-color: #f5d0e2;
}
.op-tag--income {
  --el-tag-bg-color: #ecfdf5;
  --el-tag-text-color: #065f46;
  --el-tag-border-color: #a7f3d0;
}
.op-tag--expense {
  --el-tag-bg-color: #fef3c7;
  --el-tag-text-color: #92400e;
  --el-tag-border-color: #fde68a;
}

/* ===== 方向文字 ===== */
.op-dir--debit {
  color: var(--epp-gold);
  font-weight: 600;
}
.op-dir--credit {
  color: var(--epp-success);
  font-weight: 600;
}

/* ===== 金额文字 ===== */
.op-money {
  font-variant-numeric: tabular-nums;
  color: var(--epp-ink-text);
}

/* ===== 单元格点击编辑 ===== */
.op-cell-clickable {
  cursor: pointer;
  display: inline-block;
  width: 100%;
  min-height: 20px;
  padding: 2px 4px;
  border-radius: 2px;
  transition: background 0.15s;
}
.op-cell-clickable:hover {
  background: var(--epp-ledger);
}

.op-edit-input {
  width: 100%;
  height: 28px;
  border: 2px solid var(--epp-accent);
  border-radius: 2px;
  padding: 0 6px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--epp-ink-text);
  text-align: center;
  outline: none;
  box-sizing: border-box;
  background: #fff;
}
.op-edit-input:focus {
  border-color: var(--epp-accent-light);
  box-shadow: 0 0 0 2px rgba(8, 145, 178, 0.15);
}

/* ===== 合计行 ===== */
:deep(.el-table__footer-wrapper .cell) {
  font-weight: 700;
  font-size: 13px;
  color: var(--epp-ink-text);
}
:deep(.el-table__footer-wrapper) {
  border-top: 1px solid var(--epp-line);
  background: #ffffff;
}

/* ===== 空列占位 ===== */
::deep(.op-col--filler) {
  border-left: none !important;
}
::deep(.op-col--filler .cell) {
  padding: 0 !important;
}

/* ===== 试算平衡弹窗 ===== */
.tb-status {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px;
  border-radius: 4px;
  margin-bottom: 20px;
  font-size: 14px; font-weight: 600;
}
.tb-status--ok {
  background: #ecfdf5; color: #065f46;
  border: 1px solid #a7f3d0;
}
.tb-status--fail {
  background: #fef2f2; color: #991b1b;
  border: 1px solid #fecaca;
}

.tb-table {
  width: 100%; border-collapse: collapse;
  font-size: 13px; color: var(--epp-ink-text);
}
.tb-table th,
.tb-table td {
  border: 1px solid var(--epp-line-light);
  padding: 9px 12px;
  text-align: center;
}
.tb-table thead th {
  background: #f1f5f9; font-weight: 600; font-size: 12px;
  color: var(--epp-ink-sub);
}
.tb-table tbody td:first-child {
  text-align: left; font-weight: 500;
}
.tb-table tfoot td {
  background: #f8fafc;
}
.tb-num {
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
}
.tb-diff--err {
  color: var(--epp-danger); font-weight: 600;
}
.tb-balanced {
  color: var(--epp-success);
}
.tb-unbalanced {
  color: var(--epp-danger);
}
</style>
