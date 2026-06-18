<script setup lang="ts">
/**
 * LedgerView.vue — 账簿查询页面
 *
 * 职责：明细账、总账、科目余额表、多栏账、数量金额明细账/总账、核算项目余额表/明细账/组合表
 */
import { onMounted, ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../api';
import type { SubjectBalance, FinanceSubject, MultiColumnLedgerResult, MultiColumnLedgerRow,
  QuantityDetailLedgerRow, QuantityGeneralLedgerRow,
  AuxProjectBalanceRow, AuxProjectDetailRow, AuxProjectType, AuxProjectValue,
  DetailLedgerResult } from '../api';
import { buildTreeOrderedSubjects } from '../utils/subjects';

/* 科目树节点（带 children） */
interface SubjectTreeNode extends FinanceSubject {
  children: SubjectTreeNode[];
}

const api = getFinanceApi();
const period = ref('2026-06');
const loading = ref(false);

/* ========== 科目树（所有账簿共用） ========== */
const allSubjects = ref<FinanceSubject[]>([]);
const subjectExpandedKeys = ref<Set<string>>(new Set());

/* 账簿导航 */
type BookCategory = 'main' | 'aux';

interface BookItem {
  key: string;
  label: string;
}

/* 账簿图标（SVG 极简符号） */
const bookIcons: Record<string, string> = {
  detail:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
  general:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  balance:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  multiColumn:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>`,
  qtyDetail:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><circle cx="16" cy="16" r="2"/></svg>`,
  qtyGeneral:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="16" cy="12" r="2"/></svg>`,
  projectBalance: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="10" cy="15" r="2"/></svg>`,
  projectDetail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><circle cx="10" cy="16" r="2"/></svg>`,
  projectCombo:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
};

const bookGroups: Record<BookCategory, { title: string; items: BookItem[] }> = {
  main: {
    title: '主账簿',
    items: [
      { key: 'detail',       label: '明细账' },
      { key: 'general',      label: '总账' },
      { key: 'balance',      label: '科目余额表' },
      { key: 'multiColumn',  label: '多栏账' },
    ],
  },
  aux: {
    title: '辅助账簿',
    items: [
      { key: 'qtyDetail',      label: '数量金额明细账' },
      { key: 'qtyGeneral',     label: '数量金额总账' },
      { key: 'projectBalance', label: '核算项目余额表' },
      { key: 'projectDetail',  label: '核算项目明细账' },
      { key: 'projectCombo',   label: '核算项目组合表' },
    ],
  },
};

const activeCategory = ref<BookCategory>('main');
const activeBook = ref('detail');

/* 当前选中的账簿信息 */
const currentBookLabel = computed(() => {
  const items = [...bookGroups.main.items, ...bookGroups.aux.items];
  return items.find(i => i.key === activeBook.value)?.label || '明细账';
});

/* 科目余额表数据 */
interface BalanceDisplayRow extends SubjectBalance {
  directionLabel: string;
  openingBalance: number;
  endingBalance: number;
}
const balanceListRaw = ref<SubjectBalance[]>([]);
const balanceOpeningMap = ref<Map<string, { debit: number; credit: number }>>(new Map());
const balanceLevel = ref('all');        // '1' | 'all'
const balanceHideZero = ref(false);     // 隐藏余额为0的科目

const balanceList = computed<BalanceDisplayRow[]>(() => {
  let list = balanceListRaw.value.map(r => {
    const subj = allSubjects.value.find(s => s.code === r.code);
    const dir = subj?.direction === 'credit' ? '贷' : '借';
    const opening = balanceOpeningMap.value.get(r.code);
    const openingBal = opening
      ? (dir === '借' ? opening.debit - opening.credit : opening.credit - opening.debit)
      : 0;
    return {
      ...r,
      directionLabel: dir,
      openingBalance: openingBal,
      endingBalance: subj?.direction === 'debit'
        ? openingBal + r.debitAmount - r.creditAmount
        : openingBal + r.creditAmount - r.debitAmount,
    };
  });
  // 级次过滤
  if (balanceLevel.value === '1') {
    list = list.filter(r => {
      const subj = allSubjects.value.find(s => s.code === r.code);
      return subj?.level === 1;
    });
  }
  // 隐藏零余额
  if (balanceHideZero.value) {
    list = list.filter(r => Math.abs(r.endingBalance) > 0.001 || Math.abs(r.debitAmount) > 0.001 || Math.abs(r.creditAmount) > 0.001 || Math.abs(r.openingBalance) > 0.001);
  }
  return list;
});

const balanceSummary = computed(() => {
  let openingDebit = 0, openingCredit = 0;
  let debitAmt = 0, creditAmt = 0, endingDebit = 0, endingCredit = 0;
  balanceList.value.forEach(r => {
    const subj = allSubjects.value.find(s => s.code === r.code);
    const isDebit = subj?.direction !== 'credit';
    openingDebit += isDebit ? Math.max(0, r.openingBalance) : 0;
    openingCredit += isDebit ? 0 : Math.max(0, r.openingBalance);
    debitAmt += r.debitAmount;
    creditAmt += r.creditAmount;
    endingDebit += isDebit ? Math.max(0, r.endingBalance) : 0;
    endingCredit += isDebit ? 0 : Math.abs(Math.min(0, r.endingBalance));
  });
  return { openingDebit, openingCredit, debitAmt, creditAmt, endingDebit, endingCredit };
});

/* ========== 多栏账 ========== */
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
const mcLoading = ref(false);
const mcResult = ref<MultiColumnLedgerResult>({ columns: [], rows: [], periodSummary: [] });
const mcShowPeriodSummary = ref(false);

/* 可选上级科目（非末级，有下级科目） */
const mcParentCandidates = computed<{ code: string; name: string; children: MultiColumnChild[] }[]>(() => {
  const tree = subjectTree.value;
  const result: { code: string; name: string; children: MultiColumnChild[] }[] = [];
  function walk(nodes: SubjectTreeNode[]) {
    for (const n of nodes) {
      if (n.children && n.children.length > 0) {
        result.push({
          code: n.code,
          name: n.name,
          children: n.children.map(c => ({ code: c.code, name: c.name })),
        });
        walk(n.children);
      }
    }
  }
  walk(tree);
  return result;
});

/* 当前多栏列表头 */
const mcColumns = computed(() => mcResult.value.columns);

/* 多栏账行合计 */
function mcRowTotal(row: MultiColumnLedgerRow): number {
  return row.cells.reduce((sum, c) => sum + c.debit, 0);
}

/* 加载多栏方案列表 */
async function loadMcSchemes() {
  try { mcSchemes.value = await api.listMultiColumnSchemes(); } catch (e) { console.warn('[LedgerView] 加载多栏方案失败:', e); mcSchemes.value = []; }
}

/* 选中方案 */
async function selectMcScheme(id: number) {
  const s = mcSchemes.value.find(x => x.id === id);
  if (!s) return;
  mcSchemeId.value = s.id;
  mcParentCode.value = s.parent_code;
  mcParentName.value = s.parent_name;
  mcSchemeName.value = s.name;
  try { mcChildren.value = JSON.parse(s.children_json || '[]'); } catch (e) { console.warn('[LedgerView] 解析子科目JSON失败:', e); mcChildren.value = []; }
  await queryMultiColumn();
}

/* 选择上级科目时自动填充子科目 */
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

/* 移除某子科目列 */
function removeMcChild(idx: number) {
  mcChildren.value.splice(idx, 1);
  mcSchemeId.value = 0;
  mcSchemeName.value = '';
}

/* 查询多栏账 */
async function queryMultiColumn() {
  if (!mcParentCode.value || mcChildren.value.length === 0) return;
  mcLoading.value = true;
  try {
    mcResult.value = await api.getMultiColumnLedger({
      parentCode: mcParentCode.value,
      period: period.value,
      childrenJson: JSON.stringify(mcChildren.value),
    });
  } catch (_) {
    mcResult.value = { columns: [], rows: [], periodSummary: [] };
  } finally { mcLoading.value = false; }
}

/* 表格合计行 */
function mcGetSummaries(param: { columns: any[]; data: any[] }) {
  const sums: (string | number)[] = [];
  const { columns, data } = param;
  columns.forEach((col, idx) => {
    if (idx === 0) { sums[0] = '合计'; return; }
    if (idx === 1) { sums[1] = ''; return; }
    if (idx === 2) { sums[2] = ''; return; }
    // 数值列：根据 label 判断是借方还是贷方
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

/* 保存方案 */
async function saveMcScheme() {
  if (!mcSchemeName.value.trim()) { mcSchemeName.value = mcParentName.value + '多栏账'; }
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
    await loadMcSchemes();
    mcShowDialog.value = false;
  } catch (e: any) { alert(e.message || '保存失败'); }
}

/* 删除方案 */
async function deleteMcScheme() {
  if (mcSchemeId.value <= 0) return;
  if (!confirm('确定删除方案「' + mcSchemeName.value + '」？')) return;
  try {
    await api.deleteMultiColumnScheme(mcSchemeId.value);
    mcSchemeId.value = 0;
    mcSchemeName.value = '';
    await loadMcSchemes();
  } catch (e: any) { alert(e.message || '删除失败'); }
}

/* ========== 数量金额明细账 ========== */
const qdSubjectCode = ref('');
const qdSubjectName = ref('');
const qdPeriod = ref('2026-06');
const qdStartDate = ref('');
const qdEndDate = ref('');
const qdPage = ref(1);
const qdPageSize = 50;
const qdTotal = ref(0);
const qdRows = ref<QuantityDetailLedgerRow[]>([]);
const qdLoading = ref(false);

async function queryQtyDetail(resetPage = true) {
  if (!qdSubjectCode.value) return;
  if (resetPage) qdPage.value = 1;
  qdLoading.value = true;
  try {
    const subj = allSubjects.value.find(s => s.code === qdSubjectCode.value);
    qdSubjectName.value = subj?.name || '';
    const result = await api.getQuantityDetailLedger({
      subjectCode: qdSubjectCode.value,
      period: qdPeriod.value,
      startDate: qdStartDate.value || undefined,
      endDate: qdEndDate.value || undefined,
      page: qdPage.value,
      pageSize: qdPageSize,
    });
    qdRows.value = result.rows;
    qdTotal.value = result.total;
  } finally { qdLoading.value = false; }
}

/* ========== 数量金额总账 ========== */
const qgPeriodFrom = ref('2026-01');
const qgPeriodTo = ref('2026-06');
const qgSubjectCode = ref('');
const qgLevel = ref('all');
const qgRows = ref<QuantityGeneralLedgerRow[]>([]);
const qgLoading = ref(false);

async function queryQtyGeneral() {
  qgLoading.value = true;
  try {
    const result = await api.getQuantityGeneralLedger({
      subjectCode: qgSubjectCode.value || undefined,
      period: qgPeriodTo.value,
    });
    // 级次过滤
    let rows = result.rows;
    if (qgLevel.value === '1') {
      rows = rows.filter(r => {
        const s = allSubjects.value.find(x => x.code === r.code);
        return s?.level === 1;
      });
    }
    qgRows.value = rows;
  } finally { qgLoading.value = false; }
}

/* ========== 核算项目余额表 ========== */
const pbAuxTypes = ref<AuxProjectType[]>([]);
const pbAuxValues = ref<AuxProjectValue[]>([]);
const pbTypeId = ref<number | null>(null);
const pbValueId = ref<number | null>(null);
const pbPeriod = ref('2026-06');
const pbRows = ref<AuxProjectBalanceRow[]>([]);
const pbLoading = ref(false);

async function loadAuxTypes() {
  try { pbAuxTypes.value = await api.listAuxProjectTypes(); } catch (e) { console.warn('[LedgerView] 加载核算项目类型失败:', e); pbAuxTypes.value = []; }
}
async function onPbTypeChange() {
  pbValueId.value = null;
  if (pbTypeId.value) {
    try { pbAuxValues.value = await api.listAuxProjectValues(pbTypeId.value); } catch (e) { console.warn('[LedgerView] 加载核算项目值失败:', e); pbAuxValues.value = []; }
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
  } finally { pbLoading.value = false; }
}

/* ========== 核算项目明细账 ========== */
const pdTypeId = ref<number | null>(null);
const pdValueId = ref<number | null>(null);
const pdAuxTypes = ref<AuxProjectType[]>([]);
const pdAuxValues = ref<AuxProjectValue[]>([]);
const pdPeriod = ref('2026-06');
const pdStartDate = ref('');
const pdEndDate = ref('');
const pdPage = ref(1);
const pdPageSize = 50;
const pdTotal = ref(0);
const pdRows = ref<AuxProjectDetailRow[]>([]);
const pdLoading = ref(false);

async function loadPdAuxTypes() {
  try { pdAuxTypes.value = await api.listAuxProjectTypes(); } catch (e) { console.warn('[LedgerView] 加载核算项目类型失败:', e); pdAuxTypes.value = []; }
}
async function onPdTypeChange() {
  pdValueId.value = null;
  if (pdTypeId.value) {
    try { pdAuxValues.value = await api.listAuxProjectValues(pdTypeId.value); } catch (e) { console.warn('[LedgerView] 加载核算项目值失败:', e); pdAuxValues.value = []; }
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
  } finally { pdLoading.value = false; }
}

/* ========== 总账 ========== */
const generalPeriodFrom = ref('2026-01');
const generalPeriodTo = ref('2026-06');
const generalLevel = ref('1');       // '1' | 'all'
const generalShowAux = ref(false);

interface GeneralDisplayRow {
  code: string;
  name: string;
  summary: string;
  debit: number;
  credit: number;
  direction: string;
  balance: number;
  rowType: string; // 'opening' | 'periodTotal' | 'yearTotal'
  groupIdx: number; // for rowspan
}

const generalRows = ref<GeneralDisplayRow[]>([]);
const generalLoading = ref(false);

async function queryGeneralLedger() {
  generalLoading.value = true;
  try {
    // 获取期初余额
    const openings = await api.getOpeningBalances(generalPeriodFrom.value);
    // 获取本期科目余额（含发生额）
    const balance = await api.getSubjectBalance({ period: generalPeriodTo.value });
    // 获取全年累计（不传 period 则汇总所有已过账凭证）
    const yearBalances = await api.getSubjectBalance({});

    // 按编码排序的科目（根据级次过滤）
    const subjects = generalLevel.value === '1'
      ? allSubjects.value.filter(s => s.level === 1)
      : allSubjects.value.filter(s => s.level <= 2);
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

      // 本年累计（通过查询全年余额）
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
  } finally { generalLoading.value = false; }
}

/* 合并单元格：科目编码/名称按科目分组合并3行 */
function generalSpanMethod({ row, column, rowIndex }: { row: GeneralDisplayRow; column: any; rowIndex: number }) {
  const colProp = column.property;
  if (colProp === 'code' || colProp === 'name') {
    const idx = row.groupIdx;
    // 找到该 group 的首行
    const firstRow = generalRows.value.findIndex(r => r.groupIdx === idx);
    if (firstRow === rowIndex) {
      return { rowspan: 3, colspan: 1 };
    }
    return { rowspan: 0, colspan: 0 };
  }
  return { rowspan: 1, colspan: 1 };
}

/* ========== 明细账 ========== */
const detailSubjectCode = ref('');
const detailStartDate = ref('');
const detailEndDate = ref('');
const detailIncludeUnposted = ref(false);
const detailPage = ref(1);
const detailPageSize = 50;
const detailTotal = ref(0);

/* 构建带 children 的科目树 */
function buildSubjectTree(subjects: FinanceSubject[]): SubjectTreeNode[] {
  const ordered = buildTreeOrderedSubjects(subjects);
  const map = new Map<string, SubjectTreeNode>();
  const roots: SubjectTreeNode[] = [];

  // 先创建所有节点
  for (const s of ordered) {
    map.set(s.code, { ...s, children: [] });
  }
  // 建立父子关系
  for (const s of ordered) {
    const node = map.get(s.code)!;
    if (s.parent_code && map.has(s.parent_code)) {
      map.get(s.parent_code)!.children.push(node);
    } else {
      // 一级科目 或 父科目不存在的二级科目 → 作为根节点展示
      roots.push(node);
    }
  }
  return roots;
}

const subjectTree = computed(() => buildSubjectTree(allSubjects.value));

/* 切换科目节点展开/折叠 */
function toggleSubjectExpand(code: string) {
  const keys = new Set(subjectExpandedKeys.value);
  if (keys.has(code)) keys.delete(code);
  else keys.add(code);
  subjectExpandedKeys.value = keys;
}

/* 明细账行类型 */
interface DetailDisplayRow {
  type: 'carryForward' | 'opening' | 'entry' | 'periodTotal' | 'yearTotal' | 'carriedForward';
  date: string;
  voucher: string;
  summary: string;
  debit: number;
  credit: number;
  direction: string;
  balance: number;
}

const detailRows = ref<DetailDisplayRow[]>([]);
const detailSubjectName = ref('');
const detailCarryForward = ref(0);
const detailCarriedForward = ref(0);

/* 选中的科目 */
const detailSubject = computed(() =>
  allSubjects.value.find(s => s.code === detailSubjectCode.value)
);

onMounted(async () => {
  const data = await api.bootstrap();
  period.value = data.book.current_period;
  allSubjects.value = data.subjects;
  // 默认账簿为明细账时，自动加载第一个科目的明细
  if (activeBook.value === 'detail' && subjectTree.value.length > 0) {
    const first = subjectTree.value[0];
    if (first) await selectSubjectForDetail(first.code);
  } else {
    await loadData();
  }
});

async function loadData() {
  loading.value = true;
  try {
    if (activeBook.value === 'balance') {
      const [balance, openings] = await Promise.all([
        api.getSubjectBalance({ period: period.value }),
        api.getOpeningBalances(period.value),
      ]);
      balanceListRaw.value = balance;
      const map = new Map<string, { debit: number; credit: number }>();
      openings.forEach(o => map.set(o.subject_code, { debit: Number(o.debit), credit: Number(o.credit) }));
      balanceOpeningMap.value = map;
    }
  } finally { loading.value = false; }
}

function selectBook(category: BookCategory, key: string) {
  activeCategory.value = category;
  activeBook.value = key;
  detailPage.value = 1;
  if (key === 'balance') loadData();
  if (key === 'general') queryGeneralLedger();
  if (key === 'detail' && detailSubjectCode.value) queryDetailLedger();
  if (key === 'multiColumn') { loadMcSchemes(); if (mcParentCode.value) queryMultiColumn(); }
  if (key === 'qtyDetail' && qdSubjectCode.value) queryQtyDetail();
  if (key === 'qtyGeneral') { qgSubjectCode.value = ''; queryQtyGeneral(); }
  if (key === 'projectBalance') loadAuxTypes();
  if (key === 'projectDetail') loadPdAuxTypes();
}

/* 选择科目查询明细账 */
async function selectSubjectForDetail(code: string) {
  detailSubjectCode.value = code;
  await queryDetailLedger();
}

/* 科目树当前高亮的科目编码（兼容明细账/数量金额明细账） */
const treeActiveCode = computed(() =>
  activeBook.value === 'qtyDetail' ? qdSubjectCode.value : detailSubjectCode.value
);

/* 科目树点击：根据当前账簿分发 */
function onTreeSubjectClick(code: string) {
  if (activeBook.value === 'qtyDetail') {
    qdSubjectCode.value = code;
    queryQtyDetail();
  } else {
    selectSubjectForDetail(code);
  }
}

/* 查询明细账 */
async function queryDetailLedger(resetPage = true) {
  if (!detailSubjectCode.value) return;
  if (resetPage) detailPage.value = 1;
  loading.value = true;
  try {
    const subj = detailSubject.value;
    detailSubjectName.value = subj?.name || '';

    // 查询期初余额
    const openings = await api.getOpeningBalances(period.value);
    const opening = openings.find(o => o.subject_code === detailSubjectCode.value);
    const openingBalance = opening
      ? (Number(opening.debit) - Number(opening.credit))
      : 0;

    // 查询本期明细（带翻页）
    const result: DetailLedgerResult = await api.getDetailLedger({
      subjectCode: detailSubjectCode.value,
      period: period.value,
      startDate: detailStartDate.value || undefined,
      endDate: detailEndDate.value || undefined,
      page: detailPage.value,
      pageSize: detailPageSize,
    });
    detailTotal.value = result.total;
    detailCarryForward.value = result.carryForward || 0;
    detailCarriedForward.value = result.carriedForward || 0;

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
    const yearStart = period.value.substring(0, 4) + '-01';
    const yearResult = await api.getDetailLedger({
      subjectCode: detailSubjectCode.value,
      startDate: yearStart + '-01',
      endDate: period.value + '-31',
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
  } finally { loading.value = false; }
}

/* 切换账簿时自动加载数据 */
watch(activeBook, (val) => {
  detailPage.value = 1;
  if (val === 'detail' && allSubjects.value.length > 0 && !detailSubjectCode.value) {
    const first = subjectTree.value[0];
    if (first) selectSubjectForDetail(first.code);
  }
  if (val === 'detail' && detailSubjectCode.value) queryDetailLedger();
  if (val === 'qtyDetail' && allSubjects.value.length > 0 && !qdSubjectCode.value) {
    const first = subjectTree.value[0];
    if (first) { qdSubjectCode.value = first.code; queryQtyDetail(); }
  }
  if (val === 'general') queryGeneralLedger();
  if (val === 'balance') loadData();
  if (val === 'multiColumn') loadMcSchemes();
  if (val === 'qtyDetail' && qdSubjectCode.value) queryQtyDetail();
  if (val === 'qtyGeneral') queryQtyGeneral();
  if (val === 'projectBalance') loadAuxTypes();
  if (val === 'projectDetail') loadPdAuxTypes();
});

/* ---- 打印 ---- */
function handlePrint() {
  window.print();
}

/* ---- 导出 CSV 通用工具 ---- */
function exportCSV(headers: string[], rows: string[][], bookName: string) {
  const now = new Date();
  const month = period.value;
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const csv = '\uFEFF' + [headers, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${bookName}_${month}_${time}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ---- 明细账导出 ---- */
function handleExportDetail() {
  if (detailRows.value.length === 0) {
    ElMessage.warning('暂无数据可导出');
    return;
  }
  const headers = ['日期', '凭证字号', '摘要', '借方金额', '贷方金额', '方向', '余额'];
  const rows = detailRows.value.map(r => [
    r.date,
    r.voucher,
    r.summary,
    r.debit > 0 ? r.debit.toFixed(2) : '',
    r.credit > 0 ? r.credit.toFixed(2) : '',
    r.direction,
    r.balance.toFixed(2),
  ]);
  exportCSV(headers, rows, `明细账_${detailSubjectCode.value || '未选'}`);
  ElMessage.success('明细账导出成功');
}

/* ---- 总账导出 ---- */
function handleExportGeneral() {
  if (generalRows.value.length === 0) {
    ElMessage.warning('暂无数据可导出');
    return;
  }
  const headers = ['科目编码', '科目名称', '摘要', '借方金额', '贷方金额', '方向', '余额'];
  const rows = generalRows.value.map(r => [
    r.code,
    r.name,
    r.summary,
    r.debit > 0 ? r.debit.toFixed(2) : '',
    r.credit > 0 ? r.credit.toFixed(2) : '',
    r.direction,
    r.balance.toFixed(2),
  ]);
  exportCSV(headers, rows, '总账');
  ElMessage.success('总账导出成功');
}

/* ---- 科目余额表导出 ---- */
function handleExportBalance() {
  if (balanceList.value.length === 0) {
    ElMessage.warning('暂无数据可导出');
    return;
  }
  const headers = ['科目编码', '科目名称', '方向', '期初余额', '借方发生额', '贷方发生额', '期末余额'];
  const rows = balanceList.value.map(r => [
    r.code,
    r.name,
    r.directionLabel,
    r.openingBalance !== 0 ? r.openingBalance.toFixed(2) : '',
    r.debitAmount !== 0 ? r.debitAmount.toFixed(2) : '',
    r.creditAmount !== 0 ? r.creditAmount.toFixed(2) : '',
    r.endingBalance !== 0 ? r.endingBalance.toFixed(2) : '',
  ]);
  exportCSV(headers, rows, '科目余额表');
  ElMessage.success('科目余额表导出成功');
}
</script>

<template>
  <div class="page-wrap">
    <div class="page-header">
      <div class="ph-left">
        <span class="ph-icon" v-html="bookIcons[activeBook]"></span>
        <div>
          <h2 class="ph-title">账簿查询</h2>
          <p class="ph-desc">{{ currentBookLabel }}</p>
        </div>
      </div>
      <div class="ph-right">
        <el-tag size="small" type="info">{{ period }}</el-tag>
      </div>
    </div>

    <div class="ledger-layout">
      <!-- 左侧：账簿导航 -->
      <aside class="ledger-nav">
        <div v-for="group in bookGroups" :key="group.title" class="nav-group">
          <div class="nav-group-title">{{ group.title }}</div>
          <div
            v-for="item in group.items"
            :key="item.key"
            :class="['nav-item', { active: activeBook === item.key }]"
            @click="selectBook(
              group.title === '主账簿' ? 'main' : 'aux' as BookCategory,
              item.key
            )"
          >
            <span class="nav-icon" v-html="bookIcons[item.key]"></span>
            <span class="nav-label">{{ item.label }}</span>
          </div>
        </div>
      </aside>

      <!-- 中间：查询条件 + 数据区域 -->
      <div class="ledger-content">
        <!-- ==================== 明细账 ==================== -->
        <template v-if="activeBook === 'detail'">
          <!-- 查询条件栏 -->
          <div class="query-bar">
            <div class="query-left">
              <el-select v-model="period" size="small" style="width:110px">
                <el-option v-for="p in [period]" :key="p" :label="p" :value="p" />
              </el-select>
              <el-date-picker v-model="detailStartDate" type="date" placeholder="开始日期" size="small" style="width:125px" value-format="YYYY-MM-DD" clearable />
              <span class="query-sep">-</span>
              <el-date-picker v-model="detailEndDate" type="date" placeholder="结束日期" size="small" style="width:125px" value-format="YYYY-MM-DD" clearable />
              <el-checkbox v-model="detailIncludeUnposted" size="small">包含未过账</el-checkbox>
            </div>
            <div class="query-right">
              <el-button type="primary" size="small" @click="queryDetailLedger()">查询</el-button>
              <el-button size="small" @click="detailStartDate='';detailEndDate='';detailIncludeUnposted=false;queryDetailLedger()">重置</el-button>
              <el-button size="small" @click="handlePrint">打印</el-button>
              <el-button size="small" @click="handleExportDetail">导出</el-button>
            </div>
          </div>

          <!-- 科目信息头 -->
          <div class="subject-header">
            <span class="subject-code">{{ detailSubjectCode }}</span>
            <span class="subject-name">{{ detailSubjectName }}</span>
            <el-tag v-if="detailSubject" :type="detailSubject.direction === 'debit' ? 'success' : 'danger'" size="small" class="subject-dir-tag">
              {{ detailSubject.direction === 'debit' ? '借方科目' : '贷方科目' }}
            </el-tag>
          </div>

          <!-- 明细账表格 -->
          <div class="data-panel" v-loading="loading">
            <el-table :data="detailRows" border stripe size="small" max-height="480" :show-header="true">
              <el-table-column prop="date" label="日期" min-width="90" align="center" />
              <el-table-column prop="voucher" label="凭证字号" min-width="95" align="center" />
              <el-table-column prop="summary" label="摘要" min-width="180" show-overflow-tooltip>
                <template #default="{ row }">
                  <span :class="{ 'summary-highlight': row.type !== 'entry' }">
                    {{ row.summary }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="借方" min-width="110" align="center">
                <template #default="{ row }">
                  <span v-if="row.debit !== 0" class="money">{{ row.debit.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="贷方" min-width="110" align="center">
                <template #default="{ row }">
                  <span v-if="row.credit !== 0" class="money">{{ row.credit.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="方向" width="48" align="center">
                <template #default="{ row }">
                  <span v-if="row.direction" :class="['dir-tag', row.direction === '借' ? 'dir-debit' : 'dir-credit']">
                    {{ row.direction }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="余额" min-width="110" align="center">
                <template #default="{ row }">
                  <span class="money">{{ row.balance.toFixed(2) }}</span>
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
        </template>

        <!-- ==================== 总账 ==================== -->
        <template v-if="activeBook === 'general'">
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
              <el-radio-group v-model="generalLevel" size="small">
                <el-radio-button value="1">一级</el-radio-button>
                <el-radio-button value="all">全部</el-radio-button>
              </el-radio-group>
              <el-checkbox v-model="generalShowAux" size="small">显示辅助核算</el-checkbox>
            </div>
            <div class="query-right">
              <el-button type="primary" size="small" @click="queryGeneralLedger">查询</el-button>
              <el-button size="small">刷新</el-button>
              <el-button size="small" @click="handlePrint">打印</el-button>
              <el-button size="small" @click="handleExportGeneral">导出</el-button>
            </div>
          </div>

          <div class="data-panel" v-loading="generalLoading">
            <el-table
              :data="generalRows" border stripe size="small" max-height="480"
              :span-method="generalSpanMethod"
            >
              <el-table-column prop="code" label="科目编码" min-width="85" align="center" />
              <el-table-column prop="name" label="科目名称" min-width="140" align="center" show-overflow-tooltip />
              <el-table-column prop="summary" label="摘要" min-width="130" show-overflow-tooltip>
                <template #default="{ row }">
                  <span :class="{ 'summary-highlight': row.rowType !== 'opening' }">{{ row.summary }}</span>
                </template>
              </el-table-column>
              <el-table-column label="借方" min-width="110" align="center">
                <template #default="{ row }">
                  <span v-if="row.debit !== 0" class="money">{{ row.debit.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="贷方" min-width="110" align="center">
                <template #default="{ row }">
                  <span v-if="row.credit !== 0" class="money">{{ row.credit.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="方向" width="48" align="center">
                <template #default="{ row }">
                  <span v-if="row.direction" :class="['dir-tag', row.direction === '借' ? 'dir-debit' : 'dir-credit']">
                    {{ row.direction }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="余额" min-width="110" align="center">
                <template #default="{ row }">
                  <span class="money">{{ row.balance.toFixed(2) }}</span>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </template>

        <!-- ==================== 科目余额表 ==================== -->
        <template v-if="activeBook === 'balance'">
          <div class="query-bar">
            <div class="query-left">
              <el-select v-model="period" size="small" style="width:110px">
                <el-option v-for="p in [period]" :key="p" :label="p" :value="p" />
              </el-select>
              <el-radio-group v-model="balanceLevel" size="small">
                <el-radio-button value="all">全部</el-radio-button>
                <el-radio-button value="1">一级科目</el-radio-button>
              </el-radio-group>
              <el-checkbox v-model="balanceHideZero" size="small">余额为零不显示</el-checkbox>
            </div>
            <div class="query-right">
              <el-button type="primary" size="small" @click="loadData">查询</el-button>
              <el-button size="small" @click="handleExportBalance">导出</el-button>
              <el-button size="small" @click="handlePrint">打印</el-button>
            </div>
          </div>
          <div class="data-panel" v-loading="loading">
            <el-table :data="balanceList" border stripe size="small" max-height="520">
              <el-table-column prop="code" label="科目编码" min-width="95" align="center" />
              <el-table-column prop="name" label="科目名称" min-width="150" show-overflow-tooltip />
              <el-table-column label="方向" width="48" align="center">
                <template #default="{ row }">
                  <span :class="['dir-tag', row.directionLabel === '借' ? 'dir-debit' : 'dir-credit']">
                    {{ row.directionLabel }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="期初余额" align="center" min-width="110">
                <template #default="{ row }">
                  <span v-if="row.openingBalance !== 0" class="money">{{ row.openingBalance.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="借方发生额" align="center" min-width="110">
                <template #default="{ row }">
                  <span v-if="row.debitAmount !== 0" class="money">{{ row.debitAmount.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="贷方发生额" align="center" min-width="110">
                <template #default="{ row }">
                  <span v-if="row.creditAmount !== 0" class="money">{{ row.creditAmount.toFixed(2) }}</span>
                </template>
              </el-table-column>
              <el-table-column label="期末余额" align="center" min-width="110">
                <template #default="{ row }">
                  <span v-if="row.endingBalance !== 0" class="money">{{ row.endingBalance.toFixed(2) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <div class="summary-bar">
              合计：期初 {{ balanceSummary.openingDebit.toFixed(2) }}（借）
              | 借方发生额 {{ balanceSummary.debitAmt.toFixed(2) }}
              | 贷方发生额 {{ balanceSummary.creditAmt.toFixed(2) }}
              | 期末 {{ balanceSummary.endingDebit.toFixed(2) }}
            </div>
          </div>
        </template>

        <!-- ==================== 多栏账 ==================== -->
        <template v-if="activeBook === 'multiColumn'">
          <div class="data-panel" v-loading="mcLoading">
            <!-- 工具栏 -->
            <div class="mc-toolbar">
              <div class="mc-toolbar-row">
                <span class="toolbar-label">会计期间</span>
                <el-select v-model="period" size="small" style="width:120px" @change="queryMultiColumn">
                  <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="'2026-'+m" :value="'2026-'+m" />
                </el-select>
                <span class="toolbar-label" style="margin-left:16px">上级科目</span>
                <el-select v-model="mcParentCode" size="small" style="width:220px" placeholder="选择上级科目" @change="onMcParentChange">
                  <el-option v-for="p in mcParentCandidates" :key="p.code" :label="p.code + ' ' + p.name" :value="p.code" />
                </el-select>
                <span class="toolbar-label" style="margin-left:16px">方案</span>
                <el-select v-model="mcSchemeId" size="small" style="width:180px" placeholder="选择已保存方案" @change="selectMcScheme">
                  <el-option v-for="s in mcSchemes" :key="s.id" :label="s.name" :value="s.id" />
                </el-select>
                <el-button size="small" style="margin-left:8px" @click="mcShowDialog = true; mcSchemeName = mcSchemeId > 0 ? mcSchemes.find(s => s.id === mcSchemeId)?.name || '' : ''">保存方案</el-button>
                <el-button v-if="mcSchemeId > 0" size="small" type="danger" plain @click="deleteMcScheme">删除方案</el-button>
                <el-button size="small" type="primary" style="margin-left:auto" @click="queryMultiColumn" :disabled="!mcParentCode || mcChildren.length === 0">查询</el-button>
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
              <el-table :data="mcResult.rows" border stripe size="small" :max-height="400" show-summary :summary-method="mcGetSummaries">
                <el-table-column prop="voucher_date" label="日期" min-width="90" fixed />
                <el-table-column label="凭证字号" min-width="110" fixed>
                  <template #default="{ row }">{{ row.voucher_word }}-{{ row.voucher_no }}</template>
                </el-table-column>
                <el-table-column prop="summary" label="摘要" min-width="140" show-overflow-tooltip />
                <template v-for="(col, ci) in mcColumns" :key="col.code">
                  <el-table-column :label="col.code + ' ' + col.name + ' 借方'" align="center" min-width="110">
                    <template #default="{ row }">{{ row.cells[ci].debit > 0 ? row.cells[ci].debit.toFixed(2) : '' }}</template>
                  </el-table-column>
                  <el-table-column :label="col.code + ' ' + col.name + ' 贷方'" align="center" min-width="110">
                    <template #default="{ row }">{{ row.cells[ci].credit > 0 ? row.cells[ci].credit.toFixed(2) : '' }}</template>
                  </el-table-column>
                </template>
                <el-table-column label="合计" align="center" min-width="100">
                  <template #default="{ row }">{{ mcRowTotal(row).toFixed(2) }}</template>
                </el-table-column>
              </el-table>

              <!-- 期间汇总切换 -->
              <div style="margin-top:12px">
                <el-checkbox v-model="mcShowPeriodSummary">显示期间汇总</el-checkbox>
              </div>

              <el-table v-if="mcShowPeriodSummary && mcResult.periodSummary.length > 0" :data="mcResult.periodSummary" border size="small" style="margin-top:8px" class="mc-summary-table">
                <el-table-column prop="period" label="期间" min-width="90" fixed />
                <el-table-column label="凭证字号" min-width="110" fixed>
                  <template #default>（小计）</template>
                </el-table-column>
                <el-table-column label="摘要" min-width="140">
                  <template #default>本期间合计</template>
                </el-table-column>
                <template v-for="(col, ci) in mcColumns" :key="col.code">
                  <el-table-column :label="col.code + ' ' + col.name + ' 借方'" align="center" min-width="110">
                    <template #default="{ row }">{{ row.cells[ci].debit > 0 ? row.cells[ci].debit.toFixed(2) : '' }}</template>
                  </el-table-column>
                  <el-table-column :label="col.code + ' ' + col.name + ' 贷方'" align="center" min-width="110">
                    <template #default="{ row }">{{ row.cells[ci].credit > 0 ? row.cells[ci].credit.toFixed(2) : '' }}</template>
                  </el-table-column>
                </template>
                <el-table-column label="合计" align="center" min-width="100">
                  <template #default="{ row }">{{ mcRowTotal(row).toFixed(2) }}</template>
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
        </template>

        <!-- ==================== 数量金额明细账 ==================== -->
        <template v-if="activeBook === 'qtyDetail'">
          <div class="data-panel" v-loading="qdLoading">
            <div class="query-bar">
              <span class="query-label">期间</span>
              <el-select v-model="qdPeriod" size="small" style="width:110px" @change="queryQtyDetail">
                <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="'2026-'+m" :value="'2026-'+m" />
              </el-select>
              <span class="query-label" style="margin-left:12px">日期</span>
              <el-date-picker v-model="qdStartDate" type="date" size="small" style="width:130px" placeholder="开始日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" @change="queryQtyDetail" />
              <span class="query-sep">至</span>
              <el-date-picker v-model="qdEndDate" type="date" size="small" style="width:130px" placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" @change="queryQtyDetail" />
              <el-button size="small" type="primary" style="margin-left:12px" @click="queryQtyDetail" :disabled="!qdSubjectCode">查询</el-button>
            </div>
            <el-table v-if="qdRows.length > 0" :data="qdRows" border stripe size="small" :max-height="450">
              <el-table-column prop="voucher_date" label="日期" min-width="90" fixed />
              <el-table-column label="凭证字号" min-width="105" fixed>
                <template #default="{ row }">{{ row.voucher_word }}-{{ row.voucher_no }}</template>
              </el-table-column>
              <el-table-column prop="summary" label="摘要" min-width="130" show-overflow-tooltip />
              <el-table-column prop="debit" label="借方金额" align="center" min-width="100">
                <template #default="{ row }">{{ row.debit > 0 ? row.debit.toFixed(2) : '' }}</template>
              </el-table-column>
              <el-table-column prop="credit" label="贷方金额" align="center" min-width="100">
                <template #default="{ row }">{{ row.credit > 0 ? row.credit.toFixed(2) : '' }}</template>
              </el-table-column>
              <el-table-column prop="quantity" label="数量" align="center" min-width="80">
                <template #default="{ row }">{{ row.quantity > 0 ? row.quantity.toFixed(2) : '' }}</template>
              </el-table-column>
              <el-table-column prop="unit_price" label="单价" align="center" min-width="85">
                <template #default="{ row }">{{ row.unit_price > 0 ? row.unit_price.toFixed(4) : '' }}</template>
              </el-table-column>
              <el-table-column prop="unit" label="单位" align="center" width="60" />
            </el-table>
            <div v-else-if="qdSubjectCode" class="mc-empty"><p>「{{ qdSubjectName }}」暂无数量金额数据</p></div>
            <div v-else class="mc-placeholder"><p>请在右侧科目树中选择科目</p></div>
            <div v-if="qdTotal > qdPageSize" class="pagination-bar">
              <el-pagination background layout="prev, pager, next" :total="qdTotal" :page-size="qdPageSize" v-model:current-page="qdPage" @current-change="() => queryQtyDetail(false)" />
            </div>
          </div>
        </template>

        <!-- ==================== 数量金额总账 ==================== -->
        <template v-if="activeBook === 'qtyGeneral'">
          <div class="data-panel" v-loading="qgLoading">
            <div class="query-bar">
              <span class="query-label">期间</span>
              <el-select v-model="qgPeriodFrom" size="small" style="width:110px">
                <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="'2026-'+m" :value="'2026-'+m" />
              </el-select>
              <span class="query-sep">至</span>
              <el-select v-model="qgPeriodTo" size="small" style="width:110px">
                <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="'2026-'+m" :value="'2026-'+m" />
              </el-select>
              <span class="query-label" style="margin-left:12px">科目</span>
              <el-select v-model="qgSubjectCode" size="small" style="width:200px" clearable placeholder="全部科目" filterable>
                <el-option v-for="s in allSubjects" :key="s.code" :label="s.code + ' ' + s.name" :value="s.code" />
              </el-select>
              <span class="query-label" style="margin-left:12px">级次</span>
              <el-radio-group v-model="qgLevel" size="small" @change="queryQtyGeneral">
                <el-radio-button value="1">一级</el-radio-button>
                <el-radio-button value="all">全部</el-radio-button>
              </el-radio-group>
              <el-button size="small" type="primary" style="margin-left:12px" @click="queryQtyGeneral">查询</el-button>
            </div>
            <el-table v-if="qgRows.length > 0" :data="qgRows" border stripe size="small" :max-height="450">
              <el-table-column prop="code" label="科目编码" min-width="90" fixed />
              <el-table-column prop="name" label="科目名称" min-width="120" show-overflow-tooltip />
              <el-table-column prop="total_debit" label="借方金额" align="center" min-width="110">
                <template #default="{ row }">{{ row.total_debit.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="total_credit" label="贷方金额" align="center" min-width="110">
                <template #default="{ row }">{{ row.total_credit.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="in_quantity" label="数量(收)" align="center" min-width="90">
                <template #default="{ row }">{{ row.in_quantity > 0 ? row.in_quantity.toFixed(2) : '' }}</template>
              </el-table-column>
              <el-table-column prop="out_quantity" label="数量(付)" align="center" min-width="90">
                <template #default="{ row }">{{ row.out_quantity > 0 ? row.out_quantity.toFixed(2) : '' }}</template>
              </el-table-column>
              <el-table-column prop="net_quantity" label="净数量" align="center" min-width="85">
                <template #default="{ row }">{{ row.net_quantity.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="unit" label="单位" align="center" width="60" />
            </el-table>
            <div v-else class="mc-empty"><p>暂无数量金额总账数据</p></div>
          </div>
        </template>

        <!-- ==================== 核算项目余额表 ==================== -->
        <template v-if="activeBook === 'projectBalance'">
          <div class="data-panel" v-loading="pbLoading">
            <div class="query-bar">
              <span class="query-label">期间</span>
              <el-select v-model="pbPeriod" size="small" style="width:110px">
                <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="'2026-'+m" :value="'2026-'+m" />
              </el-select>
              <span class="query-label" style="margin-left:12px">核算类别</span>
              <el-select v-model="pbTypeId" size="small" style="width:140px" placeholder="全部" clearable @change="onPbTypeChange">
                <el-option v-for="t in pbAuxTypes" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
              <span class="query-label" style="margin-left:12px">核算项目</span>
              <el-select v-model="pbValueId" size="small" style="width:160px" placeholder="全部" clearable :disabled="!pbTypeId">
                <el-option v-for="v in pbAuxValues" :key="v.id" :label="v.code + ' ' + v.name" :value="v.id" />
              </el-select>
              <el-button size="small" type="primary" style="margin-left:12px" @click="queryProjectBalance">查询</el-button>
            </div>
            <el-table v-if="pbRows.length > 0" :data="pbRows" border stripe size="small" :max-height="450">
              <el-table-column prop="subject_code" label="科目编码" min-width="90" fixed />
              <el-table-column prop="subject_name" label="科目名称" min-width="120" show-overflow-tooltip />
              <el-table-column prop="debit_amount" label="借方金额" align="center" min-width="110">
                <template #default="{ row }">{{ row.debit_amount.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column prop="credit_amount" label="贷方金额" align="center" min-width="110">
                <template #default="{ row }">{{ row.credit_amount.toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="余额方向" align="center" width="65">
                <template #default="{ row }">{{ row.debit_amount >= row.credit_amount ? '借' : '贷' }}</template>
              </el-table-column>
              <el-table-column label="余额" align="center" min-width="110">
                <template #default="{ row }">{{ Math.abs(row.debit_amount - row.credit_amount).toFixed(2) }}</template>
              </el-table-column>
            </el-table>
            <div v-else class="mc-empty"><p>请选择核算类别后查询</p></div>
          </div>
        </template>

        <!-- ==================== 核算项目明细账 ==================== -->
        <template v-if="activeBook === 'projectDetail'">
          <div class="data-panel" v-loading="pdLoading">
            <div class="query-bar">
              <span class="query-label">期间</span>
              <el-select v-model="pdPeriod" size="small" style="width:110px">
                <el-option v-for="m in ['01','02','03','04','05','06','07','08','09','10','11','12']" :key="m" :label="'2026-'+m" :value="'2026-'+m" />
              </el-select>
              <span class="query-label" style="margin-left:12px">核算类别</span>
              <el-select v-model="pdTypeId" size="small" style="width:140px" placeholder="全部" clearable @change="onPdTypeChange">
                <el-option v-for="t in pdAuxTypes" :key="t.id" :label="t.name" :value="t.id" />
              </el-select>
              <span class="query-label" style="margin-left:12px">核算项目</span>
              <el-select v-model="pdValueId" size="small" style="width:160px" placeholder="全部" clearable :disabled="!pdTypeId">
                <el-option v-for="v in pdAuxValues" :key="v.id" :label="v.code + ' ' + v.name" :value="v.id" />
              </el-select>
              <span class="query-label" style="margin-left:12px">日期</span>
              <el-date-picker v-model="pdStartDate" type="date" size="small" style="width:130px" placeholder="开始日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
              <span class="query-sep">至</span>
              <el-date-picker v-model="pdEndDate" type="date" size="small" style="width:130px" placeholder="结束日期" format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
              <el-button size="small" type="primary" style="margin-left:12px" @click="queryProjectDetail">查询</el-button>
            </div>
            <el-table v-if="pdRows.length > 0" :data="pdRows" border stripe size="small" :max-height="450">
              <el-table-column prop="voucher_date" label="日期" min-width="90" fixed />
              <el-table-column label="凭证字号" min-width="105" fixed>
                <template #default="{ row }">{{ row.voucher_word }}-{{ row.voucher_no }}</template>
              </el-table-column>
              <el-table-column prop="summary" label="摘要" min-width="120" show-overflow-tooltip />
              <el-table-column prop="subject_code" label="科目编码" min-width="85" show-overflow-tooltip />
              <el-table-column prop="subject_name" label="科目名称" min-width="100" show-overflow-tooltip />
              <el-table-column prop="debit" label="借方金额" align="center" min-width="100">
                <template #default="{ row }">{{ row.debit > 0 ? row.debit.toFixed(2) : '' }}</template>
              </el-table-column>
              <el-table-column prop="credit" label="贷方金额" align="center" min-width="100">
                <template #default="{ row }">{{ row.credit > 0 ? row.credit.toFixed(2) : '' }}</template>
              </el-table-column>
            </el-table>
            <div v-else class="mc-empty"><p>请选择核算类别后查询</p></div>
            <div v-if="pdTotal > pdPageSize" class="pagination-bar">
              <el-pagination background layout="prev, pager, next" :total="pdTotal" :page-size="pdPageSize" v-model:current-page="pdPage" @current-change="() => queryProjectDetail(false)" />
            </div>
          </div>
        </template>

        <!-- ==================== 其他账簿占位 ==================== -->
        <template v-if="activeBook !== 'detail' && activeBook !== 'balance' && activeBook !== 'general' && activeBook !== 'multiColumn' && activeBook !== 'qtyDetail' && activeBook !== 'qtyGeneral' && activeBook !== 'projectBalance' && activeBook !== 'projectDetail'">
          <div class="data-panel" v-loading="loading">
            <div class="placeholder">
              <svg viewBox="0 0 24 24" fill="none" width="40" height="40"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h18M9 3v18" stroke="currentColor" stroke-width="1.5"/></svg>
              <p>「{{ currentBookLabel }}」功能规划中，请稍后</p>
            </div>
          </div>
        </template>
      </div>

      <!-- 右侧：科目树（明细账/数量金额明细账显示） -->
      <aside v-if="activeBook === 'detail' || activeBook === 'qtyDetail'" class="subject-tree-panel">
        <div class="tree-header">会计科目</div>
        <div class="tree-body">
          <template v-for="subj in subjectTree" :key="subj.code">
            <!-- 一级科目 -->
            <div
              :class="['tree-node', 'tree-level1', { active: treeActiveCode === subj.code }]"
              @click="onTreeSubjectClick(subj.code)"
            >
              <span
                v-if="subj.children && subj.children.length > 0"
                class="tree-arrow"
                :class="{ expanded: subjectExpandedKeys.has(subj.code) }"
                @click.stop="toggleSubjectExpand(subj.code)"
              >▸</span>
              <span v-else class="tree-arrow-spacer"></span>
              <span class="tree-code">{{ subj.code }}</span>
              <span class="tree-name">{{ subj.name }}</span>
            </div>
            <!-- 二级科目 -->
            <div
              v-if="subj.children && subj.children.length > 0 && subjectExpandedKeys.has(subj.code)"
            >
              <div
                v-for="child in subj.children"
                :key="child.code"
                :class="['tree-node', 'tree-level2', { active: treeActiveCode === child.code }]"
                @click="onTreeSubjectClick(child.code)"
              >
                <span class="tree-arrow-spacer"></span>
                <span class="tree-code">{{ child.code }}</span>
                <span class="tree-name">{{ child.name }}</span>
              </div>
            </div>
          </template>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ================================================================
   LedgerView — 账簿查询（三栏布局：导航 + 内容 + 科目树）
   ================================================================ */
.page-wrap { display: flex; flex-direction: column; gap: 12px; height: 100%; }

/* ---- 页面标题 ---- */
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  flex-shrink: 0; gap: 12px;
}
.ph-left { display: flex; align-items: center; gap: 12px; }
.ph-icon {
  display: flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 8px;
  background: rgba(16, 185, 129, 0.1); color: var(--epp-success);
  flex-shrink: 0;
}
.ph-title { margin: 0; font-size: 19px; font-weight: 700; color: var(--epp-ink-text); line-height: 1.2; }
.ph-desc  { margin: 1px 0 0; font-size: 12px; color: var(--epp-ink-sub); }
.ph-right { flex-shrink: 0; }

/* ---- 三栏布局 ---- */
.ledger-layout { display: flex; gap: 10px; flex: 1; min-height: 0; }

/* ---- 左侧账簿导航 ---- */
.ledger-nav {
  width: 170px; min-width: 170px;
  background: var(--epp-paper); border: 1px solid var(--epp-line-light);
  border-radius: 6px; padding: 6px 0; overflow-y: auto; flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.03);
}
.nav-group { margin-bottom: 4px; }
.nav-group:last-child { margin-bottom: 0; }
.nav-group-title {
  padding: 8px 14px 4px; font-size: 11px; font-weight: 700;
  color: var(--epp-ink-sub); letter-spacing: 0.5px; text-transform: uppercase;
}
.nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 12px 7px 14px; font-size: 13px; color: var(--epp-ink-text);
  cursor: pointer; transition: all 0.15s ease;
  border-left: 3px solid transparent;
  margin: 1px 6px 1px 0; border-radius: 0 6px 6px 0;
}
.nav-item:hover {
  background: rgba(16, 185, 129, 0.06); color: var(--epp-ink-text);
}
.nav-item.active {
  background: rgba(16, 185, 129, 0.1); color: var(--epp-success);
  font-weight: 600; border-left-color: var(--epp-success);
}
.nav-icon {
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; flex-shrink: 0; opacity: 0.55;
  transition: opacity 0.15s, color 0.15s;
}
.nav-item.active .nav-icon { opacity: 1; color: var(--epp-success); }
.nav-item:hover .nav-icon { opacity: 0.75; }
.nav-label { white-space: nowrap; }

/* ---- 中间内容区 ---- */
.ledger-content { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }

/* ---- 查询条件栏 ---- */
.query-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 16px; background: #f8fafc;
  border: 1px solid var(--epp-line-light); border-radius: 6px;
  flex-wrap: wrap; flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(10, 30, 61, 0.02);
}
.query-left  { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.query-label { font-size: 12px; color: var(--epp-ink-sub); font-weight: 500; white-space: nowrap; }
.query-sep   { font-size: 12px; color: var(--epp-ink-sub); }
.query-right { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

/* ---- 科目信息头 ---- */
.subject-header {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; background: var(--epp-paper);
  border: 1px solid var(--epp-line-light); border-radius: 6px; flex-shrink: 0;
  box-shadow: 0 1px 2px rgba(10, 30, 61, 0.02);
  transition: box-shadow 0.15s;
}
.subject-code {
  font-size: 14px; font-weight: 700; color: var(--epp-success);
  font-variant-numeric: tabular-nums; font-family: "SF Mono", Consolas, monospace;
}
.subject-name { font-size: 15px; font-weight: 600; color: var(--epp-ink-text); }
.subject-dir-tag { margin-left: auto; }

/* ---- 数据面板 ---- */
.data-panel {
  flex: 1; background: var(--epp-paper);
  border: 1px solid var(--epp-line-light); border-radius: 6px;
  padding: 14px; overflow-y: auto; min-height: 300px;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.04);
  display: flex; flex-direction: column;
}
.data-panel :deep(.el-table) {
  --el-table-border-color: var(--epp-line-light);
  --el-table-header-bg-color: #f1f5f9;
  --el-table-tr-bg-color: #fafbfc;
  --el-table-row-hover-bg-color: #f3f6f9;
  font-size: 12px;
}

/* 默认行底色 */
.data-panel :deep(.el-table__body tr) {
  background-color: #fafbfc;
}
.data-panel :deep(.el-table__body tr:hover > td) {
  background-color: #f3f6f9 !important;
  border-bottom-color: var(--epp-line-light) !important;
}

/* 当前行激活/选中 */
.data-panel :deep(.el-table__body tr.current-row) {
  background-color: #e8f0f8 !important;
}
.data-panel :deep(.el-table__body tr.current-row > td) {
  background-color: #e8f0f8 !important;
  border-bottom-color: var(--epp-line-light) !important;
}
.data-panel :deep(.el-table th) {
  text-align: center; font-weight: 600;
}
.data-panel :deep(.el-table .cell) {
  padding: 6px 8px;
}

/* ---- 明细账汇总行高亮 ---- */
.summary-highlight { font-weight: 700; color: var(--epp-ink-text); }

/* 方向标记 */
.dir-tag {
  display: inline-block; width: 22px; height: 20px; line-height: 20px;
  border-radius: 3px; font-size: 11px; font-weight: 700; text-align: center;
}
.dir-debit  { background: #e8f4fd; color: #1a6eb5; }
.dir-credit { background: #fde8ec; color: #b5435a; }

/* 合计栏 */
.summary-bar {
  margin-top: auto; padding: 10px 16px; background: #f0fdf4;
  border: 1px solid #d1fae5; border-radius: 6px;
  font-size: 13px; color: var(--epp-ink-text); font-weight: 500;
}
.summary-bar :deep(.money) { color: var(--epp-success); }

.money {
  font-variant-numeric: tabular-nums; font-weight: 500;
  font-family: "SF Mono", Consolas, "Cascadia Code", monospace;
}

/* 分页栏 */
.pagination-bar {
  display: flex; justify-content: center; padding: 12px 0 4px;
}

/* ---- 占位 ---- */
.placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 300px; color: var(--epp-ink-sub); gap: 16px;
}
.placeholder svg { color: var(--epp-line); }
.placeholder p { font-size: 14px; margin: 0; }

/* ---- 右侧科目树 ---- */
.subject-tree-panel {
  width: 195px; min-width: 195px; background: var(--epp-paper);
  border: 1px solid var(--epp-line-light); border-radius: 6px;
  display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(10, 30, 61, 0.03);
}
.tree-header {
  padding: 10px 14px; font-size: 12px; font-weight: 700;
  color: var(--epp-ink-sub); border-bottom: 1px solid var(--epp-line-light);
  background: #f8fafc; flex-shrink: 0;
  letter-spacing: 0.3px;
}
.tree-body { flex: 1; overflow-y: auto; padding: 4px 0; }

.tree-node {
  display: flex; align-items: center; gap: 4px;
  padding: 5px 10px; cursor: pointer; transition: all 0.12s ease;
  font-size: 12px; color: var(--epp-ink-text); border-left: 3px solid transparent;
  margin-right: 4px; border-radius: 0 4px 4px 0;
}
.tree-node:hover { background: rgba(16, 185, 129, 0.06); }
.tree-node.active {
  background: rgba(16, 185, 129, 0.08); color: var(--epp-success);
  font-weight: 600; border-left-color: var(--epp-success);
}
.tree-level1 { padding-left: 8px; }
.tree-level2 { padding-left: 28px; }

.tree-arrow {
  display: inline-block; width: 14px; height: 14px; font-size: 10px;
  text-align: center; line-height: 14px; color: var(--epp-ink-sub);
  transition: transform 0.15s, color 0.15s; cursor: pointer; flex-shrink: 0;
}
.tree-arrow.expanded { transform: rotate(90deg); color: var(--epp-success); }
.tree-arrow-spacer { width: 14px; flex-shrink: 0; }

.tree-code { color: var(--epp-ink-sub); font-size: 10px; font-variant-numeric: tabular-nums; min-width: 32px; }
.tree-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- 多栏账 ---- */
.mc-toolbar {
  padding: 14px 16px; background: #f8fafc; border-bottom: 1px solid var(--epp-line-light);
  display: flex; flex-direction: column; gap: 10px;
  border-radius: 6px 6px 0 0;
}
.toolbar-label { font-size: 12px; color: var(--epp-ink-sub); font-weight: 500; white-space: nowrap; }
.mc-toolbar-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
}
.mc-column-tags {
  padding: 10px 16px; background: #fff; border-bottom: 1px dashed var(--epp-line-light);
  display: flex; align-items: center; flex-wrap: wrap;
}
.mc-tag-label { font-size: 12px; color: var(--epp-ink-sub); margin-right: 4px; }
.mc-table-wrap { padding: 0 0 12px 0; }
.mc-empty, .mc-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  height: 200px; color: var(--epp-ink-sub); font-size: 13px; gap: 12px;
}
.mc-empty svg, .mc-placeholder svg { color: var(--epp-line); }
.mc-summary-table :deep(.el-table__row) { background: #f0fdf4; font-weight: 500; }

/* ---- 表格内 el-tag 尺寸统一 ---- */
:deep(.el-tag--small) { font-size: 11px; }

/* ---- 打印样式 ---- */
@media print {
  .page-wrap { height: auto; overflow: visible; }
  .ledger-nav,
  .subject-tree-panel,
  .query-bar,
  .pagination-bar,
  .ph-right,
  .ph-desc,
  .mc-toolbar,
  .mc-column-tags,
  .summary-bar,
  .el-button { display: none !important; }
  .data-panel {
    border: none; box-shadow: none; overflow: visible;
    padding: 0; min-height: auto;
  }
  .data-panel :deep(.el-table) { font-size: 11px; }
  .data-panel :deep(.el-table__body tr:hover > td) { background-color: #fafbfc !important; }
  .data-panel :deep(.el-table__header-wrapper) { position: static; }
  .ledger-content { overflow: visible; }
  body { background: #fff; }
}

/* ---- 滚动条优化 ---- */
.ledger-nav::-webkit-scrollbar,
.tree-body::-webkit-scrollbar,
.data-panel::-webkit-scrollbar {
  width: 4px; height: 4px;
}
.ledger-nav::-webkit-scrollbar-thumb,
.tree-body::-webkit-scrollbar-thumb,
.data-panel::-webkit-scrollbar-thumb {
  background: var(--epp-line); border-radius: 2px;
}

/* ---- 空状态图标 ---- */
.mc-empty::before, .mc-placeholder::before {
  content: ''; display: block;
  width: 40px; height: 40px;
  background: currentColor; opacity: 0.15;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3C/svg%3E") center/contain no-repeat;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3C/svg%3E") center/contain no-repeat;
}
</style>

