<script setup lang="ts">
/**
 * ReportsView.vue — 财务报表页面
 *
 * 职责：利润表、资产负债表的查询与展示
 * 报表结构基于数据库 report_template 表驱动
 */
import { onMounted, ref, computed } from 'vue';
import { Refresh, ArrowDown } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import type { ProfitStatement, BalanceSheet, CashFlowStatement } from '../api';
import { APP_CONFIG } from '../config';

const api = getFinanceApi();
const period = ref('2026-06');
const activeTab = ref<'profit' | 'bs' | 'cashflow'>('bs');
const loading = ref(false);
const companyName = ref('');

// 报表签名数据
const signUnitHead = ref('');    // 单位负责人（来自公司 contactPerson 联系人）
const signAccountant = ref('');  // 会计负责人
const signPreparer = ref('');    // 制表人（当前登录用户）

const profitStatement = ref<ProfitStatement | null>(null);
const balanceSheet = ref<BalanceSheet | null>(null);
const cashFlowStatement = ref<CashFlowStatement | null>(null);

// 资产负债表单表数据：资产（左）+ 负债和所有者权益（右）按行配对
interface BsTableRow {
  assetName: string; assetLine: string; assetEnd: number; assetStart: number;
  assetIsHeader: boolean; assetIsTotal: boolean; assetIndent: number;
  liabilityName: string; liabilityLine: string; liabilityEnd: number; liabilityStart: number;
  liabilityIsHeader: boolean; liabilityIsTotal: boolean; liabilityIndent: number;
}

const bsTableData = computed<BsTableRow[]>(() => {
  const assets = balanceSheet.value?.asset_rows || [];
  // 右侧：负债 + 3行空白 + 所有者权益
  const right = [
    ...(balanceSheet.value?.liability_rows || []),
    ...Array(3).fill(null),
    ...(balanceSheet.value?.equity_rows || []),
  ];
  const maxLen = Math.max(assets.length, right.length);
  const rows: BsTableRow[] = [];
  for (let i = 0; i < maxLen; i++) {
    const a = assets[i];
    const r = right[i];
    rows.push({
      assetName: a?.name || '',
      assetLine: a && !a.is_header ? String(a.row_no) : '',
      assetEnd: a?.amount ?? 0,
      assetStart: a?.opening_amount ?? 0,
      assetIsHeader: a?.is_header || false,
      assetIsTotal: a?.is_total || false,
      assetIndent: a?.indent_level || 0,
      liabilityName: r?.name || '',
      liabilityLine: r && !r.is_header ? String(r.row_no) : '',
      liabilityEnd: r?.amount ?? 0,
      liabilityStart: r?.opening_amount ?? 0,
      liabilityIsHeader: r?.is_header || false,
      liabilityIsTotal: r?.is_total || false,
      liabilityIndent: r?.indent_level || 0,
    });
  }
  return rows;
});

// 期间选项
const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);
const selectedMonth = ref('06');

onMounted(async () => {
  const data = await api.bootstrap();
  companyName.value = data.book.company_name || '';

  // 获取签名数据
  try {
    const companies = await api.getCompanies();
    const currentCompany = companies.find(c => c.name === companyName.value) || companies[0];
    if (currentCompany?.contactPerson) signUnitHead.value = currentCompany.contactPerson;
  } catch (e) { console.warn('[ReportsView] 获取公司信息失败:', e) }
  try {
    const profile = await api.getUserProfile();
    if (profile?.alias) {
      signAccountant.value = profile.alias;  // 会计负责人 = 当前登录用户
      signPreparer.value = profile.alias;    // 制表人 = 当前登录用户
    }
  } catch (e) { console.warn('[ReportsView] 获取用户信息失败:', e) }

  // 智能选择初始期间：优先使用有已过账凭证的期间
  let p = data.book.current_period || '2026-06';
  const voucherPeriods = [...new Set(
    (data.vouchers || [])
      .filter(v => v.status === 'posted')
      .map(v => v.period)
      .filter(Boolean)
  )];
  if (voucherPeriods.length > 0 && !voucherPeriods.includes(p)) {
    // 当前账套期间无已过账凭证，回退到最新有数据的期间
    voucherPeriods.sort().reverse();
    p = voucherPeriods[0];
  }

  period.value = p;
  const parts = p.split('-');
  if (parts.length === 2) {
    selectedYear.value = parseInt(parts[0]);
    selectedMonth.value = parts[1];
  }
  await loadData();
});

async function loadData() {
  loading.value = true;
  const p = period.value;
  try {
    if (activeTab.value === 'profit') {
      profitStatement.value = await api.getProfitStatement(p);
    } else if (activeTab.value === 'cashflow') {
      cashFlowStatement.value = await api.getCashFlowStatement(p);
    } else {
      balanceSheet.value = await api.getBalanceSheet(p);
    }
  } finally { loading.value = false; }
}

function switchTab(tab: 'profit' | 'bs' | 'cashflow') { activeTab.value = tab; loadData(); }
function onPeriodChange() {
  const parts = period.value.split('-');
  if (parts.length === 2) {
    selectedYear.value = parseInt(parts[0]);
    selectedMonth.value = parts[1];
  }
  loadData();
}
function onRefresh() { loadData(); }

function formatMoney(val: number): string {
  if (val === null || val === undefined || Math.abs(val) < 0.001) return '';
  return val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// 资产负债表日期：取选定月份的最后一天
// 判断资产负债表是否有实际数据（非全零）
const hasBsData = computed(() => {
  const rows = bsTableData.value;
  return rows.some(r =>
    Math.abs(r.assetEnd) > 0.001 || Math.abs(r.assetStart) > 0.001 ||
    Math.abs(r.liabilityEnd) > 0.001 || Math.abs(r.liabilityStart) > 0.001
  );
});

// 判断利润表是否有实际数据
const hasProfitData = computed(() => {
  const rows = profitStatement.value?.rows || [];
  return rows.some(r => Math.abs(r.amount) > 0.001 || Math.abs(r.monthly_amount) > 0.001);
});

// 判断现金流量表是否有实际数据
const hasCashFlowData = computed(() => {
  const rows = cashFlowStatement.value?.rows || [];
  return rows.some(r => Math.abs(r.amount) > 0.001);
});

const bsDate = computed(() => {
  const m = parseInt(selectedMonth.value);
  const y = selectedYear.value;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}年${String(m).padStart(2, '0')}月${lastDay}日`;
});

// ===== 导出 Excel（动态加载 exceljs，避免阻塞页面渲染） =====
const thinBorder = { style: 'thin', color: { argb: 'FF999999' } };
const borderAll = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
const numFmt = '#,##0.00';

function setCell(ws: any, row: number, col: number, value: any, opts?: any) {
  const cell = ws.getCell(row, col);
  cell.value = value ?? '';
  cell.font = { name: opts?.fontName || '宋体', size: opts?.fontSize || 10, bold: !!opts?.bold };
  cell.alignment = { horizontal: opts?.halign || 'left', vertical: 'middle', wrapText: true };
  if (opts?.numFmt) cell.numFmt = opts.numFmt;
  if (opts?.border !== undefined) cell.border = opts.border;
}

function setHeaderCell(ws: any, row: number, col: number, value: string) {
  setCell(ws, row, col, value, { bold: true, halign: 'center', border: borderAll, fontSize: 10 });
}

async function exportExcel() {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = APP_CONFIG.productName;

  if (activeTab.value === 'profit') {
    buildProfitSheet(wb);
  } else if (activeTab.value === 'cashflow') {
    buildCashFlowSheet(wb);
  } else {
    buildBalanceSheet(wb);
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const titleMap: Record<string, string> = { profit: '利润表', bs: '资产负债表', cashflow: '现金流量表' };
  const title = titleMap[activeTab.value] || '报表';
  const month = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  a.href = url;
  a.download = `${title}_${month}_${time}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildProfitSheet(wb: any) {
  const ws = wb.addWorksheet('利润表');
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.paperSize = 9;

  const year = selectedYear.value;
  const month = selectedMonth.value;
  const dataRows = profitStatement.value?.rows || [];

  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 8;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;

  ws.mergeCells(1, 1, 1, 4);
  setCell(ws, 1, 1, '利润表', { bold: true, halign: 'center', fontSize: 16 });
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, 2);
  ws.mergeCells(2, 3, 2, 3);
  setCell(ws, 2, 1, `编制单位：${companyName.value}`, { halign: 'left', fontSize: 10 });
  setCell(ws, 2, 3, `${year}年${month}期`, { halign: 'center', fontSize: 10 });
  setCell(ws, 2, 4, '单位：元', { halign: 'right', fontSize: 10 });

  setHeaderCell(ws, 3, 1, '项目');
  setHeaderCell(ws, 3, 2, '行次');
  setHeaderCell(ws, 3, 3, '本年累计金额');
  setHeaderCell(ws, 3, 4, '本月金额');
  ws.getRow(3).height = 22;

  dataRows.forEach((r, i) => {
    const rowNum = 4 + i;
    const isHdr = r.is_header;
    setCell(ws, rowNum, 1, r.name, { bold: isHdr, halign: 'left', border: borderAll, fontSize: isHdr ? 11 : 10 });
    setCell(ws, rowNum, 2, isHdr ? '' : r.row_no, { halign: 'center', border: borderAll });
    setCell(ws, rowNum, 3, Number(r.amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: r.is_total });
    setCell(ws, rowNum, 4, Number(r.monthly_amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: r.is_total });
    if (isHdr) ws.getRow(rowNum).height = 20;
    else if (r.is_total) ws.getRow(rowNum).height = 18;
  });

  // 签名行
  addSignatureFooter(ws, dataRows.length + 4);

  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

/** 在 Excel 底部添加签名行 */
function addSignatureFooter(ws: any, startRow: number) {
  ws.mergeCells(startRow, 1, startRow, 2);
  ws.mergeCells(startRow, 3, startRow, 4);
  setCell(ws, startRow, 1, `单位负责人：${signUnitHead.value}`, { halign: 'left', fontSize: 10 });
  setCell(ws, startRow, 3, `会计负责人：${signAccountant.value}`, { halign: 'center', fontSize: 10 });
  ws.mergeCells(startRow + 1, 1, startRow + 1, 2);
  setCell(ws, startRow + 1, 1, `制表人：${signPreparer.value}`, { halign: 'left', fontSize: 10 });
}

function buildBalanceSheet(wb: any) {
  const ws = wb.addWorksheet('资产负债表');
  ws.pageSetup.orientation = 'landscape';
  ws.pageSetup.paperSize = 9;

  const year = selectedYear.value;
  const month = selectedMonth.value;
  const assets = balanceSheet.value?.asset_rows || [];
  const liabs = balanceSheet.value?.liability_rows || [];
  const equits = balanceSheet.value?.equity_rows || [];
  // 右侧：负债 + 3行空白 + 所有者权益
  const rightRows = [...liabs, ...Array(3).fill(null), ...equits];
  const totalDataRows = Math.max(assets.length, rightRows.length);

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 22;
  ws.getColumn(6).width = 6;
  ws.getColumn(7).width = 16;
  ws.getColumn(8).width = 16;

  ws.mergeCells(1, 1, 1, 8);
  setCell(ws, 1, 1, '资产负债表', { bold: true, halign: 'center', fontSize: 16 });
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, 4);
  ws.mergeCells(2, 6, 2, 8);
  setCell(ws, 2, 1, `编制单位：${companyName.value}`, { halign: 'left', fontSize: 10 });
  setCell(ws, 2, 5, `${year}-${month}-30`, { halign: 'center', fontSize: 10 });
  setCell(ws, 2, 6, '单位：元', { halign: 'right', fontSize: 10 });

  setHeaderCell(ws, 3, 1, '资产');
  setHeaderCell(ws, 3, 2, '行次');
  setHeaderCell(ws, 3, 3, '期末余额');
  setHeaderCell(ws, 3, 4, '年初余额');
  setHeaderCell(ws, 3, 5, '负债和所有者(或股东)权益');
  setHeaderCell(ws, 3, 6, '行次');
  setHeaderCell(ws, 3, 7, '期末余额');
  setHeaderCell(ws, 3, 8, '年初余额');
  ws.getRow(3).height = 26;

  for (let i = 0; i < totalDataRows; i++) {
    const rowNum = 4 + i;
    const a = assets[i] || null;
    const r = rightRows[i] || null;

    if (a) {
      const isHdr = a.is_header;
      setCell(ws, rowNum, 1, a.name, { bold: isHdr || a.is_total, halign: 'left', border: borderAll, fontSize: isHdr ? 11 : 10 });
      setCell(ws, rowNum, 2, isHdr ? '' : a.row_no, { halign: 'center', border: borderAll });
      setCell(ws, rowNum, 3, Number(a.amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: a.is_total });
      setCell(ws, rowNum, 4, Number(a.opening_amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: a.is_total });
    }

    if (r) {
      const isHdr = r.is_header;
      setCell(ws, rowNum, 5, r.name, { bold: isHdr || r.is_total, halign: 'left', border: borderAll, fontSize: isHdr ? 11 : 10 });
      setCell(ws, rowNum, 6, isHdr ? '' : r.row_no, { halign: 'center', border: borderAll });
      setCell(ws, rowNum, 7, Number(r.amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: r.is_total });
      setCell(ws, rowNum, 8, Number(r.opening_amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: r.is_total });
    }
  }

  addSignatureFooter(ws, totalDataRows + 4);

  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

function buildCashFlowSheet(wb: any) {
  const ws = wb.addWorksheet('现金流量表');
  ws.pageSetup.orientation = 'portrait';
  ws.pageSetup.paperSize = 9;

  const year = selectedYear.value;
  const month = selectedMonth.value;
  const dataRows = cashFlowStatement.value?.rows || [];

  ws.getColumn(1).width = 42;
  ws.getColumn(2).width = 8;
  ws.getColumn(3).width = 18;

  ws.mergeCells(1, 1, 1, 3);
  setCell(ws, 1, 1, '现金流量表', { bold: true, halign: 'center', fontSize: 16 });
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, 1);
  setCell(ws, 2, 1, `编制单位：${companyName.value}`, { halign: 'left', fontSize: 10 });
  setCell(ws, 2, 2, `${year}年${month}期`, { halign: 'center', fontSize: 10 });
  setCell(ws, 2, 3, '单位：元', { halign: 'right', fontSize: 10 });

  setHeaderCell(ws, 3, 1, '项目');
  setHeaderCell(ws, 3, 2, '行次');
  setHeaderCell(ws, 3, 3, '本期金额');
  ws.getRow(3).height = 22;

  dataRows.forEach((r, i) => {
    const rowNum = 4 + i;
    const isHdr = r.is_header;
    setCell(ws, rowNum, 1, r.name, { bold: isHdr, halign: 'left', border: borderAll, fontSize: isHdr ? 11 : 10 });
    setCell(ws, rowNum, 2, isHdr ? '' : r.row_no, { halign: 'center', border: borderAll });
    setCell(ws, rowNum, 3, Number(r.amount) || 0, { halign: 'right', numFmt: numFmt, border: borderAll, bold: r.is_total });
    if (isHdr) ws.getRow(rowNum).height = 20;
    else if (r.is_total) ws.getRow(rowNum).height = 18;
  });

  addSignatureFooter(ws, dataRows.length + 4);

  ws.views = [{ state: 'frozen', ySplit: 3 }];
}

// ===== 打印 =====
function printReport() {
  window.print();
}
</script>

<template>
  <div class="reports-page">
    <!-- ===== 顶部工具栏 ===== -->
    <div class="rpt-toolbar">
      <div class="rpt-toolbar-left">
        <span class="rpt-toolbar-label">期间</span>
        <el-date-picker
          v-model="period"
          type="month"
          placeholder="选择期间"
          format="YYYY年MM期"
          value-format="YYYY-MM"
          size="small"
          style="width: 140px; margin-right: 16px;"
          @change="onPeriodChange"
        />
        <el-button link type="primary" :icon="Refresh" @click="onRefresh">刷新</el-button>
      </div>
      <div class="rpt-toolbar-right">
        <el-dropdown>
          <el-button size="small">
            打印 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="printReport">打印预览</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown>
          <el-button size="small">
            导出 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="exportExcel">导出 Excel</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <!-- TODO: 以下功能暂未实现，后续迭代 -->
        <!-- <el-button size="small">自定义报表</el-button> -->
        <!-- <el-button size="small">分享</el-button> -->
        <!-- <el-dropdown>
          <el-button size="small">
            切换报表样式 <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
        </el-dropdown> -->
        <!-- <el-button type="primary" size="small">报表重分类</el-button> -->
        <!-- <el-button size="small">重算</el-button> -->
      </div>
    </div>

    <!-- ===== Tab 切换 ===== -->
    <div class="rpt-tabs">
      <button
        :class="['rpt-tab', { active: activeTab === 'bs' }]"
        @click="switchTab('bs')"
      >资产负债表</button>
      <button
        :class="['rpt-tab', { active: activeTab === 'profit' }]"
        @click="switchTab('profit')"
      >利润表</button>
      <button
        :class="['rpt-tab', { active: activeTab === 'cashflow' }]"
        @click="switchTab('cashflow')"
      >现金流量表</button>
    </div>

    <!-- ===== 报表内容面板 ===== -->
    <div class="rpt-content" v-loading="loading">

      <!-- ===== 资产负债表 ===== -->
      <template v-if="activeTab === 'bs'">
        <div class="rpt-form">
          <div class="rpt-form-header">
            <h2 class="rpt-form-title">资产负债表</h2>
            <div class="rpt-form-info">
              <span class="rpt-form-info-left">编制单位：{{ companyName }}</span>
              <span class="rpt-form-info-center">{{ bsDate }}</span>
              <span class="rpt-form-info-right">单位：元</span>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="finance-table">
              <thead>
                <tr>
                  <th style="width: 22%;">资产</th>
                  <th style="width: 5%;">行次</th>
                  <th style="width: 11.5%;">期末余额</th>
                  <th style="width: 11.5%;">年初余额</th>
                  <th style="width: 22%;">负债和所有者(或股东)权益</th>
                  <th style="width: 5%;">行次</th>
                  <th style="width: 11.5%;">期末余额</th>
                  <th style="width: 11.5%;">年初余额</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, idx) in bsTableData" :key="idx">
                  <!-- 左侧：资产 -->
                  <td :class="{
                    'group-title': row.assetIsHeader,
                    'total-row': row.assetIsTotal,
                    'indent-row': row.assetIndent > 0 && !row.assetIsHeader,
                  }" :style="{ paddingLeft: row.assetIndent > 0 && !row.assetIsHeader ? '18px' : '12px' }">
                    {{ row.assetName }}
                  </td>
                  <td class="center-text">{{ row.assetLine }}</td>
                  <td class="number-cell" :class="{ 'total-row': row.assetIsTotal }">{{ formatMoney(row.assetEnd) }}</td>
                  <td class="number-cell" :class="{ 'total-row': row.assetIsTotal }">{{ formatMoney(row.assetStart) }}</td>

                  <!-- 右侧：负债和所有者权益 -->
                  <td :class="{
                    'group-title': row.liabilityIsHeader,
                    'total-row': row.liabilityIsTotal,
                    'indent-row': row.liabilityIndent > 0 && !row.liabilityIsHeader,
                  }" :style="{ paddingLeft: row.liabilityIndent > 0 && !row.liabilityIsHeader ? '18px' : '12px' }">
                    {{ row.liabilityName }}
                    <el-link
                      v-if="row.liabilityName === '其他非流动负债'"
                      type="primary"
                      :underline="false"
                      style="font-size: 12px; margin-left: 8px;"
                    >
                      编辑公式
                    </el-link>
                  </td>
                  <td class="center-text">{{ row.liabilityLine }}</td>
                  <td class="number-cell" :class="{ 'total-row': row.liabilityIsTotal }">{{ formatMoney(row.liabilityEnd) }}</td>
                  <td class="number-cell" :class="{ 'total-row': row.liabilityIsTotal }">{{ formatMoney(row.liabilityStart) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!hasBsData" class="rpt-empty-hint">
            当前期间暂无已过账凭证数据，请确认凭证已过账或切换期间
          </div>
          <div class="rpt-form-footer">
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">单位负责人：</span>
              <span class="rpt-form-footer-line">{{ signUnitHead }}</span>
            </div>
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">会计负责人：</span>
              <span class="rpt-form-footer-line">{{ signAccountant }}</span>
            </div>
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">制表人：</span>
              <span class="rpt-form-footer-line">{{ signPreparer }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== 利润表 ===== -->
      <template v-if="activeTab === 'profit'">
        <div class="rpt-form" style="max-width: 860px;">
          <div class="rpt-form-header">
            <h2 class="rpt-form-title">利润表</h2>
            <div class="rpt-form-info">
              <span class="rpt-form-info-left">编制单位：{{ companyName }}</span>
              <span class="rpt-form-info-center">{{ selectedYear }}年{{ selectedMonth }}期</span>
              <span class="rpt-form-info-right">单位：元</span>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="finance-table">
              <thead>
                <tr>
                  <th style="width: 55%;">项目</th>
                  <th style="width: 8%;">行次</th>
                  <th style="width: 18.5%;">本年累计金额</th>
                  <th style="width: 18.5%;">本月金额</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="profitStatement?.rows?.length">
                  <tr
                    v-for="row in profitStatement.rows"
                    :key="row.row_no"
                  >
                    <td
                      :class="{
                        'group-title': row.is_header,
                        'total-row': row.is_total,
                        'indent-row': row.indent_level > 0 && !row.is_header,
                      }"
                      :style="{ paddingLeft: (row.indent_level * 16 + 12) + 'px' }"
                    >{{ row.name }}</td>
                    <td class="center-text">{{ row.is_header ? '' : row.row_no }}</td>
                    <td class="number-cell" :class="{ 'total-row': row.is_total }">{{ formatMoney(row.amount) }}</td>
                    <td class="number-cell" :class="{ 'total-row': row.is_total }">{{ formatMoney(row.monthly_amount) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-if="!hasProfitData" class="rpt-empty-hint">
            当前期间暂无已过账凭证数据，请确认凭证已过账或切换期间
          </div>
          <div class="rpt-form-footer">
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">单位负责人：</span>
              <span class="rpt-form-footer-line">{{ signUnitHead }}</span>
            </div>
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">会计负责人：</span>
              <span class="rpt-form-footer-line">{{ signAccountant }}</span>
            </div>
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">制表人：</span>
              <span class="rpt-form-footer-line">{{ signPreparer }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== 现金流量表 ===== -->
      <template v-if="activeTab === 'cashflow'">
        <div class="rpt-form" style="max-width: 860px;">
          <div class="rpt-form-header">
            <h2 class="rpt-form-title">现金流量表</h2>
            <div class="rpt-form-info">
              <span class="rpt-form-info-left">编制单位：{{ companyName }}</span>
              <span class="rpt-form-info-center">{{ selectedYear }}年{{ selectedMonth }}期</span>
              <span class="rpt-form-info-right">单位：元</span>
            </div>
          </div>
          <div class="table-wrapper">
            <table class="finance-table">
              <thead>
                <tr>
                  <th style="width: 70%;">项目</th>
                  <th style="width: 10%;">行次</th>
                  <th style="width: 20%;">本期金额</th>
                </tr>
              </thead>
              <tbody>
                <template v-if="cashFlowStatement?.rows?.length">
                  <tr
                    v-for="row in cashFlowStatement.rows"
                    :key="row.row_no + '-' + row.section + '-' + row.name"
                  >
                    <td
                      :class="{
                        'group-title': row.is_header,
                        'total-row': row.is_total,
                        'indent-row': (row.indent_level || 0) > 0 && !row.is_header,
                      }"
                      :style="{ paddingLeft: ((row.indent_level || 0) * 16 + 12) + 'px' }"
                    >{{ row.name }}</td>
                    <td class="center-text">{{ row.is_header ? '' : row.row_no }}</td>
                    <td class="number-cell" :class="{ 'total-row': row.is_total }">{{ formatMoney(row.amount) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div v-if="!hasCashFlowData" class="rpt-empty-hint">
            当前期间暂无非零现金流量数据，请确认已过账凭证中有现金科目发生额
          </div>
          <div class="rpt-form-footer">
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">单位负责人：</span>
              <span class="rpt-form-footer-line">{{ signUnitHead }}</span>
            </div>
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">会计负责人：</span>
              <span class="rpt-form-footer-line">{{ signAccountant }}</span>
            </div>
            <div class="rpt-form-footer-item">
              <span class="rpt-form-footer-label">制表人：</span>
              <span class="rpt-form-footer-line">{{ signPreparer }}</span>
            </div>
          </div>
        </div>
      </template>

    </div>
  </div>
</template>

<style scoped>
/* ===== 整体布局 ===== */
.reports-page {
  display: flex; flex-direction: column; gap: 0;
  height: calc(100vh - 56px); overflow: hidden;
  background: var(--epp-ledger);
}

/* ===== 工具栏 ===== */
.rpt-toolbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 20px;
  background: var(--epp-paper);
  border-bottom: 1px solid var(--epp-line);
  flex-shrink: 0;
  flex-wrap: wrap; gap: 8px;
}
.rpt-toolbar-left {
  display: flex; align-items: center; gap: 8px;
}
.rpt-toolbar-right {
  display: flex; align-items: center; gap: 8px;
  flex-wrap: wrap;
}
.rpt-toolbar-label {
  font-size: 14px; color: var(--epp-ink-sub); font-weight: 500;
  white-space: nowrap;
}

/* ===== Tab 切换 ===== */
.rpt-tabs {
  display: flex; gap: 0;
  padding: 0 20px;
  background: var(--epp-paper);
  border-bottom: 1px solid var(--epp-line);
  flex-shrink: 0;
}
.rpt-tab {
  padding: 10px 24px;
  border: none; border-bottom: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  font-size: 14px; color: var(--epp-ink-sub);
  transition: all 0.2s;
  font-weight: 500;
  position: relative; top: 1px;
}
.rpt-tab:hover { color: var(--epp-ink-text); }
.rpt-tab.active {
  color: var(--epp-accent);
  border-bottom-color: var(--epp-accent);
  font-weight: 600;
}

/* ===== 内容区 ===== */
.rpt-content {
  flex: 1; overflow: auto;
  padding: 20px 24px;
  background: var(--epp-paper);
  margin: 0;
}

/* ===== 报表打印表单容器 ===== */
.rpt-form {
  margin: 0 auto;
  max-width: 1100px;
}

/* ===== 报表表头 ===== */
.rpt-form-header {
  text-align: center;
  margin-bottom: 12px;
}
.rpt-form-title {
  margin: 0 0 10px 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--epp-ink-text);
  letter-spacing: 4px;
}
.rpt-form-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: var(--epp-ink-text);
  padding: 0 4px;
}
.rpt-form-info-left {
  text-align: left;
  flex: 1;
}
.rpt-form-info-center {
  text-align: center;
  flex: 1;
}
.rpt-form-info-right {
  text-align: right;
  flex: 1;
}

/* ===== 无数据提示 ===== */
.rpt-empty-hint {
  text-align: center;
  padding: 20px 0 0;
  font-size: 13px;
  color: var(--epp-ink-sub);
  border-top: 1px dashed var(--epp-line);
  margin-top: 12px;
}

/* ===== 报表表尾 ===== */
.rpt-form-footer {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-top: 24px;
  padding: 16px 8px 12px;
  font-size: 13px;
  color: var(--epp-ink-text);
  border-top: 1px solid var(--epp-line);
  background: #fafbfc;
  gap: 20px;
}
.rpt-form-footer-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 160px;
}
.rpt-form-footer-label {
  font-size: 12px;
  color: var(--epp-ink-sub);
  white-space: nowrap;
}
.rpt-form-footer-line {
  width: 100%;
  border-bottom: 1px solid var(--epp-ink-text);
  min-height: 22px;
  font-size: 13px;
  text-align: center;
  color: var(--epp-ink-text);
  line-height: 22px;
}

/* ===== 财务表格 ===== */
.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--epp-line);
}

.finance-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
  color: var(--epp-ink-sub);
}
.finance-table thead {
  position: sticky; top: 0; z-index: 1;
}
.finance-table th,
.finance-table td {
  border: 1px solid var(--epp-line-light);
  padding: 8px 12px;
  height: 40px;
}
.finance-table th {
  background: #f5f7fa;
  color: var(--epp-ink-text);
  font-weight: 500;
  text-align: center;
  font-size: 13px;
}
.finance-table td {
  padding-left: 12px;
}
.finance-table tbody tr:hover {
  background: #fcfcfd;
}

/* 单元格特定样式 */
.center-text {
  text-align: center;
  color: var(--epp-ink-sub);
}
.number-cell {
  text-align: right;
  font-variant-numeric: tabular-nums;
  padding-right: 12px !important;
}

/* 分类标题行 */
.group-title {
  font-weight: 700;
  color: var(--epp-ink-text);
  background: #f8fafc;
}
/* 合计行 */
.total-row {
  font-weight: 700;
  color: var(--epp-ink-text);
  border-top: 1px solid var(--epp-ink-sub);
  border-bottom: 2px solid var(--epp-ink-sub);
  background: #f8fafc;
}
/* 缩进行 */
.indent-row {
  color: var(--epp-ink-sub);
}

/* ===== Element UI 微调 ===== */
::deep(.el-select .el-input__wrapper) {
  box-shadow: none !important;
}
::deep(.el-select) {
  --el-select-input-focus-border-color: var(--epp-accent);
}
::deep(.el-button--small.is-circle) {
  width: 30px; height: 30px; padding: 0;
}

/* ===== 打印样式 ===== */
@media print {
  .rpt-toolbar, .rpt-tabs { display: none !important; }
  .reports-page { height: auto; overflow: visible; background: #fff; }
  .rpt-content { overflow: visible; padding: 0; margin: 0; }
  .rpt-form { max-width: 100%; }
  .finance-table { font-size: 11px; }
  .finance-table thead { position: static; }
  .finance-table tbody tr:hover { background: transparent; }
  .rpt-form-footer { margin-top: 16px; border-top-color: #000; background: transparent; }
  .rpt-form-footer-line { border-bottom-color: #000; }
}
</style>
