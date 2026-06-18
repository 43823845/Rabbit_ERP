<script setup lang="ts">
/**
 * VoucherListTable.vue — 凭证列表表格组件
 *
 * 职责：凭证分页列表展示、支持搜索关键词高亮、金额分格显示、操作按钮列
 */
import { ref } from 'vue';
import type { FinanceVoucher } from '../api';

const tableRef = ref();

const props = withDefaults(defineProps<{
  data: FinanceVoucher[];
  loading?: boolean;
  /** 是否启用搜索高亮（默认 false） */
  highlightRow?: boolean;
  highlightRowId?: number | null;
  /** 是否显示金额列（借方/贷方合计） */
  showAmounts?: boolean;
  /** 是否显示分录数 */
  showEntryCount?: boolean;
  /** 是否显示选择框 */
  showSelection?: boolean;
}>(), {
  loading: false,
  highlightRow: false,
  highlightRowId: null,
  showAmounts: false,
  showEntryCount: false,
  showSelection: false,
});

const emit = defineEmits<{
  (e: 'row-click', row: FinanceVoucher): void;
  (e: 'selection-change', rows: FinanceVoucher[]): void;
}>();

defineSlots<{
  'prefix-columns'(): any;
  'suffix-columns'(): any;
}>();

/* 列表摘要：取第一条分录摘要 */
function entrySummary(v: FinanceVoucher): string {
  return v.entries?.[0]?.summary || '';
}
/* 列表科目：去重后用 / 连接 */
function entrySubjects(v: FinanceVoucher): string {
  const names = [...new Set(v.entries?.map(e => e.subjectName).filter(Boolean) || [])];
  return names.join(' / ') || '—';
}
function entryTotal(v: FinanceVoucher, side: 'debit' | 'credit'): number {
  return (v.entries || []).reduce((s, e) => s + Number(e[side] || 0), 0);
}

const statusColors: Record<string, string> = { draft: 'info', audited: 'warning', posted: 'success' };
const statusLabels: Record<string, string> = { draft: '草稿', audited: '已审核', posted: '已过账' };

function rowClassName({ row }: { row: FinanceVoucher }): string {
  if (props.highlightRow && row.id === props.highlightRowId) return 'search-highlight-row';
  return '';
}
</script>

<template>
  <div class="vlt-wrapper">
    <el-table
      ref="tableRef"
      :data="data"
      v-loading="loading"
      border stripe size="small"
      style="width:100%"
      :highlight-current-row="highlightRow"
      :row-class-name="rowClassName"
      @row-click="(row: FinanceVoucher) => emit('row-click', row)"
      @selection-change="(rows: FinanceVoucher[]) => emit('selection-change', rows)"
    >
      <!-- 选择框列 -->
      <el-table-column v-if="showSelection" type="selection" width="40" />

      <!-- 凭证字号 -->
      <el-table-column label="凭证字号" min-width="90" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="voucher-id-tag">{{ row.voucher_word }}-{{ String(row.voucher_no).padStart(3, '0') }}</span>
        </template>
      </el-table-column>

      <!-- 日期 -->
      <el-table-column prop="voucher_date" label="日期" min-width="105" sortable />

      <!-- 摘要 -->
      <el-table-column label="摘要" min-width="130" show-overflow-tooltip>
        <template #default="{ row }">{{ entrySummary(row) || '—' }}</template>
      </el-table-column>

      <!-- 会计科目 -->
      <el-table-column label="会计科目" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ entrySubjects(row) }}</template>
      </el-table-column>

      <!-- 备注 -->
      <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />

      <!-- 状态 -->
      <el-table-column label="状态" min-width="72" align="center">
        <template #default="{ row }">
          <el-tag :type="statusColors[row.status] as any" size="small">{{ statusLabels[row.status] }}</el-tag>
        </template>
      </el-table-column>

      <!-- 前缀插槽列 -->
      <slot name="prefix-columns" />

      <!-- 分录数（可选） -->
      <el-table-column v-if="showEntryCount" label="分录数" min-width="60" align="center">
        <template #default="{ row }">{{ row.entries?.length || 0 }}</template>
      </el-table-column>

      <!-- 借方合计（可选） -->
      <el-table-column v-if="showAmounts" label="借方合计" min-width="110" show-overflow-tooltip>
        <template #default="{ row }"><span class="money-text">{{ entryTotal(row, 'debit').toFixed(2) }}</span></template>
      </el-table-column>

      <!-- 贷方合计（可选） -->
      <el-table-column v-if="showAmounts" label="贷方合计" min-width="110" show-overflow-tooltip>
        <template #default="{ row }"><span class="money-text">{{ entryTotal(row, 'credit').toFixed(2) }}</span></template>
      </el-table-column>

      <!-- 记账人 -->
      <el-table-column prop="bookkeeper" label="记账人" min-width="70" show-overflow-tooltip>
        <template #default="{ row }">{{ row.bookkeeper || '—' }}</template>
      </el-table-column>

      <!-- 后缀插槽列 -->
      <slot name="suffix-columns" />
    </el-table>
  </div>
</template>

<style scoped>
.vlt-wrapper {
  overflow-x: auto;
}

/* 表头及数据居中 */
.vlt-wrapper :deep(.el-table th),
.vlt-wrapper :deep(.el-table td) {
  text-align: center;
}

.voucher-id-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e6f0f8;
  color: #1677aa;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}
/* 金额保持等宽字体 */
.money-text {
  font-variant-numeric: tabular-nums;
  font-family: "SF Mono", Consolas, monospace;
  white-space: nowrap;
}

/* 搜索高亮 */
::deep(.search-highlight-row) {
  background-color: #d9eaf5 !important;
}
::deep(.search-highlight-row td) {
  background-color: #d9eaf5 !important;
  border-color: #b8d4e5 !important;
}
</style>
