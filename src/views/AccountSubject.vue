<script setup lang="ts">
/**
 * AccountSubject.vue — 会计科目管理页面
 *
 * 职责：科目树形列表展示、搜索过滤、新增/编辑/删除、批量操作
 */
import { computed, onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, Plus, Edit, Delete, ArrowDown } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import type { FinanceSubject } from '../api';
import SubjectFormModal from '../components/SubjectFormModal.vue';
import { catLabel } from '../utils/subjects';

const api = getFinanceApi();

/** 科目树节点（FinanceSubject + 树形辅助字段） */
interface SubjectTreeNode extends FinanceSubject {
  _treeKey: string;
  children: SubjectTreeNode[];
}

/* ---- 状态 ---- */
const loading = ref(false);
const allSubjects = ref<FinanceSubject[]>([]);
const searchQuery = ref('');
const selectedRows = ref<FinanceSubject[]>([]);

const activeCategory = ref('all');
const filterOptions = ref({
  expandAll: false,
  hideDisabled: false,
});

/* ---- 新增/编辑弹窗 ---- */
const modalOpen = ref(false);
const editingSubject = ref<FinanceSubject | null>(null);

/* ---- 类别---- */
const categories = [
  { key: 'all', label: '全部' },
  { key: 'asset', label: '资产' },
  { key: 'liability', label: '负债' },
  { key: 'equity', label: '权益' },
  { key: 'cost', label: '成本' },
  { key: 'income', label: '损益' },
];

/** 类别标签颜色映射 */
const catTagMap: Record<string, string> = {
  asset: 'info', liability: 'warning', equity: 'success',
  cost: 'info', income: 'primary', expense: 'danger',
};
function catTag(c: string) { return catTagMap[c] || 'info'; }

/* ---- 树形 key ---- */
function treeKey(s: FinanceSubject) { return `${s.code}_${s.category}`; }

function buildTree(list: FinanceSubject[]): SubjectTreeNode[] {
  const map = new Map<string, SubjectTreeNode>();
  const roots: SubjectTreeNode[] = [];
  for (const s of list) { map.set(treeKey(s), { ...s, _treeKey: treeKey(s), children: [] }); }
  for (const s of list) {
    const node = map.get(treeKey(s))!;
    if (s.parent_code) {
      const pk = treeKey({ code: s.parent_code, category: s.category } as FinanceSubject);
      const p = map.get(pk);
      if (p) { p.children.push(node); continue; }
    }
    roots.push(node);
  }
  return roots;
}

function parentName(code: string) {
  const p = allSubjects.value.find(s => s.code === code);
  return p ? `${p.code} ${p.name}` : '';
}

/** 辅助核算类别显示名 */
const auxTypeLabel: Record<string, string> = {
  customer: '客户', supplier: '供应商', department: '部门',
  employee: '职员', inventory: '存货', project: '项目',
};
function auxName(auxType?: string) {
  if (!auxType) return '—';
  return auxTypeLabel[auxType] || auxType;
}

/* ---- 过滤 ---- */
const filteredTableData = computed(() => {
  let list = allSubjects.value;
  if (activeCategory.value !== 'all') {
    if (activeCategory.value === 'income') {
      list = list.filter(s => s.category === 'income' || s.category === 'expense');
    } else {
      list = list.filter(s => s.category === activeCategory.value);
    }
  }
  if (filterOptions.value.hideDisabled) list = list.filter(s => s.enabled !== 0);
  if (searchQuery.value.trim()) {
    const kw = searchQuery.value.trim().toLowerCase();
    list = list.filter(s => s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw));
  }
  return buildTree(list);
});

/* ---- 加载 ---- */
async function load() {
  loading.value = true;
  try { allSubjects.value = await api.listSubjects(); } finally { loading.value = false; }
}
onMounted(load);

function resetFilters() {
  searchQuery.value = '';
  activeCategory.value = 'all';
  filterOptions.value.expandAll = false;
  filterOptions.value.hideDisabled = false;
}

/* ---- 操作 ---- */
function isBuiltin(row: FinanceSubject) { return row.level === 1 && row.builtin === 1; }

/** 表格引用（用于程序化展开/收起） */
const subjectTableRef = ref();

/** 追踪已展开行（默认全部折叠） */
const expandedKeys = ref<Set<string>>(new Set());

/** 展开所有（"展开所有级次" 复选框用） */
function setExpandAll(val: boolean) {
  if (!subjectTableRef.value) return;
  const keys = new Set<string>();
  function walk(nodes: SubjectTreeNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        if (val) {
          keys.add(n._treeKey);
          subjectTableRef.value.toggleRowExpansion(n, true);
        } else {
          subjectTableRef.value.toggleRowExpansion(n, false);
        }
        walk(n.children);
      }
    }
  }
  walk(filteredTableData.value);
  expandedKeys.value = keys;
}

/** 点击名称列切换展开/收起 */
function toggleNameExpand(row: SubjectTreeNode) {
  if (!row.children || row.children.length === 0) return;
  const wasExpanded = expandedKeys.value.has(row._treeKey);
  subjectTableRef.value?.toggleRowExpansion(row, !wasExpanded);
  const newSet = new Set(expandedKeys.value);
  if (wasExpanded) {
    newSet.delete(row._treeKey);
  } else {
    newSet.add(row._treeKey);
  }
  expandedKeys.value = newSet;
}

/** 行样式：禁用灰化 + 父级有子数据高亮 */
function tableRowClassName({ row }: { row: SubjectTreeNode }) {
  if (row.enabled === 0) return 'row-disabled';
  if (row.children && row.children.length > 0 && !expandedKeys.value.has(row._treeKey)) return 'row-has-children';
  return '';
}

function openCreate() { editingSubject.value = null; modalOpen.value = true; }

function openCreateChild(parent: FinanceSubject) {
  editingSubject.value = null;
  (window as Window & { __prefillParent?: FinanceSubject }).__prefillParent = parent;
  modalOpen.value = true;
}

function openEdit(row: FinanceSubject) { editingSubject.value = row; modalOpen.value = true; }

async function handleDelete(row: FinanceSubject) {
  if (isBuiltin(row)) { ElMessage.warning('内置科目不允许删除'); return; }
  try {
    await ElMessageBox.confirm(`确定删除「${row.code} ${row.name}」？`, '删除确认', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    await api.deleteSubject(row.code);
    ElMessage.success('已删除');
    await load();
  } catch (e: unknown) {
    if (e !== 'cancel') ElMessage.error((e as Error)?.message || '删除失败');
  }
}

async function toggleEnabled(row: FinanceSubject) {
  try {
    const v = row.enabled === 0 ? 1 : 0;
    await api.updateSubject({
      code: row.code, name: row.name, direction: row.direction,
      category: row.category, enabled: v, parentCode: row.parent_code, level: row.level,
      auxType: row.auxType || '', isCash: row.isCash ?? 0,
    });
    ElMessage.success(v ? '已启用' : '已禁用');
    await load();
  } catch (e: unknown) { ElMessage.error((e as Error)?.message || '操作失败'); }
}

async function handleRenumber() {
  try { await api.renumberSubjects(); ElMessage.success('编号已整理'); await load(); }
  catch (e: unknown) { ElMessage.error((e as Error)?.message || '整理失败'); }
}

function onSaved() { modalOpen.value = false; load(); }

/* ---- 导入/导出 ---- */
const importFileRef = ref<HTMLInputElement | null>(null);

function handleExport() {
  const headers = ['编码', '名称', '方向', '类别', '级别', '父编码', '启用', '辅助核算', '现金科目'];
  const catMap: Record<string, string> = { asset: '资产', liability: '负债', equity: '权益', cost: '成本', income: '收入', expense: '费用' };
  const rows = allSubjects.value.map(s => [
    s.code,
    s.name,
    s.direction === 'debit' ? '借' : '贷',
    catMap[s.category] || s.category,
    String(s.level),
    s.parent_code || '',
    String(s.enabled ?? 1),
    s.auxType || '',
    String(s.isCash ?? 0),
  ]);
  const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  a.href = url; a.download = `会计科目_${month}_${time}.csv`;
  a.click(); URL.revokeObjectURL(url);
  ElMessage.success('导出成功');
}

function triggerImport() { importFileRef.value?.click(); }

async function handleImportFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const catRev: Record<string, string> = { '资产': 'asset', '负债': 'liability', '权益': 'equity', '成本': 'cost', '收入': 'income', '费用': 'expense' };
  try {
    const text = await file.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) { ElMessage.warning('CSV 无数据行'); return; }
    // 跳过表头
    const dataLines = lines.slice(1).filter(l => l.trim());
    let created = 0, skipped = 0;
    for (const line of dataLines) {
      const cols = parseCSVLine(line);
      if (cols.length < 4) continue;
      const [code, name, dir, cat, level, parentCode, enabled, auxType, isCash] = cols;
      const exists = allSubjects.value.find(s => s.code === code);
      if (exists) { skipped++; continue; }
      try {
        await api.createSubject({
          code: code.trim(),
          name: name.trim(),
          direction: dir.trim() === '借' ? 'debit' : 'credit',
          category: catRev[cat.trim()] || cat.trim(),
          level: parseInt(level) || 2,
          parentCode: parentCode?.trim() || '',
          auxType: auxType?.trim() || '',
          isCash: parseInt(isCash) || 0,
        });
        created++;
      } catch { skipped++; }
    }
    ElMessage.success(`导入完成：新增 ${created} 条，跳过 ${skipped} 条`);
    await load();
  } catch (e: unknown) { ElMessage.error('导入失败：' + ((e as Error)?.message || '文件格式错误')); }
  // 重置 input 以便重复导入同一文件
  if (importFileRef.value) importFileRef.value.value = '';
}

/** 简易 CSV 行解析（支持引号包裹的字段） */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '', inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
}

/* ---- 多选 ---- */
function handleSelectionChange(rows: FinanceSubject[]) { selectedRows.value = rows; }

async function handleBatchDelete() {
  if (selectedRows.value.length === 0) { ElMessage.warning('请先选择科目'); return; }
  try {
    await ElMessageBox.confirm(`确定删除 ${selectedRows.value.length} 条科目？`, '批量删除', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    let n = 0;
    for (const r of selectedRows.value) {
      try { await api.deleteSubject(r.code); n++; } catch { /* skip */ }
    }
    ElMessage.success(`已删除 ${n} 条`);
    selectedRows.value = [];
    await load();
  } catch (e: unknown) { if (e !== 'cancel') ElMessage.error((e as Error)?.message || '操作失败'); }
}

async function batchSetEnabled(enabled: boolean) {
  if (selectedRows.value.length === 0) { ElMessage.warning('请先选择科目'); return; }
  let n = 0;
  for (const r of selectedRows.value) {
    try {
      await api.updateSubject({
        code: r.code, name: r.name, direction: r.direction,
        category: r.category, enabled: enabled ? 1 : 0, parentCode: r.parent_code, level: r.level,
      });
      n++;
    } catch { /* skip */ }
  }
  ElMessage.success(`${enabled ? '启用' : '禁用'} ${n} 条`);
  await load();
}

</script>

<template>
  <div class="account-subject-container">
    <!-- 类别标签卡 -->
    <div class="category-tabs">
      <div
        v-for="tab in categories"
        :key="tab.key"
        :class="['tab-item', { active: activeCategory === tab.key }]"
        @click="activeCategory = tab.key"
      >
        {{ tab.label }}
      </div>
    </div>

    <!-- 过滤与操作栏 -->
    <div class="filter-action-bar">
      <div class="left-filters">
        <el-input
          v-model="searchQuery"
          placeholder="搜索编码/名称"
          class="search-input"
          clearable
          size="small"
        >
          <template #append>
            <el-button :icon="Search" size="small" />
          </template>
        </el-input>

        <el-checkbox v-model="filterOptions.expandAll" size="small" @change="setExpandAll">展开所有级次</el-checkbox>
        <el-checkbox v-model="filterOptions.hideDisabled" size="small">隐藏禁用科目</el-checkbox>

        <el-button :icon="Refresh" link size="small" @click="resetFilters">刷新</el-button>
      </div>

      <div class="right-actions">
        <el-button type="primary" size="small" @click="openCreate"><el-icon><Plus /></el-icon>新增</el-button>
        <input ref="importFileRef" type="file" accept=".csv" style="display:none" @change="handleImportFile" />
        <el-button size="small" @click="triggerImport"><el-icon style="margin-right:4px"><Plus /></el-icon>导入</el-button>
        <el-button size="small" @click="handleExport"><el-icon style="margin-right:4px"><Plus /></el-icon>导出</el-button>
        <el-button size="small" type="danger" plain :disabled="selectedRows.length === 0" @click="handleBatchDelete">
          <el-icon><Delete /></el-icon>删除
        </el-button>
        <el-button size="small" @click="handleRenumber">明细科目转辅助</el-button>
        <el-dropdown trigger="click">
          <el-button size="small">
            批量操作 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="batchSetEnabled(true)">批量启用</el-dropdown-item>
              <el-dropdown-item @click="batchSetEnabled(false)">批量禁用</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 表格 -->
    <div class="table-wrapper">
      <el-table
        ref="subjectTableRef"
        :data="filteredTableData"
        v-loading="loading"
        style="width: 100%"
        border
        size="small"
        row-key="_treeKey"
        :tree-props="{ children: 'children', hasChildren: (row: SubjectTreeNode) => (row.children || []).length > 0 }"
        @selection-change="handleSelectionChange"
        :row-class-name="tableRowClassName"
        :header-cell-style="{ backgroundColor: '#f5f7fa', color: '#303133', fontWeight: '500' }"
        max-height="calc(100vh - 300px)"
      >
        <el-table-column type="selection" width="40" align="center" />

        <el-table-column label="操作" width="78" align="center">
          <template #default="{ row }">
            <div class="row-operations">
              <el-button
                v-if="row.level === 1"
                :icon="Plus"
                link
                title="新增下级"
                @click="openCreateChild(row)"
              />
              <el-button
                :icon="Edit"
                link
                title="编辑"
                @click="openEdit(row)"
              />
              <el-button
                :icon="Delete"
                link
                type="danger"
                title="删除"
                @click="handleDelete(row)"
              />
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="code" label="编码" min-width="75" align="center" sortable show-overflow-tooltip />

        <el-table-column prop="name" label="名称" min-width="150" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <div
              :class="{ 'name-cell-expand': row.children && row.children.length > 0 }"
              @click.stop="toggleNameExpand(row)"
            >
              <span
                v-if="row.children && row.children.length > 0"
                class="name-expand-icon"
                :class="{ expanded: expandedKeys.has(row._treeKey) }"
              >▸</span>
              <span class="name-expand-indent" v-else></span>
              <span :style="{ fontWeight: row.level === 1 ? '600' : '400' }">{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="类别" width="72" align="center">
          <template #default="{ row }">
            <el-tag :type="catTag(row.category)" size="small" disable-transitions>
              {{ catLabel(row.category) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="余额方向" width="58" align="center">
          <template #default="{ row }">
            <span :style="{ color: row.direction === 'debit' ? '#e6a23c' : '#67c23a', fontWeight: '500' }">
              {{ row.direction === 'debit' ? '借' : '贷' }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="级别" width="55" align="center">
          <template #default="{ row }">
            <el-tag :type="row.level === 1 ? 'primary' : 'success'" size="small" disable-transitions>
              {{ row.level }}级
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column label="父科目" min-width="100" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.parent_code" style="color:#909399;font-size:12px">{{ parentName(row.parent_code) }}</span>
            <span v-else style="color:#ccc;font-size:12px">—</span>
          </template>
        </el-table-column>

        <el-table-column label="辅助核算" min-width="90" align="center" show-overflow-tooltip>
          <template #default="{ row }">
            <span :style="{ color: row.auxType ? 'var(--epp-ink-sub)' : '#ccc' }">
              {{ auxName(row.auxType) }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="现金科目" width="65" align="center">
          <template #default="{ row }">
            <span v-if="row.isCash === 1" class="check-mark">√</span>
            <span v-else style="color:#ccc">—</span>
          </template>
        </el-table-column>

        <el-table-column label="启用状态" width="70" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled !== 0"
              size="small"
              @change="toggleEnabled(row)"
            />
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 底部状态 -->
    <div class="table-footer">
      <span>
        显示 <strong class="selected-count">{{ filteredTableData.length }}</strong>
        条 / 共 <strong>{{ allSubjects.length }}</strong> 条
        <template v-if="selectedRows.length > 0">
          &nbsp;| 已选 <strong class="selected-count">{{ selectedRows.length }}</strong> 条
        </template>
      </span>
    </div>

    <!-- 新增/编辑弹窗 -->
    <SubjectFormModal v-model:open="modalOpen" :subject="editingSubject" @saved="onSaved" />
  </div>
</template>

<style scoped>
/* ================================================================
   AccountSubject — 会计科目，金蝶精斗云类别标签+账簿表
   ================================================================ */
.account-subject-container {
  background: var(--epp-paper);
  padding: 18px 22px;
  border-radius: 2px;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--epp-line-light);
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.04);
}

/* ---- 顶部类别页签（精斗云风格） ---- */
.category-tabs {
  display: flex;
  border-bottom: 1px solid var(--epp-line);
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.tab-item {
  padding: 10px 20px;
  font-size: 13px;
  color: var(--epp-ink-sub);
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
  font-weight: 500;
}

.tab-item:hover {
  color: var(--epp-gold);
}

.tab-item.active {
  color: var(--epp-ink);
  font-weight: 700;
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--epp-gold);
}

/* ---- 过滤与按钮面板 ---- */
.filter-action-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
  padding: 12px 16px;
  background: #f8fafc;
  border-radius: 2px;
  border: 1px solid var(--epp-line-light);
}

.left-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  flex: 1 1 auto;
  min-width: 0;
}

.search-input { width: 200px; flex-shrink: 0; }

.right-actions {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex-shrink: 0;
}

@media (max-width: 900px) {
  .filter-action-bar { flex-direction: column; align-items: stretch; }
  .left-filters { flex-direction: column; align-items: stretch; }
  .right-actions { justify-content: flex-end; }
  .search-input { width: 100%; }
}

/* ---- 表格 ---- */
.table-wrapper {
  margin-bottom: 12px;
  overflow-x: auto;
}

.table-wrapper :deep(.el-table__inner-wrapper) { overflow-x: auto; }

.table-wrapper :deep(.el-table) {
  --el-table-border-color: var(--epp-line-light);
  --el-table-header-bg-color: #f1f5f9;
  --el-table-tr-bg-color: #fafbfc;
  --el-table-row-hover-bg-color: #f3f6f9;
}

/* 默认行底色 */
.table-wrapper :deep(.el-table__body tr) {
  background-color: #fafbfc;
}
.table-wrapper :deep(.el-table__body tr:hover > td) {
  background-color: #f3f6f9 !important;
  border-bottom-color: var(--epp-line-light) !important;
}

/* 当前行激活/选中 */
.table-wrapper :deep(.el-table__body tr.current-row) {
  background-color: #e8f0f8 !important;
}
.table-wrapper :deep(.el-table__body tr.current-row > td) {
  background-color: #e8f0f8 !important;
  border-bottom-color: var(--epp-line-light) !important;
}

.table-wrapper :deep(.el-table th) { font-size: 12px; color: var(--epp-ink-sub); }
.table-wrapper :deep(.el-table .cell) { font-size: 12px; }
.table-wrapper :deep(.el-table__row--level-0) { background: var(--epp-paper); }

/* 禁用科目行 — 琥珀色警告风格 */
.table-wrapper :deep(.row-disabled) {
  background: #fffbeb !important;
}
.table-wrapper :deep(.row-disabled td) {
  color: var(--epp-ink-sub) !important;
}

/* ---- 行操作 ---- */
/* 隐藏操作列（第2个td）中的树形折叠图标和缩进占位 */
.table-wrapper :deep(.el-table__body-wrapper td:nth-child(2) .el-table__expand-icon),
.table-wrapper :deep(.el-table__body-wrapper td:nth-child(2) .el-table__indent),
.table-wrapper :deep(.el-table__body-wrapper td:nth-child(2) .el-table__placeholder) {
  display: none !important;
}
/* 清除树形行在操作列中产生的额外 padding */
.table-wrapper :deep(.el-table__body-wrapper td:nth-child(2) .cell) {
  padding-left: 4px !important;
  padding-right: 4px !important;
}

/* 名称列整行可点击 */
.name-cell-expand {
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
}

/* 名称列自定义展开箭头 */
.name-expand-icon {
  display: inline-block;
  width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  font-size: 11px;
  color: var(--epp-ink-sub);
  transition: transform 0.2s, color 0.2s;
  margin-right: 6px;
  vertical-align: middle;
}
.name-expand-icon.expanded { transform: rotate(90deg); color: var(--epp-gold); }

/* 无子科目的占位，保持名称左对齐 */
.name-expand-indent {
  display: inline-block; width: 16px; margin-right: 6px;
  vertical-align: middle;
}

/* 有子数据且未展开 → 行背景微暖提示 */
.table-wrapper :deep(.row-has-children) {
  background: #faf7ee !important;
}
.table-wrapper :deep(.row-has-children:hover) {
  background: #f7f2e0 !important;
}

.row-operations {
  display: flex; justify-content: center; align-items: center; gap: 4px;
  height: 100%; min-height: 28px;
}

.row-operations .el-button {
  padding: 0; margin: 0; font-size: 16px; color: var(--epp-ink-sub);
}

.row-operations .el-button:hover { color: var(--epp-gold); }
.row-operations .el-button--danger:hover { color: var(--epp-danger); }

.check-mark {
  color: var(--epp-success);
  font-weight: bold;
  font-size: 16px;
}

/* ---- 底部状态 ---- */
.table-footer {
  font-size: 13px;
  color: var(--epp-ink-sub);
  padding-top: 10px;
  border-top: 1px solid var(--epp-line-light);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.selected-count {
  color: var(--epp-ink);
  font-weight: 600;
}
</style>
