<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../../api';
import type { FinanceSubject, MultiColumnLedgerResult, MultiColumnLedgerRow } from '../../api';
import { buildTreeOrderedSubjects } from '../../utils/subjects';
import { downloadExcel } from '../../utils/excelExport';

const props = defineProps<{
  period: string;
  allSubjects: FinanceSubject[];
}>();

const api = getFinanceApi();
const mcLoading = ref(false);

interface MultiColumnChild {
  code: string;
  name: string;
}
interface MultiColumnSchemeItem {
  id: number;
  name: string;
  parent_code: string;
  parent_name: string;
  direction: string;
  children_json: string;
  updated_at: string;
}

const mcSchemes = ref<MultiColumnSchemeItem[]>([]);
const mcSchemeId = ref(0);
const mcParentCode = ref('');
const mcParentName = ref('');
const mcChildren = ref<MultiColumnChild[]>([]);
const mcSchemeName = ref('');
const mcShowDialog = ref(false);
const mcResult = ref<MultiColumnLedgerResult>({ columns: [], rows: [], periodSummary: [] });
const mcShowPeriodSummary = ref(false);

const currentYear = computed(() => props.period.slice(0, 4) || String(new Date().getFullYear()));
const mcColumns = computed(() => mcResult.value.columns);

const subjectTree = computed(() => buildTreeOrderedSubjects(props.allSubjects));

const mcParentCandidates = computed<{ code: string; name: string; children: MultiColumnChild[] }[]>(() => {
  const tree = subjectTree.value;
  const result: { code: string; name: string; children: MultiColumnChild[] }[] = [];
  function walk(nodes: any[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        result.push({
          code: n.code,
          name: n.name,
          children: n.children.map((c: any) => ({ code: c.code, name: c.name })),
        });
        walk(n.children);
      }
    }
  }
  walk(tree);
  return result;
});

function mcRowTotal(row: MultiColumnLedgerRow): number {
  return row.cells.reduce((sum, c) => sum + c.debit, 0);
}

async function loadMcSchemes() {
  try {
    mcSchemes.value = await api.listMultiColumnSchemes();
  } catch (e) {
    console.warn('[MultiColumnLedger] 加载多栏方案失败:', e);
    mcSchemes.value = [];
  }
}

async function selectMcScheme(id: number) {
  const s = mcSchemes.value.find(x => x.id === id);
  if (!s) return;
  mcSchemeId.value = s.id;
  mcParentCode.value = s.parent_code;
  mcParentName.value = s.parent_name;
  mcSchemeName.value = s.name;
  try {
    mcChildren.value = JSON.parse(s.children_json || '[]');
  } catch (e) {
    console.warn('[MultiColumnLedger] 解析子科目JSON失败:', e);
    mcChildren.value = [];
  }
  await queryMultiColumn();
}

function onMcParentChange() {
  const c = mcParentCandidates.value.find(p => p.code === mcParentCode.value);
  if (c) {
    mcParentName.value = c.name;
    mcChildren.value = [...c.children];
  } else {
    mcChildren.value = [];
  }
  mcSchemeId.value = 0;
  mcSchemeName.value = '';
}

function removeMcChild(idx: number) {
  mcChildren.value.splice(idx, 1);
  mcSchemeId.value = 0;
  mcSchemeName.value = '';
}

async function queryMultiColumn() {
  if (!mcParentCode.value || mcChildren.value.length === 0) return;
  mcLoading.value = true;
  try {
    mcResult.value = await api.getMultiColumnLedger({
      parentCode: mcParentCode.value,
      period: props.period,
      childrenJson: JSON.stringify(mcChildren.value),
    });
  } catch (_) {
    mcResult.value = { columns: [], rows: [], periodSummary: [] };
  } finally {
    mcLoading.value = false;
  }
}

function mcGetSummaries(param: { columns: any[]; data: any[] }) {
  const sums: (string | number)[] = [];
  const { columns, data } = param;
  columns.forEach((col, idx) => {
    if (idx === 0) { sums[0] = '合计'; return; }
    if (idx === 1 || idx === 2) { sums[idx] = ''; return; }
    const label = col.label || '';
    if (label.includes('借方')) {
      const colIdx = Math.floor((idx - 3) / 2);
      const val = data.reduce((sum: number, row: any) => sum + (row.cells?.[colIdx]?.debit || 0), 0);
      sums[idx] = val > 0 ? val.toFixed(2) : '';
    } else if (label.includes('贷方')) {
      const colIdx = Math.floor((idx - 3) / 2);
      const val = data.reduce((sum: number, row: any) => sum + (row.cells?.[colIdx]?.credit || 0), 0);
      sums[idx] = val > 0 ? val.toFixed(2) : '';
    } else if (label === '合计') {
      const val = data.reduce((sum: number, row: any) => sum + mcRowTotal(row), 0);
      sums[idx] = val.toFixed(2);
    } else {
      sums[idx] = '';
    }
  });
  return sums;
}

async function saveMcScheme() {
  if (!mcSchemeName.value.trim()) {
    mcSchemeName.value = mcParentName.value + '多栏账';
  }
  try {
    if (mcSchemeId.value > 0) {
      await api.updateMultiColumnScheme({
        id: mcSchemeId.value,
        name: mcSchemeName.value,
        parentCode: mcParentCode.value,
        parentName: mcParentName.value,
        childrenJson: JSON.stringify(mcChildren.value),
      });
    } else {
      const s = await api.createMultiColumnScheme({
        name: mcSchemeName.value,
        parentCode: mcParentCode.value,
        parentName: mcParentName.value,
        childrenJson: JSON.stringify(mcChildren.value),
      });
      mcSchemeId.value = s.id;
    }
    ElMessage.success('方案保存成功');
    await loadMcSchemes();
    mcShowDialog.value = false;
  } catch (e: any) {
    ElMessage.error(e.message || '保存失败');
  }
}

async function deleteMcScheme() {
  if (mcSchemeId.value <= 0) return;
  try {
    await api.deleteMultiColumnScheme(mcSchemeId.value);
    mcSchemeId.value = 0;
    mcSchemeName.value = '';
    ElMessage.success('方案已删除');
    await loadMcSchemes();
  } catch (e: any) {
    ElMessage.error(e.message || '删除失败');
  }
}

function exportCurrentBook() {
  if (mcResult.value.rows.length === 0) return;
  const cols = [
    { header: '日期', key: 'voucher_date', width: 12 },
    { header: '凭证字号', key: 'voucher_no', width: 14 }
  ];
  downloadExcel(cols, mcResult.value.rows, `多栏账_${mcParentCode.value}_${props.period}`, '多栏账');
}

watch(() => props.period, () => {
  queryMultiColumn();
});

onMounted(() => {
  loadMcSchemes();
});
</script>

<template>
  <div class="multi-column-ledger-panel">
    <div class="data-panel" v-loading="mcLoading">
      <!-- 工具栏 -->
      <div class="query-bar">
        <div class="query-left">
          <span class="toolbar-label">期间：{{ period }}</span>
          <span class="toolbar-label">上级科目</span>
          <el-select v-model="mcParentCode" size="small" style="width:220px" placeholder="选择上级科目" @change="onMcParentChange">
            <el-option v-for="p in mcParentCandidates" :key="p.code" :label="p.code + ' ' + p.name" :value="p.code" />
          </el-select>
          <span class="toolbar-label">方案</span>
          <el-select v-model="mcSchemeId" size="small" style="width:180px" placeholder="选择已保存方案" @change="selectMcScheme">
            <el-option v-for="s in mcSchemes" :key="s.id" :label="s.name" :value="s.id" />
          </el-select>
          <el-button size="small" @click="mcShowDialog = true; mcSchemeName = mcSchemeId > 0 ? mcSchemes.find(s => s.id === mcSchemeId)?.name || '' : ''">保存方案</el-button>
          <el-button v-if="mcSchemeId > 0" size="small" type="danger" plain @click="deleteMcScheme">删除方案</el-button>
        </div>
        <div class="query-right">
          <el-button size="small" type="primary" @click="queryMultiColumn" :disabled="!mcParentCode || mcChildren.length === 0">查询</el-button>
          <el-button size="small" @click="exportCurrentBook" :disabled="mcResult.rows.length === 0 || mcLoading">导出</el-button>
        </div>
      </div>

      <!-- 子科目列预览 -->
      <div v-if="mcChildren.length > 0" class="mc-column-tags">
        <span class="mc-tag-label">分析列：</span>
        <el-tag
          v-for="(child, idx) in mcChildren"
          :key="child.code"
          closable
          size="small"
          style="margin:2px 4px"
          @close="removeMcChild(idx)"
        >{{ child.code }} {{ child.name }}</el-tag>
      </div>

      <!-- 数据表格 -->
      <div v-if="mcResult.rows.length > 0" class="mc-table-wrap">
        <el-table :data="mcResult.rows" border stripe size="small" :height="mcShowPeriodSummary ? '60%' : '100%'" show-summary :summary-method="mcGetSummaries">
          <el-table-column prop="voucher_date" label="日期" min-width="90" align="center" fixed />
          <el-table-column label="凭证字号" min-width="110" align="center" fixed>
            <template #default="{ row }">{{ row.voucher_word }}-{{ row.voucher_no }}</template>
          </el-table-column>
          <el-table-column prop="summary" label="摘要" min-width="140" align="center" show-overflow-tooltip />
          <template v-for="(col, ci) in mcColumns" :key="col.code">
            <el-table-column :label="col.code + ' ' + col.name + ' 借方'" align="center" min-width="110">
              <template #default="{ row }">
                <span class="money">{{ row.cells[ci].debit > 0 ? row.cells[ci].debit.toFixed(2) : '' }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="col.code + ' ' + col.name + ' 贷方'" align="center" min-width="110">
              <template #default="{ row }">
                <span class="money">{{ row.cells[ci].credit > 0 ? row.cells[ci].credit.toFixed(2) : '' }}</span>
              </template>
            </el-table-column>
          </template>
          <el-table-column label="合计" align="center" min-width="100">
            <template #default="{ row }">
              <span class="money">{{ mcRowTotal(row).toFixed(2) }}</span>
            </template>
          </el-table-column>
        </el-table>

        <!-- 期间汇总切换 -->
        <div style="margin-top:8px; margin-bottom: 8px">
          <el-checkbox v-model="mcShowPeriodSummary" size="small">显示期间汇总</el-checkbox>
        </div>

        <el-table v-if="mcShowPeriodSummary && mcResult.periodSummary.length > 0" :data="mcResult.periodSummary" border size="small" max-height="160" class="mc-summary-table">
          <el-table-column prop="period" label="期间" min-width="90" align="center" fixed />
          <el-table-column label="凭证字号" min-width="110" align="center" fixed>
            <template #default>（小计）</template>
          </el-table-column>
          <el-table-column label="摘要" min-width="140" align="center">
            <template #default>本期间合计</template>
          </el-table-column>
          <template v-for="(col, ci) in mcColumns" :key="col.code">
            <el-table-column :label="col.code + ' ' + col.name + ' 借方'" align="center" min-width="110">
              <template #default="{ row }">
                <span class="money">{{ row.cells[ci].debit > 0 ? row.cells[ci].debit.toFixed(2) : '' }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="col.code + ' ' + col.name + ' 贷方'" align="center" min-width="110">
              <template #default="{ row }">
                <span class="money">{{ row.cells[ci].credit > 0 ? row.cells[ci].credit.toFixed(2) : '' }}</span>
              </template>
            </el-table-column>
          </template>
          <el-table-column label="合计" align="center" min-width="100">
            <template #default="{ row }">
              <span class="money">{{ mcRowTotal(row).toFixed(2) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-else-if="mcParentCode && mcChildren.length > 0" class="mc-empty">
        <p>暂无数据，请确认所选科目是否有凭证记录</p>
      </div>
      <div v-else class="mc-placeholder">
        <p>请选择上级科目，系统将自动展开其下级科目为多栏列</p>
      </div>
    </div>

    <!-- 保存方案弹窗 -->
    <el-dialog v-model="mcShowDialog" title="保存多栏账方案" width="400px" append-to-body>
      <el-form label-width="80px" size="small">
        <el-form-item label="方案名称">
          <el-input v-model="mcSchemeName" placeholder="如：管理费用多栏账" />
        </el-form-item>
        <el-form-item label="上级科目">
          <span>{{ mcParentCode }} {{ mcParentName }}</span>
        </el-form-item>
        <el-form-item label="分析列">
          <div v-for="c in mcChildren" :key="c.code" style="margin-bottom:2px">{{ c.code }} {{ c.name }}</div>
          <div v-if="mcChildren.length === 0" style="color:#909399">暂无</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="mcShowDialog = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveMcScheme">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.multi-column-ledger-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
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
.toolbar-label {
  font-size: 13px;
  font-weight: bold;
  color: var(--epp-ink);
}
.mc-column-tags {
  margin-bottom: 12px;
  padding: 8px 12px;
  background-color: var(--epp-ledger);
  border: 1px solid var(--epp-line-light);
  border-radius: 6px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
.mc-tag-label {
  font-size: 12px;
  font-weight: bold;
  color: var(--epp-ink-sub);
}
.mc-table-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mc-summary-table {
  flex-shrink: 0;
}
.money {
  font-family: 'Consolas', 'Fira Code', monospace;
  font-size: 13px;
  color: var(--epp-ink);
}
.mc-placeholder, .mc-empty {
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
</style>
