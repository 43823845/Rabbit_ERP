// ponytail: 凭证模板 — 打印/PDF 共用 CSS 与 HTML 生成（已移除 html2canvas PNG 导出）
import { DIGIT_UNITS, digitLineClass, toDigitDisplay } from './amountDigit';
import { toChineseUpper } from './chineseCurrency';
import type { FinanceVoucher } from '../api';

/**
 * 凭证表格标准 CSS（与 VoucherModal.vue scoped 样式保持一致）
 */
export const voucherTableCss = `
/* ========== 凭证表格 ========== */
.vch-tbl-outer { border:2px solid #b0b4c0; border-radius:4px; background:#fff; overflow:hidden; }
.vch-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
.vch-tbl th, .vch-tbl td { border:1px solid #c0c4cc; text-align:center; vertical-align:middle; }
.vch-tbl thead th { background:#f5f7fa; font-weight:500; color:#303133; height:30px; padding:0; }
.vch-tbl tbody td { height:60px; padding:0; }

/* 列宽 */
.col-summary { width:18%; }
.col-account { width:26%; }
.col-amount-grid { width:28%; padding:0 !important; }

/* 摘要/科目单元格 */
.td-summary { text-align:left !important; padding:0 !important; }
.td-subject { text-align:left !important; padding:0 !important; }
.cell-text {
  display:flex; align-items:center; height:60px; font-size:13px; color:#303133;
  padding:0 8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}

/* 金额标题 */
.am-title {
  height:30px; line-height:30px; font-size:13px; font-weight:600;
  color:#606266; background:#f0f2f5; text-align:center;
}

/* 单位行 */
.am-header { display:flex; height:30px; line-height:30px; border-top:1px solid #c0c4cc; }
.am-unit {
  flex:1; text-align:center; font-size:11px; color:#717375;
  border-right:1px solid #dcdfe6; box-sizing:border-box;
}
.am-unit:last-child { border-right:none; }

/* 金额数字格 */
.am-grid { display:flex; height:100%; width:100%; }
.am-val {
  flex:1; display:flex; align-items:center; justify-content:center;
  font-weight:600; font-size:15px; color:#2c3e50;
  border-right:1px solid #e4e7ed; height:100%; box-sizing:border-box;
}
.am-val:last-child { border-right:none; }

/* 分节线 */
.am-unit.line-blue, .am-val.line-blue { border-right:1px solid #409eff !important; }
.am-unit.line-red,  .am-val.line-red  { border-right:1px solid #f56c6c !important; }

/* 合计行 */
.total-row td { background:#fafafa; font-weight:600; }
.total-row .td-summary {
  text-align:left !important; padding-left:15px !important;
  font-size:14px; color:#303133;
}

/* ========== 凭证头部（导出用） ========== */
.vch-exp-hdr {
  display:flex; gap:24px; align-items:center; margin-bottom:12px;
  font-size:13px; color:#303133; padding:8px 0; flex-wrap:wrap;
}
.vch-exp-hdr-item { display:flex; align-items:center; gap:4px; }
.vch-exp-hdr-item .lbl { color:#606266; }
.vch-exp-hdr-item .val { color:#303133; font-weight:500; }

/* ========== 凭证底部（导出用） ========== */
.vch-exp-footer {
  display:flex; gap:32px; margin-top:12px; font-size:13px; color:#606266;
  align-items:center; flex-wrap:wrap;
}
.vch-exp-footer .val { color:#303133; font-weight:500; }
.vch-exp-balance { display:flex; align-items:center; gap:10px; margin-left:auto; }
.vch-exp-balance .val { color:#303133; font-weight:600; }

/* 借贷平衡状态 */
.bal-ok {
  display:inline-block; padding:2px 10px; border-radius:3px;
  font-size:12px; font-weight:500; line-height:20px;
  background:#b7e4a0; color:#2d6d1a; border:1px solid #86c960;
}
.bal-err {
  display:inline-block; padding:2px 10px; border-radius:3px;
  font-size:12px; font-weight:500; line-height:20px;
  background:#f5c5c5; color:#a83131; border:1px solid #e88b8b;
}

/* ========== 导出容器 ========== */
.vch-exp-wrap {
  width:1050px; background:#fff; padding:16px 20px;
  font-family:"Microsoft YaHei","微软雅黑",sans-serif;
}
`;

/**
 * 凭证状态中文
 */
export function voucherStatusLabel(status: string): string {
  const map: Record<string, string> = { draft: '草稿', audited: '已审核', posted: '已过账' };
  return map[status] || status;
}

/**
 * 生成凭证表格 HTML（仅表格 + 备注）
 * 复用于导出和打印
 */
export function buildVoucherTableHtml(v: FinanceVoucher): string {
  const debitTotal = v.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
  const creditTotal = v.entries.reduce((s, e) => s + Number(e.credit || 0), 0);
  const upperTotal = toChineseUpper(debitTotal);
  const unitHeaders = DIGIT_UNITS.map((u, i) => `<div class="am-unit ${digitLineClass(i)}">${u}</div>`).join('');

  const rowsHtml = v.entries.map(e => {
    const subjText = e.subjectCode ? `${e.subjectCode} ${e.subjectName}` : '';
    const dd = toDigitDisplay(Number(e.debit || 0)).map((dv, i) => `<div class="am-val ${digitLineClass(i)}">${dv}</div>`).join('');
    const cd = toDigitDisplay(Number(e.credit || 0)).map((cv, i) => `<div class="am-val ${digitLineClass(i)}">${cv}</div>`).join('');
    return `<tr>
      <td class="td-summary"><span class="cell-text">${e.summary || ''}</span></td>
      <td class="td-subject"><span class="cell-text">${subjText}</span></td>
      <td class="td-amount col-amount-grid"><div class="am-grid">${dd}</div></td>
      <td class="td-amount col-amount-grid"><div class="am-grid">${cd}</div></td>
    </tr>`;
  }).join('');

  const tdB = toDigitDisplay(debitTotal).map((dv, i) => `<div class="am-val ${digitLineClass(i)}">${dv}</div>`).join('');
  const tc = toDigitDisplay(creditTotal).map((cv, i) => `<div class="am-val ${digitLineClass(i)}">${cv}</div>`).join('');

  return `<div class="vch-tbl-outer">
    <table class="vch-tbl">
      <colgroup>
        <col class="col-summary"><col class="col-account"><col class="col-amount-grid"><col class="col-amount-grid">
      </colgroup>
      <thead>
        <tr>
          <th>摘要</th>
          <th>会计科目</th>
          <th>
            <div class="am-title">借方金额</div>
            <div class="am-header">${unitHeaders}</div>
          </th>
          <th>
            <div class="am-title">贷方金额</div>
            <div class="am-header">${unitHeaders}</div>
          </th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td class="td-summary" colspan="2">合计：${upperTotal}</td>
          <td class="td-amount col-amount-grid"><div class="am-grid">${tdB}</div></td>
          <td class="td-amount col-amount-grid"><div class="am-grid">${tc}</div></td>
        </tr>
      </tbody>
    </table>
    <div class="vch-remark" style="padding:8px 12px;font-size:13px;color:#606266;background:#fafafa;border-top:1px solid #c0c4cc;">备注：${v.remark || ''}</div>
  </div>`;
}

/**
 * 生成凭证导出完整 HTML（头部 + 表格 + 底部）
 * 用于 PDF 导出和打印页面
 */
export function buildVoucherExportHtml(v: FinanceVoucher): string {
  const debitTotal = v.entries.reduce((s, e) => s + Number(e.debit || 0), 0);
  const creditTotal = v.entries.reduce((s, e) => s + Number(e.credit || 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.005;
  const statusText = voucherStatusLabel(v.status || '');
  const tableHtml = buildVoucherTableHtml(v);

  return `<div class="vch-exp-wrap">
    <div class="vch-exp-hdr">
      <div class="vch-exp-hdr-item"><span class="lbl">凭证字号：</span><span class="val">${v.voucher_word}-${String(v.voucher_no).padStart(3, '0')} 号</span></div>
      <div class="vch-exp-hdr-item"><span class="lbl">日期：</span><span class="val">${v.voucher_date || ''}</span></div>
      <div class="vch-exp-hdr-item"><span class="lbl">状态：</span><span class="val">${statusText}</span></div>
      <div class="vch-exp-hdr-item" style="flex:1"><span class="lbl">备注：</span><span class="val">${v.remark || ''}</span></div>
    </div>
    ${tableHtml}
    <div class="vch-exp-footer">
      <div><span class="lbl">制单人：</span><span class="val">${v.maker || '—'}</span></div>
      <div><span class="lbl">记账人：</span><span class="val">${v.bookkeeper || '—'}</span></div>
      <div class="vch-exp-balance">
        借 <span class="val">${debitTotal.toFixed(2)}</span>
        &nbsp; 贷 <span class="val">${creditTotal.toFixed(2)}</span>
        <span class="${balanced ? 'bal-ok' : 'bal-err'}">${balanced ? '借贷平衡' : '借贷不平'}</span>
      </div>
    </div>
  </div>`;
}
