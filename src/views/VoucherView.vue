<script setup lang="ts">
// ponytail: 记账凭证管理页面 — 列表/审核/过账/打印/断号/导出
import { computed, onMounted, ref, shallowRef } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, TrendCharts, Printer, View, Download, Search } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import VoucherModal from '../components/VoucherModal.vue';
import VoucherListTable from '../components/VoucherListTable.vue';
import { handlePrintVoucher } from '../utils/printVoucher';
import { voucherTableCss, buildVoucherExportHtml } from '../utils/voucherTemplate';
import type { FinanceVoucher } from '../api';

const api = getFinanceApi();
const vouchers = shallowRef<FinanceVoucher[]>([]);
const loading = ref(false);
const modalOpen = ref(false);
const viewModalOpen = ref(false);
const editingVoucher = ref<FinanceVoucher | null>(null);
const viewingVoucher = ref<FinanceVoucher | null>(null);
const selectedVouchers = ref<FinanceVoucher[]>([]);
const selectedVoucherIds = computed(() => new Set(selectedVouchers.value.map(v => v.id)));
const exporting = ref(false);
const searchQuery = ref('');

/* 按关键字过滤凭证：摘要/凭证字/编号 */
const filteredVouchers = computed(() => {
  if (!searchQuery.value.trim()) return vouchers.value;
  const q = searchQuery.value.trim().toLowerCase();
  return vouchers.value.filter(v =>
    v.remark?.toLowerCase().includes(q) ||
    v.voucher_word?.toLowerCase().includes(q) ||
    String(v.voucher_no).includes(q)
  );
});

async function refresh() { loading.value = true; try { vouchers.value = await api.listVouchers(); } finally { loading.value = false; } }

onMounted(refresh);

function openCreate() { editingVoucher.value = null; modalOpen.value = true; }
function openEdit(v: FinanceVoucher) { editingVoucher.value = v; modalOpen.value = true; }
function openView(v: FinanceVoucher) { viewingVoucher.value = v; viewModalOpen.value = true; }
function onDeleted() { modalOpen.value = false; refresh(); }
function onViewed() { viewModalOpen.value = false; refresh(); }
function onSelectionChange(rows: FinanceVoucher[]) { selectedVouchers.value = rows; }

// ponytail: single voucher status action helper — 4 identical patterns collapsed to 1
async function voucherAction(v: FinanceVoucher, fn: (id: number) => any, msg: string) {
  const r = await fn(v.id);
  if (r?.__error) return ElMessage.error(r.__error);
  ElMessage.success(msg); refresh();
}
async function handleAudit(v: FinanceVoucher) { voucherAction(v, id => api.auditVoucher(id), '已审核'); }
async function handleUnaudit(v: FinanceVoucher) { voucherAction(v, id => api.unauditVoucher(id), '已取消审核'); }
async function handlePost(v: FinanceVoucher) { voucherAction(v, id => api.postVoucher(id), '已过账'); }
async function handleUnpost(v: FinanceVoucher) { voucherAction(v, id => api.unpostVoucher(id), '已反过账'); }
async function handleDelete(v: FinanceVoucher) {
  await ElMessageBox.confirm(`确定删除凭证 ${v.voucher_word}-${v.voucher_no} 号？`, '确认删除', { type: 'error', confirmButtonText: '删除', cancelButtonText: '取消' });
  await api.deleteVoucher(v.id);
  ElMessage.success('已删除'); refresh();
}

/* 整理断号 */
async function handleReorder() {
  const data = await api.bootstrap();
  const period = data.book.current_period;
  await ElMessageBox.confirm(
    `将按日期顺序重新排列「${period}」期间所有凭证字号（记/收/付/转）的编号，填补跳号空缺。是否继续？`,
    '整理断号',
    { confirmButtonText: '确定整理', cancelButtonText: '取消', type: 'warning' }
  );
  try {
    const result = await api.reorderAllVoucherNos(period);
    const summary = (result as Array<{ word: string; count: number }> || []).map(r => `${r.word}字×${r.count}`).join('、');
    ElMessage.success(`断号已整理：${summary || '无需整理'}`);
  } catch {
    await api.reorderVoucherNos({ voucherWord: '记', period });
    ElMessage.success('已整理记字凭证编号');
  }
  refresh();
}

/** 打印凭证 */
async function handlePrint(v: FinanceVoucher) {
  const warning = await handlePrintVoucher(v);
  if (warning) ElMessage.warning(warning);
}

/** 导出选中的凭证为 PNG（离屏渲染，不弹窗） */
async function handleExport() {
  if (selectedVouchers.value.length === 0) {
    ElMessage.warning('请先勾选需要导出的凭证');
    return;
  }
  exporting.value = true;

  // 动态加载 html2canvas（仅导出时加载，减小首屏体积）
  const { default: html2canvas } = await import('html2canvas');

  // 一次性注入共享样式
  const styleId = '__vch-export-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = voucherTableCss;
    document.head.appendChild(style);
  }

  let successCount = 0;
  let failCount = 0;

  for (const v of selectedVouchers.value) {
    const container = document.createElement('div');
    container.style.cssText = 'position:absolute;left:-9999px;top:0;';
    container.innerHTML = buildVoucherExportHtml(v);
    document.body.appendChild(container);

    await new Promise(r => setTimeout(r, 50));

    try {
      const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const dateStr = (v.voucher_date || '').replace(/[: ]/g, '-').substring(0, 10);
      const fileName = `${v.voucher_word}-${String(v.voucher_no).padStart(3, '0')}_${dateStr}.png`;

      if (window.electronAPI) {
        const result = await window.electronAPI.invoke('save-png', { dataUrl, fileName }) as { success?: boolean; error?: string };
        if (result?.success) successCount++;
        else { failCount++; console.error(`保存失败 [${fileName}]:`, result?.error); }
      } else {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = fileName; a.click();
        successCount++;
      }
    } catch (e) {
      console.error('导出凭证失败:', e);
      failCount++;
    } finally {
      document.body.removeChild(container);
    }
  }

  if (failCount === 0) {
    ElMessage.success(`已导出 ${successCount} 张凭证`);
  } else {
    ElMessage.warning(`导出完成：${successCount} 成功，${failCount} 失败`);
  }
  exporting.value = false;
}

/* 批量操作 */
async function handleBatchAudit() {
  const draftIds = selectedVouchers.value.filter(v => v.status === 'draft').map(v => v.id);
  if (draftIds.length === 0) { ElMessage.warning('选中的凭证中没有草稿状态，无法批量审核'); return; }
  try {
    await ElMessageBox.confirm(`确定批量审核 ${draftIds.length} 张草稿凭证？注意制单人与审核人不能为同一人。`, '批量审核', {
      confirmButtonText: '批量审核', cancelButtonText: '取消', type: 'warning',
    });
    const result = await api.batchAuditVouchers(draftIds);
    if (result.success > 0) ElMessage.success(`批量审核完成：成功 ${result.success} 张，失败 ${result.failed} 张`);
    else ElMessage.warning(`批量审核：全部 ${result.failed} 张失败（可能是制单人和审核人相同）`);
    refresh();
  } catch { /* 取消 */ }
}

async function handleBatchPost() {
  const auditedIds = selectedVouchers.value.filter(v => v.status === 'audited').map(v => v.id);
  if (auditedIds.length === 0) { ElMessage.warning('选中的凭证中没有已审核状态，无法批量过账'); return; }
  try {
    await ElMessageBox.confirm(`确定批量过账 ${auditedIds.length} 张已审核凭证？`, '批量过账', {
      confirmButtonText: '批量过账', cancelButtonText: '取消', type: 'warning',
    });
    const result = await api.batchPostVouchers(auditedIds);
    ElMessage.success(`批量过账完成：成功 ${result.success} 张，失败 ${result.failed} 张`);
    refresh();
  } catch { /* 取消 */ }
}

async function handleBatchDelete() {
  const draftIds = selectedVouchers.value.filter(v => v.status === 'draft').map(v => v.id);
  if (draftIds.length === 0) { ElMessage.warning('选中的凭证中没有草稿状态，无法批量删除'); return; }
  try {
    await ElMessageBox.confirm(`确定批量删除 ${draftIds.length} 张草稿凭证？此操作不可恢复！`, '批量删除', {
      confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'error',
    });
    let success = 0, failed = 0;
    for (const id of draftIds) {
      try { await api.deleteVoucher(id); success++; } catch { failed++; }
    }
    if (success > 0) ElMessage.success(`批量删除完成：成功 ${success} 张${failed > 0 ? `，${failed} 张失败` : ''}`);
    else ElMessage.warning('批量删除全部失败');
    refresh();
  } catch { /* 取消 */ }
}
</script>

<template>
  <div class="page-wrap">
    <div class="page-header">
      <div>
        <h2 class="ph-title">记账凭证</h2>
        <p class="ph-desc">管理所有记账凭证，支持审核、过账、查看、整理断号</p>
      </div>
      <div style="display:flex;gap:8px">
        <!-- 主操作：新增 -->
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新增凭证</el-button>
        <!-- 工作流：审核 → 过账 -->
        <el-button type="warning" :disabled="!selectedVouchers.some(v=>v.status==='draft')" @click="handleBatchAudit">
          <el-icon><TrendCharts /></el-icon>批量审核{{ selectedVouchers.filter(v=>v.status==='draft').length > 0 ? `(${selectedVouchers.filter(v=>v.status==='draft').length})` : '' }}
        </el-button>
        <el-button type="primary" :disabled="!selectedVouchers.some(v=>v.status==='audited')" @click="handleBatchPost">
          批量过账{{ selectedVouchers.filter(v=>v.status==='audited').length > 0 ? `(${selectedVouchers.filter(v=>v.status==='audited').length})` : '' }}
        </el-button>
        <!-- 批量操作：删除 -->
        <el-button type="danger" plain :disabled="!selectedVouchers.some(v=>v.status==='draft')" @click="handleBatchDelete">
          批量删除{{ selectedVouchers.filter(v=>v.status==='draft').length > 0 ? `(${selectedVouchers.filter(v=>v.status==='draft').length})` : '' }}
        </el-button>
        <!-- 工具：导出 -->
        <el-button type="success" :loading="exporting" :disabled="selectedVouchers.length === 0" @click="handleExport">
          <el-icon><Download /></el-icon>导出PNG{{ selectedVouchers.length > 0 ? `(${selectedVouchers.length})` : '' }}
        </el-button>
        <!-- 维护 -->
        <el-button @click="handleReorder"><el-icon><TrendCharts /></el-icon>整理断号</el-button>
        <el-button :loading="loading" @click="refresh"><el-icon><Refresh /></el-icon></el-button>
      </div>
    </div>

    <!-- 搜索过滤栏 -->
    <div class="vch-search-bar">
      <el-input
        v-model="searchQuery"
        placeholder="搜索凭证…（摘要 / 凭证字 / 编号）"
        clearable
        size="small"
        style="width:320px"
        :prefix-icon="Search"
      />
    </div>

    <div class="panel">
      <VoucherListTable :data="filteredVouchers" :loading="loading" :show-selection="true" :show-amounts="true" :selected-ids="selectedVoucherIds" @selection-change="onSelectionChange">
        <template #suffix-columns>
          <el-table-column label="操作" width="250">
            <template #default="{ row }">
              <el-button size="small" link type="primary" @click="openView(row)"><el-icon><View /></el-icon>查看</el-button>
              <el-button v-if="row.status==='draft'" size="small" link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button v-if="row.status==='draft'" size="small" link @click="handleAudit(row)">审核</el-button>
              <el-button v-if="row.status==='audited'" size="small" link type="danger" @click="handleUnaudit(row)">反审核</el-button>
              <el-button v-if="row.status==='audited'" size="small" link type="primary" @click="handlePost(row)">过账</el-button>
              <el-button v-if="row.status==='posted'" size="small" link type="danger" @click="handleUnpost(row)">反过账</el-button>
              <el-button size="small" link @click="handlePrint(row)"><el-icon><Printer /></el-icon>打印</el-button>
              <el-popconfirm v-if="row.status==='draft'" title="确定删除此凭证？" @confirm="handleDelete(row)">
                <template #reference>
                  <el-button size="small" link type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </el-table-column>
        </template>
      </VoucherListTable>
    </div>

    <!-- 编辑/新增弹窗 -->
    <VoucherModal
      v-model:open="modalOpen"
      :voucher="editingVoucher"
      :voucher-list="vouchers"
      @saved="refresh"
      @deleted="onDeleted"
      @navigate="editingVoucher = $event"
      @switch-to-create="editingVoucher = null"
    />

    <!-- 查看弹窗（只读 + 打印） -->
    <VoucherModal
      v-model:open="viewModalOpen"
      :voucher="viewingVoucher"
      :voucher-list="vouchers"
      :readonly="true"
      @saved="onViewed"
      @deleted="onViewed"
      @navigate="viewingVoucher = $event"
    />
  </div>
</template>

<style scoped>
/* ================================================================
   VoucherView — 凭证管理页，账簿金边+暖白面板
   ================================================================ */
.page-wrap { display: flex; flex-direction: column; gap: 16px; }

.page-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}

.page-header > div:last-child { flex-shrink: 0; }

.ph-title {
  margin: 0; font-size: 20px; font-weight: 700; color: var(--epp-ink-text);
}

.ph-desc {
  margin: 4px 0 0; font-size: 13px; color: var(--epp-ink-sub);
}

.panel {
  background: var(--epp-paper);
  border-radius: 2px;
  border: 1px solid var(--epp-line-light);
  padding: 0;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.04);
  overflow: hidden;
}

.vch-search-bar {
  display: flex; align-items: center;
  padding: 8px 0;
}

/* 内部表格适配 — 蓝灰色系，与整体设计统一 */
.panel :deep(.el-table) {
  --el-table-border-color: var(--epp-line-light);
  --el-table-header-bg-color: #f1f5f9;
}

.panel :deep(.el-table__body tr:hover > td) {
  border-bottom-color: var(--epp-line-light) !important;
}

.panel :deep(.el-table__body-wrapper) {
  border-bottom: 1px solid var(--epp-line-light);
}

/* 勾选行高亮 — 与科目列表颜色一致 */
.panel :deep(.el-table__body tr.selected-row > td.el-table__cell) {
  background: #e6eaef !important;
}

/* 按钮行间距 */
.page-header :deep(.el-button--success) {
  --el-button-bg-color: #10b981;
  --el-button-border-color: #10b981;
}

/* 确保禁用态按钮仍然可辨读 */
.page-header :deep(.el-button.is-disabled) {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
