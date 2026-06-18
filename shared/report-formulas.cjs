/**
 * shared/report-formulas.cjs — 报表公式计算（纯函数，无数据库依赖）
 *
 * 同时被 Electron 端（reports.cjs）和浏览器端（mock.ts）引用
 */

/**
 * 根据对方科目编码判断现金流量类别
 * @param {string} subjectCode - 对方科目编码
 * @param {{category: string}} subjectInfo - 对方科目信息 { category }
 * @returns {'operating'|'investing'|'financing'}
 */
function classifyCashFlowCategory(subjectCode, subjectInfo) {
  const scat = subjectInfo?.category || '';
  // 投资活动：长期资产（15xx长期投资、16xx固定资产/在建工程、17xx无形资产）
  if (scat === 'asset' && (subjectCode.startsWith('15') || subjectCode.startsWith('16') || subjectCode.startsWith('17')))
    return 'investing';
  // 筹资活动：借款（20xx短期借款、25xx长期借款、27xx长期应付款）+ 权益
  if ((scat === 'liability' && (subjectCode.startsWith('20') || subjectCode.startsWith('25') || subjectCode.startsWith('27'))) || scat === 'equity')
    return 'financing';
  return 'operating';
}

/**
 * 根据报表模板填充金额（含公式计算）
 *
 * @param {Array} templateRows - 报表模板行数组（来自 REPORT_TEMPLATES）
 * @param {Map} balanceMap - code → { balance, debit, credit } 余额映射（资产负债表用累计余额）
 * @param {Map} openingMap - code → { debit, credit } 年初余额映射
 * @param {Map} [monthlyMap] - code → { balance, ... } 本月余额映射（利润表的"本月数"）
 * @param {Object} [opts] - 可选参数
 * @param {number} [opts.netProfitAmount] - 净利润金额（资产负债表需要引用利润表数据）
 * @returns {Array} 填充好金额的行数组
 */
function fillTemplateAmount(templateRows, balanceMap, openingMap, monthlyMap, opts) {
  const rowMap = new Map();
  const allRows = [];
  const netProfitAmount = (opts && opts.netProfitAmount) || 0;

  const computeAmt = (codes, map, reportType, section) => {
    let amt = 0;
    for (const code of codes) {
      const bal = map.get(code);
      if (!bal) continue;
      if (reportType === 'profit') { amt += Math.abs(bal.balance); }
      else if (section === 'asset') { amt += bal.balance; }
      else { amt += -bal.balance; }
    }
    return amt;
  };

  const computeOpening = (codes, map, reportType, section) => {
    let amt = 0;
    for (const code of codes) {
      const op = map.get(code);
      if (!op) continue;
      const v = Number(op.debit) - Number(op.credit);
      if (reportType === 'profit') { amt += Math.abs(v); }
      else if (section === 'asset') { amt += v; }
      else { amt += -v; }
    }
    return amt;
  };

  // 第一遍：填充科目金额
  for (const t of templateRows) {
    const codes = (t.subject_codes || '').split(',').map(s => s.trim()).filter(Boolean);
    const row = {
      row_no: t.row_no, name: t.name,
      amount: computeAmt(codes, balanceMap, t.report_type, t.section),
      opening_amount: computeOpening(codes, openingMap, t.report_type, t.section),
      is_header: !!t.is_header, is_total: !!t.is_total,
      bold: !!t.bold, indent_level: t.indent_level || 0,
      section: t.section || '', children: [],
    };
    if (monthlyMap) row.monthly_amount = computeAmt(codes, monthlyMap, t.report_type, t.section);
    rowMap.set(t.row_no, row);
    allRows.push(row);
  }

  // 第二遍：计算公式汇总
  const getVal = (r, field) => (r ? (field === 'monthly_amount' ? (r.monthly_amount ?? r.amount) : r.amount) : 0);
  const isProfit = templateRows.length > 0 && templateRows[0].report_type === 'profit';
  const hasMonthly = monthlyMap != null;
  const fields = hasMonthly ? ['amount', 'monthly_amount'] : ['amount'];
  let netProfitRow;

  if (isProfit) {
    // 营业利润 = 营业收入 - 营业成本 - 税金及附加 - 销售费用 - 管理费用 - 财务费用 + 投资收益
    const bpRow = rowMap.get(21);
    fields.forEach(f => {
      if (bpRow) bpRow[f] = getVal(rowMap.get(1), f) - getVal(rowMap.get(2), f) - getVal(rowMap.get(3), f)
        - getVal(rowMap.get(11), f) - getVal(rowMap.get(14), f) - getVal(rowMap.get(18), f)
        + getVal(rowMap.get(20), f);
    });

    // 利润总额 = 营业利润 + 营业外收入 - 营业外支出
    const tpRow = rowMap.get(30);
    fields.forEach(f => {
      if (tpRow) tpRow[f] = getVal(bpRow, f) + getVal(rowMap.get(22), f) - getVal(rowMap.get(24), f);
    });

    // 净利润 = 利润总额 - 所得税费用
    netProfitRow = rowMap.get(32);
    fields.forEach(f => {
      if (netProfitRow) netProfitRow[f] = getVal(tpRow, f) - getVal(rowMap.get(31), f);
    });
  }

  // 资产负债表公式
  const asRow = rowMap.get(21); // 固定资产账面价值 = 固定资产原价 - 累计折旧
  if (asRow) asRow.amount = (rowMap.get(19)?.amount || 0) - (rowMap.get(20)?.amount || 0);

  const caTotal = rowMap.get(15); // 流动资产合计
  if (caTotal) caTotal.amount = [2,3,4,5,6,7,8,9,10].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

  const ncaTotal = rowMap.get(29); // 非流动资产合计
  if (ncaTotal) ncaTotal.amount = [17,18,21,22,23,24,25,26,27,28].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

  const atTotal = rowMap.get(30); // 资产总计
  if (atTotal) atTotal.amount = (caTotal?.amount || 0) + (ncaTotal?.amount || 0);

  const clTotal = rowMap.get(41); // 流动负债合计
  if (clTotal) clTotal.amount = [32,33,34,35,36,37,38,39,40].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

  const nclTotal = rowMap.get(46); // 非流动负债合计
  if (nclTotal) nclTotal.amount = [42,43,44].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

  const liabTotal = rowMap.get(47); // 负债合计
  if (liabTotal) liabTotal.amount = (clTotal?.amount || 0) + (nclTotal?.amount || 0);

  const eqTotal = rowMap.get(53); // 所有者权益合计
  if (eqTotal) {
    eqTotal.amount = [49,50,51,52].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);
    // 加上净利润（来自利润表或外部传入）
    eqTotal.amount += netProfitAmount || (netProfitRow?.amount || 0);
  }

  const totalRow = rowMap.get(54); // 负债和所有者权益总计
  if (totalRow) totalRow.amount = (liabTotal?.amount || 0) + (eqTotal?.amount || 0);

  return allRows;
}

module.exports = { fillTemplateAmount, classifyCashFlowCategory };
