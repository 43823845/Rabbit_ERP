/**
 * database/reports.cjs — 财务报表查询
 *
 * 负责所有财务报告的查询与计算：
 *   - 科目余额表、总账、明细账、试算平衡
 *   - 利润表、资产负债表、现金流量表
 *   - 数量金额账簿、跨年数据完整性检查
 */
const { REPORT_TEMPLATES } = require('./schema.cjs');
const { fillTemplateAmount, classifyCashFlowCategory } = require('../../../shared/report-formulas.cjs');

/**
 * 将报表方法挂载到 FinanceDatabase 原型
 */
function applyReportMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  // ==================== 科目余额表 ====================

  proto.getSubjectBalance = function ({ period, subjectCode, category }) {
    if (!this.db) return [];
    this._ensureBookId();

    let conds = ' AND v.book_id = ?';
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (subjectCode) { conds += ' AND e.subject_code = ?'; params.push(subjectCode); }
    if (category) {
      conds += ' AND e.subject_code IN (SELECT code FROM bd_subject WHERE category = ? AND book_id = ?)';
      params.push(category, this.currentBookId);
    }

    const openingPeriod = period ? (period.substring(0, 4) + '-01') : null;

    const rows = this.db.prepare(`
      SELECT e.subject_code AS code, MAX(e.subject_name) AS name,
             SUM(e.debit) AS debit_amount, SUM(e.credit) AS credit_amount
      FROM gl_voucher_entry e
      JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE v.status = 'posted' ${conds}
      GROUP BY e.subject_code ORDER BY e.subject_code
    `).all(...params);

    const openings = openingPeriod ? this.getOpeningBalances(openingPeriod) : [];
    const self = this;

    return rows.map(row => {
      const opening = openings.find(o => o.subject_code === row.code);
      const opDebit = opening?.debit || 0;
      const opCredit = opening?.credit || 0;
      const dAmt = row.debit_amount;
      const cAmt = row.credit_amount;

      const subj = self.db.prepare('SELECT direction FROM bd_subject WHERE code = ? AND book_id = ?').get(row.code, self.currentBookId);
      const direction = subj?.direction || 'debit';
      const balance = direction === 'debit'
        ? opDebit - opCredit + dAmt - cAmt
        : opCredit - opDebit + cAmt - dAmt;

      return { code: row.code, name: row.name, openingDebit: opDebit, openingCredit: opCredit,
        debitAmount: dAmt, creditAmount: cAmt, balance, direction };
    });
  };

  // ==================== 总账 ====================

  proto.getGeneralLedger = function ({ subjectCode, period, page = 1, pageSize = 50 }) {
    if (!this.db) return { rows: [], total: 0 };
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (subjectCode) { conds += ' AND e.subject_code = ?'; params.push(subjectCode); }

    let total = 0;
    try {
      total = this.db.prepare(
        `SELECT COUNT(*) as total FROM (SELECT DISTINCT e.subject_code FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id WHERE 1=1 ${conds})`
      ).get(...params)?.total || 0;
    } catch (_) { total = 0; }

    const offset = (page - 1) * pageSize;
    const rows = this.db.prepare(`
      SELECT e.subject_code AS code, e.subject_name AS name,
             SUM(e.debit) AS total_debit, SUM(e.credit) AS total_credit
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE 1=1 ${conds}
      GROUP BY e.subject_code ORDER BY e.subject_code
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return { rows, total };
  };

  // ==================== 明细账（含承前页/过次页） ====================

  proto.getDetailLedger = function ({ subjectCode, period, startDate, endDate, page = 1, pageSize = 50 }) {
    if (!this.db) return { rows: [], total: 0, carryForward: 0, carriedForward: 0 };
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (subjectCode) { conds += ' AND e.subject_code = ?'; params.push(subjectCode); }
    if (startDate) { conds += ' AND v.voucher_date >= ?'; params.push(startDate); }
    if (endDate) { conds += ' AND v.voucher_date <= ?'; params.push(endDate); }

    const { total } = this.db.prepare(
      `SELECT COUNT(*) as total FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id WHERE 1=1 ${conds}`
    ).get(...params);

    const offset = (page - 1) * pageSize;
    const rows = this.db.prepare(`
      SELECT v.voucher_date, v.voucher_word, v.voucher_no, v.remark AS voucher_remark,
             e.summary, e.subject_code, e.subject_name, e.debit, e.credit,
             e.quantity, e.unit_price, e.unit
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE 1=1 ${conds}
      ORDER BY v.voucher_date, v.voucher_no, e.line_no
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    const self = this;
    let carryForward = 0;

    // 先获取科目方向与期初余额（承前页须包含期初余额）
    const subjDir = subjectCode
      ? self.db.prepare('SELECT direction FROM bd_subject WHERE code = ? AND book_id = ?').get(subjectCode, self.currentBookId)
      : null;
    const isDebitDir = subjDir?.direction === 'debit';

    if (subjectCode) {
      // 期初余额：取 year-period 的年初余额
      const openPeriod = period ? (period.substring(0, 4) + '-01') : (startDate ? startDate.substring(0, 4) + '-01' : null);
      if (openPeriod) {
        const openings = this.getOpeningBalances(openPeriod);
        const op = openings.find(o => o.subject_code === subjectCode);
        if (op) {
          carryForward = isDebitDir
            ? (op.debit || 0) - (op.credit || 0)
            : (op.credit || 0) - (op.debit || 0);
        }
      }
    }

    if (subjectCode && page > 1) {
      const prev = self.db.prepare(`
        SELECT SUM(e.debit) AS total_debit, SUM(e.credit) AS total_credit
        FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id
        WHERE 1=1 ${conds} LIMIT ?
      `).get(...params, offset);
      if (prev) {
        carryForward += isDebitDir
          ? (prev.total_debit || 0) - (prev.total_credit || 0)
          : (prev.total_credit || 0) - (prev.total_debit || 0);
      }
    }

    let carriedForward = carryForward;
    for (const r of rows) {
      carriedForward += isDebitDir
        ? Number(r.debit || 0) - Number(r.credit || 0)
        : Number(r.credit || 0) - Number(r.debit || 0);
    }

    return { rows, total, carryForward, carriedForward };
  };

  // ==================== 试算平衡 ====================

  proto.getTrialBalance = function (period) {
    const balances = this.getSubjectBalance({ period });
    let tdo = 0, tco = 0, tda = 0, tca = 0, tde = 0, tce = 0;
    const rows = balances.map(row => {
      tdo += row.openingDebit; tco += row.openingCredit;
      tda += row.debitAmount; tca += row.creditAmount;
      // 按科目方向正确归类期末余额
      const isDebitDir = row.direction === 'debit';
      const ed = isDebitDir ? Math.max(0, row.balance) : Math.max(0, -row.balance);
      const ec = isDebitDir ? Math.max(0, -row.balance) : Math.max(0, row.balance);
      tde += ed; tce += ec;
      return { ...row, endingDebit: ed, endingCredit: ec };
    });
    return { rows, totals: { openingDebit: tdo, openingCredit: tco, amountDebit: tda, amountCredit: tca, endingDebit: tde, endingCredit: tce } };
  };

  // ==================== 利润表 ====================

  proto.getProfitStatement = function (period) {
    if (!this.db) return { company_name: '', period, rows: [] };
    this._ensureBookId();
    this._seedReportTemplates();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';
    const yr = parseInt(cp.substring(0, 4));
    const mn = parseInt(cp.substring(5, 7));
    const yrStart = yr + '-01';

    const templateRows = this.db.prepare(
      'SELECT * FROM report_template WHERE book_id = ? AND report_type = ? ORDER BY display_order'
    ).all(this.currentBookId, 'profit');

    // 本年累计：按月累加发生额，期初余额只取一次，月末重新计算余额
    const cumMap = new Map();
    const yrOpenings = this.getOpeningBalances(yrStart);
    for (let m = 1; m <= mn; m++) {
      const mp = yr + '-' + String(m).padStart(2, '0');
      const mbs = this.getSubjectBalance({ period: mp });
      for (const b of mbs) {
        if (!cumMap.has(b.code)) {
          // 首次遇到该科目：保存期初余额（来自年初），发生额取当月值
          const yOp = yrOpenings.find(o => o.subject_code === b.code);
          cumMap.set(b.code, {
            code: b.code, name: b.name,
            openingDebit: yOp?.debit || 0,
            openingCredit: yOp?.credit || 0,
            debitAmount: b.debitAmount || 0,
            creditAmount: b.creditAmount || 0,
          });
        } else {
          // 后续月份：只累加发生额，不重复加期初
          const p = cumMap.get(b.code);
          p.debitAmount += b.debitAmount || 0;
          p.creditAmount += b.creditAmount || 0;
        }
      }
    }
    // 按科目方向重新计算累计余额
    for (const [code, item] of cumMap) {
      const subj = this.db.prepare('SELECT direction FROM bd_subject WHERE code = ? AND book_id = ?').get(code, this.currentBookId);
      item.balance = subj?.direction === 'debit'
        ? item.openingDebit - item.openingCredit + item.debitAmount - item.creditAmount
        : item.openingCredit - item.openingDebit + item.creditAmount - item.debitAmount;
    }

    const monthlyMap = new Map(
      this.getSubjectBalance({ period: cp }).map(b => [b.code, b])
    );
    const opMap = new Map(
      this.getOpeningBalances(yrStart).map(o => [o.subject_code, o])
    );

    const rows = this._fillTemplateAmount(templateRows, cumMap, opMap, monthlyMap);
    rows.forEach(r => { if (r.monthly_amount === undefined) r.monthly_amount = 0; });
    return { company_name: book?.company_name || '', period: cp, rows };
  };

  // ==================== 资产负债表 ====================

  proto.getBalanceSheet = function (period) {
    if (!this.db) return { company_name: '', period, asset_rows: [], liability_rows: [], equity_rows: [] };
    this._ensureBookId();
    this._seedReportTemplates();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';
    const yrStart = cp.substring(0, 4) + '-01';

    const templateRows = this.db.prepare(
      'SELECT * FROM report_template WHERE book_id = ? AND report_type = ? ORDER BY display_order'
    ).all(this.currentBookId, 'balance');

    const balances = this._getCumulativeSubjectBalance(cp, yrStart);
    const balMap = new Map(balances.map(b => [b.code, b]));
    const opMap = new Map(
      this.getOpeningBalances(yrStart).map(o => [o.subject_code, o])
    );

    // 获取净利润（跨报表引用：所有者权益需包含当期净利润）
    let netProfit = 0;
    try {
      const ps = this.getProfitStatement(cp);
      if (!ps || !ps.rows) throw new Error('利润表数据为空');
      const npRow = ps.rows.find(r => r.row_no === 32);
      if (!npRow) throw new Error('利润表中未找到净利润行(row_no=32)');
      netProfit = npRow.amount;
    } catch (e) {
      throw new Error(`资产负债表计算失败：无法获取当期净利润（${e.message}），请先生成利润表`);
    }

    const allRows = this._fillTemplateAmount(templateRows, balMap, opMap, null, { netProfitAmount: netProfit });
    return {
      company_name: book?.company_name || '', period: cp,
      asset_rows: allRows.filter(r => r.section === 'asset'),
      liability_rows: allRows.filter(r => r.section === 'liability'),
      equity_rows: allRows.filter(r => r.section === 'equity'),
    };
  };

  // ==================== 现金流量表 ====================

  proto.getCashFlowStatement = function (period) {
    if (!this.db) return { company_name: '', period, rows: [] };
    this._ensureBookId();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const yrNum = parseInt(period.substring(0, 4));

    const cashSubjects = this.db.prepare(
      'SELECT code FROM bd_subject WHERE book_id = ? AND is_cash = 1 AND enabled = 1'
    ).all(this.currentBookId).map(s => s.code);

    if (cashSubjects.length === 0) return { company_name: book?.company_name || '', period, rows: [] };

    const cph = cashSubjects.map(() => '?').join(',');
    const cashEntries = this.db.prepare(`
      SELECT v.period, v.voucher_date, v.voucher_word, v.voucher_no,
             e.subject_code, e.subject_name, e.debit, e.credit, e.summary, v.id AS voucher_id
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id
      WHERE v.book_id=? AND v.status='posted' AND v.period>=? AND v.period<=? AND e.subject_code IN (${cph})
      ORDER BY v.period, v.voucher_date, v.voucher_no
    `).all(this.currentBookId, yrNum + '-01', period, ...cashSubjects);

    const vids = [...new Set(cashEntries.map(e => e.voucher_id))];
    if (vids.length === 0) return { company_name: book?.company_name || '', period, rows: [] };

    const vp = vids.map(() => '?').join(',');
    const allEntries = this.db.prepare(
      `SELECT e.*, v.period FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id WHERE e.voucher_id IN (${vp}) ORDER BY e.voucher_id, e.line_no`
    ).all(...vids);

    const voucherGroups = new Map();
    for (const e of allEntries) {
      if (!voucherGroups.has(e.voucher_id)) voucherGroups.set(e.voucher_id, []);
      voucherGroups.get(e.voucher_id).push(e);
    }

    let opIn = 0, opOut = 0, invIn = 0, invOut = 0, finIn = 0, finOut = 0;
    const self = this;

    for (const ce of cashEntries) {
      const ves = voucherGroups.get(ce.voucher_id) || [];
      const cashCode = ce.subject_code;
      const isInflow = Number(ce.debit || 0) > 0;
      const absFlow = Math.abs(Number(ce.debit || 0) - Number(ce.credit || 0));

      const counter = ves.filter(e => e.subject_code !== cashCode && !cashSubjects.includes(e.subject_code));
      let cat = 'operating';
      for (const c of counter) {
        const subj = self.db.prepare('SELECT category FROM bd_subject WHERE code = ? AND book_id = ?').get(c.subject_code, self.currentBookId);
        const result = classifyCashFlowCategory(c.subject_code, subj);
        if (result !== 'operating') cat = result;
      }

      if (cat === 'investing') { if (isInflow) invIn += absFlow; else invOut += absFlow; }
      else if (cat === 'financing') { if (isInflow) finIn += absFlow; else finOut += absFlow; }
      else { if (isInflow) opIn += absFlow; else opOut += absFlow; }
    }

    const opNet = opIn - opOut, invNet = invIn - invOut, finNet = finIn - finOut;
    const totalNet = opNet + invNet + finNet;

    const rows = [
      // === 经营活动 ===
      { row_no:1, name:'一、经营活动产生的现金流量：', is_header:true, bold:true, indent_level:0, section:'operating', amount:0 },
      { row_no:2, name:'销售商品、提供劳务收到的现金', bold:false, indent_level:0, section:'operating', amount:opIn },
      { row_no:3, name:'收到其他与经营活动有关的现金', bold:false, indent_level:0, section:'operating', amount:0 },
      { row_no:5, name:'经营活动现金流入小计', is_total:true, bold:true, indent_level:0, section:'operating', amount:opIn },
      { row_no:6, name:'购买商品、接受劳务支付的现金', bold:false, indent_level:0, section:'operating', amount:opOut },
      { row_no:7, name:'支付给职工以及为职工支付的现金', bold:false, indent_level:0, section:'operating', amount:0 },
      { row_no:8, name:'支付的各项税费', bold:false, indent_level:0, section:'operating', amount:0 },
      { row_no:9, name:'支付其他与经营活动有关的现金', bold:false, indent_level:0, section:'operating', amount:0 },
      { row_no:10, name:'经营活动现金流出小计', is_total:true, bold:true, indent_level:0, section:'operating', amount:opOut },
      { row_no:11, name:'经营活动产生的现金流量净额', is_total:true, bold:true, indent_level:0, section:'operating', amount:opNet },
      // === 投资活动 ===
      { row_no:13, name:'二、投资活动产生的现金流量：', is_header:true, bold:true, indent_level:0, section:'investing', amount:0 },
      { row_no:14, name:'收回短期投资、长期债券投资和长期股权投资收到的现金', bold:false, indent_level:0, section:'investing', amount:0 },
      { row_no:15, name:'取得投资收益收到的现金', bold:false, indent_level:0, section:'investing', amount:0 },
      { row_no:16, name:'投资活动现金流入小计', is_total:true, bold:true, indent_level:0, section:'investing', amount:invIn },
      { row_no:18, name:'购建固定资产、无形资产和其他非流动资产支付的现金', bold:false, indent_level:0, section:'investing', amount:invOut },
      { row_no:20, name:'投资活动现金流出小计', is_total:true, bold:true, indent_level:0, section:'investing', amount:invOut },
      { row_no:21, name:'投资活动产生的现金流量净额', is_total:true, bold:true, indent_level:0, section:'investing', amount:invNet },
      // === 筹资活动 ===
      { row_no:23, name:'三、筹资活动产生的现金流量：', is_header:true, bold:true, indent_level:0, section:'financing', amount:0 },
      { row_no:24, name:'取得借款收到的现金', bold:false, indent_level:0, section:'financing', amount:finIn },
      { row_no:25, name:'吸收投资者投资收到的现金', bold:false, indent_level:0, section:'financing', amount:0 },
      { row_no:26, name:'筹资活动现金流入小计', is_total:true, bold:true, indent_level:0, section:'financing', amount:finIn },
      { row_no:28, name:'偿还借款本金支付的现金', bold:false, indent_level:0, section:'financing', amount:finOut },
      { row_no:29, name:'分配利润支付的现金', bold:false, indent_level:0, section:'financing', amount:0 },
      { row_no:30, name:'筹资活动现金流出小计', is_total:true, bold:true, indent_level:0, section:'financing', amount:finOut },
      { row_no:31, name:'筹资活动产生的现金流量净额', is_total:true, bold:true, indent_level:0, section:'financing', amount:finNet },
      // === 汇总 ===
      { row_no:33, name:'四、现金及现金等价物净增加额', is_total:true, bold:true, indent_level:0, section:'summary', amount:totalNet },
    ];

    return { company_name: book?.company_name || '', period, rows };
  };

  // ==================== 数量金额账簿 ====================

  proto.getQuantityDetailLedger = function ({ subjectCode, period, startDate, endDate, page = 1, pageSize = 50 }) {
    if (!this.db) return { rows: [], total: 0 };
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (subjectCode) { conds += ' AND e.subject_code = ?'; params.push(subjectCode); }
    if (startDate) { conds += ' AND v.voucher_date >= ?'; params.push(startDate); }
    if (endDate) { conds += ' AND v.voucher_date <= ?'; params.push(endDate); }

    const { total } = this.db.prepare(
      `SELECT COUNT(*) as total FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id WHERE 1=1 ${conds}`
    ).get(...params);

    const offset = (page - 1) * pageSize;
    const rows = this.db.prepare(`
      SELECT v.voucher_date, v.voucher_word, v.voucher_no, v.remark AS voucher_remark,
             e.summary, e.subject_code, e.subject_name, e.debit, e.credit,
             e.quantity, e.unit_price, e.unit
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id
      WHERE 1=1 ${conds}
      ORDER BY v.voucher_date, v.voucher_no, e.line_no
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return { rows, total };
  };

  proto.getQuantityGeneralLedger = function ({ subjectCode, period, page = 1, pageSize = 50 }) {
    if (!this.db) return { rows: [], total: 0 };
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (subjectCode) { conds += ' AND e.subject_code = ?'; params.push(subjectCode); }

    const allRows = this.db.prepare(`
      SELECT e.subject_code AS code, e.subject_name AS name,
             SUM(e.debit) AS total_debit, SUM(e.credit) AS total_credit,
             SUM(CASE WHEN e.debit>0 THEN e.quantity ELSE 0 END) AS in_quantity,
             SUM(CASE WHEN e.credit>0 THEN e.quantity ELSE 0 END) AS out_quantity,
             SUM(e.quantity) AS net_quantity, e.unit
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id=e.voucher_id
      WHERE 1=1 ${conds}
      GROUP BY e.subject_code ORDER BY e.subject_code
    `).all(...params);

    const total = allRows.length;
    if (pageSize > 0) {
      const offset = (page - 1) * pageSize;
      return { rows: allRows.slice(offset, offset + pageSize), total };
    }
    return { rows: allRows, total };
  };

  // ==================== 跨年完整性检查 ====================

  proto.checkYearEndIntegrity = function (currentPeriod) {
    if (!this.db) return { yearEnd: '', nextYearOpen: '', matched: 0, mismatched: 0, details: [] };
    this._ensureBookId();

    const period = currentPeriod || '2026-12';
    const yr = parseInt(period.substring(0, 4));
    const ny = String(yr + 1);
    const yePeriod = yr + '-12';
    const yrStart = yr + '-01';
    const nyStart = ny + '-01';

    const yeBalances = this._getCumulativeSubjectBalance(yePeriod, yrStart);
    const nyOpenings = this.getOpeningBalances(nyStart);

    const details = [];
    let matched = 0, mismatched = 0;
    const balMap = new Map(yeBalances.map(b => [b.code, b]));

    for (const op of nyOpenings) {
      const bal = balMap.get(op.subject_code);
      const opBal = op.debit - op.credit;
      const yeBal = bal ? bal.balance : 0;
      const diff = Math.abs(yeBal - opBal);
      if (diff < 0.01) { matched++; } else {
        mismatched++;
        details.push({ code: op.subject_code, name: op.subject_name,
          yearEndBalance: Math.round(yeBal * 100) / 100,
          nextYearOpening: Math.round(opBal * 100) / 100,
          diff: Math.round(diff * 100) / 100 });
      }
    }

    for (const [code, bal] of balMap) {
      if (Math.abs(bal.balance) < 0.01) continue;
      if (!nyOpenings.find(o => o.subject_code === code)) {
        mismatched++;
        details.push({ code, name: bal.name,
          yearEndBalance: Math.round(bal.balance * 100) / 100,
          nextYearOpening: 0, diff: Math.abs(Math.round(bal.balance * 100) / 100) });
      }
    }

    return { yearEnd: yePeriod, nextYearOpen: nyStart, matched, mismatched, details };
  };

  // ==================== 所有者权益变动表 ====================

  proto.getEquityChangeStatement = function (period) {
    if (!this.db) return { company_name: '', period, rows: [] };
    this._ensureBookId();
    this._seedReportTemplates();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';
    const yr = parseInt(cp.substring(0, 4));
    const yrStart = yr + '-01';

    // 获取本年期初余额（即上年年末余额）
    const yearOpenings = this.getOpeningBalances(yrStart);
    const opMap = new Map(yearOpenings.map(o => [o.subject_code, o]));

    // 获取本期净利润
    let netProfit = 0;
    try {
      const ps = this.getProfitStatement(cp);
      if (ps && ps.rows) {
        const npRow = ps.rows.find(r => r.row_no === 32);
        if (npRow) netProfit = npRow.amount || 0;
      }
    } catch (e) { netProfit = 0; }

    // 计算期初余额辅助函数
    const getOpening = (code) => {
      const op = opMap.get(code);
      return op ? (Number(op.debit) - Number(op.credit)) : 0;
    };

    const rows = [
      { row_no: 1, name: '一、上年年末余额', is_header: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 },
    ];

    // 上年年末各科目余额（即本年年初余额）
    const lastYearOp4001 = getOpening('4001');
    const lastYearOp4002 = getOpening('4002');
    const lastYearOp4101 = getOpening('4101');
    const lastYearOp4104 = getOpening('4104');

    rows.push({ row_no: 2, name: '实收资本（或股本）', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: lastYearOp4001, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: lastYearOp4001 });
    rows.push({ row_no: 3, name: '资本公积', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: lastYearOp4002, surplus_reserve: 0, undistributed_profit: 0, total: lastYearOp4002 });
    rows.push({ row_no: 4, name: '盈余公积', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: lastYearOp4101, undistributed_profit: 0, total: lastYearOp4101 });
    rows.push({ row_no: 5, name: '未分配利润', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: lastYearOp4104, total: lastYearOp4104 });
    rows.push({ row_no: 6, name: '上年年末余额合计', is_total: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: lastYearOp4001 + lastYearOp4002 + lastYearOp4101 + lastYearOp4104 });

    rows.push({ row_no: 7, name: '二、本年年初余额', is_header: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 8, name: '实收资本（或股本）', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: lastYearOp4001, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: lastYearOp4001 });
    rows.push({ row_no: 9, name: '资本公积', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: lastYearOp4002, surplus_reserve: 0, undistributed_profit: 0, total: lastYearOp4002 });
    rows.push({ row_no: 10, name: '盈余公积', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: lastYearOp4101, undistributed_profit: 0, total: lastYearOp4101 });
    rows.push({ row_no: 11, name: '未分配利润', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: lastYearOp4104, total: lastYearOp4104 });
    const openingTotal = lastYearOp4001 + lastYearOp4002 + lastYearOp4101 + lastYearOp4104;
    rows.push({ row_no: 12, name: '年初余额合计', is_total: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: openingTotal });

    // 本年增减变动
    rows.push({ row_no: 13, name: '三、本年增减变动金额', is_header: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });

    // 净利润影响未分配利润
    const npChange = netProfit;
    rows.push({ row_no: 14, name: '（一）净利润', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: npChange, total: npChange });
    rows.push({ row_no: 15, name: '（二）其他综合收益', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 16, name: '（三）利润分配', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 17, name: '1.提取盈余公积', is_header: false, is_total: false, bold: false, indent_level: 1, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 18, name: '2.对所有者（或股东）的分配', is_header: false, is_total: false, bold: false, indent_level: 1, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 19, name: '（四）所有者权益内部结转', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 20, name: '本年增减变动合计', is_total: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: npChange });

    // 年末余额 = 年初 + 变动
    const end4001 = lastYearOp4001;
    const end4002 = lastYearOp4002;
    const end4101 = lastYearOp4101;
    const end4104 = lastYearOp4104 + npChange;

    rows.push({ row_no: 21, name: '四、本年年末余额', is_header: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: 0 });
    rows.push({ row_no: 22, name: '实收资本（或股本）', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: end4001, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: end4001 });
    rows.push({ row_no: 23, name: '资本公积', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: end4002, surplus_reserve: 0, undistributed_profit: 0, total: end4002 });
    rows.push({ row_no: 24, name: '盈余公积', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: end4101, undistributed_profit: 0, total: end4101 });
    rows.push({ row_no: 25, name: '未分配利润', is_header: false, is_total: false, bold: false, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: end4104, total: end4104 });
    const endTotal = end4001 + end4002 + end4101 + end4104;
    rows.push({ row_no: 26, name: '年末余额合计', is_total: true, bold: true, indent_level: 0, paid_in_capital: 0, capital_reserve: 0, surplus_reserve: 0, undistributed_profit: 0, total: endTotal });

    return { company_name: book?.company_name || '', period: cp, rows };
  };

  // ==================== 应交税费明细表 ====================

  proto.getTaxPayableDetail = function (period) {
    if (!this.db) return { company_name: '', period, rows: [] };
    this._ensureBookId();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';
    const yrStart = cp.substring(0, 4) + '-01';

    // 查询应交税费(2221)下的所有明细科目
    const taxSubjects = this.db.prepare(
      "SELECT code, name FROM bd_subject WHERE book_id = ? AND code LIKE '2221%' AND enabled = 1 ORDER BY code"
    ).all(this.currentBookId);

    if (taxSubjects.length === 0) {
      // 如果没有明细科目，至少包含一级科目
      const main = this.db.prepare(
        "SELECT code, name FROM bd_subject WHERE book_id = ? AND code = '2221' AND enabled = 1"
      ).get(this.currentBookId);
      if (main) taxSubjects.push(main);
    }

    const balances = this.getSubjectBalance({ period: cp });
    const openings = this.getOpeningBalances(yrStart);
    const balMap = new Map(balances.map(b => [b.code, b]));
    const opMap = new Map(openings.map(o => [o.subject_code, o]));

    const rows = taxSubjects.map(s => {
      const bal = balMap.get(s.code);
      const op = opMap.get(s.code);
      const opBalance = op ? (Number(op.debit) - Number(op.credit)) : 0;
      const dAmt = bal?.debitAmount || 0;
      const cAmt = bal?.creditAmount || 0;
      // 应交税费是贷方科目，余额 = 期初贷方 + 本期贷方 - 本期借方
      const endingBal = -opBalance + cAmt - dAmt;

      return {
        tax_code: s.code,
        tax_name: s.name,
        opening_balance: Math.round(-opBalance * 100) / 100,
        current_debit: Math.round(dAmt * 100) / 100,
        current_credit: Math.round(cAmt * 100) / 100,
        ending_balance: Math.round(endingBal * 100) / 100,
      };
    });

    return { company_name: book?.company_name || '', period: cp, rows };
  };

  // ==================== 费用明细汇总表 ====================

  proto.getExpenseSummary = function (period) {
    if (!this.db) return { company_name: '', period, rows: [] };
    this._ensureBookId();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';
    const yr = parseInt(cp.substring(0, 4));

    // 获取所有费用类科目 (expense category)
    const expenseSubjects = this.db.prepare(
      "SELECT code, name FROM bd_subject WHERE book_id = ? AND category = 'expense' AND enabled = 1 ORDER BY code"
    ).all(this.currentBookId);

    // 当期余额
    const monthBalances = this.getSubjectBalance({ period: cp });
    const monthMap = new Map(monthBalances.map(b => [b.code, b]));

    // 本年累计（年初至今）
    const yrStart = yr + '-01';
    const cumBalances = this._getCumulativeSubjectBalance(cp, yrStart);
    const cumMap = new Map(cumBalances.map(b => [b.code, b]));

    const rows = expenseSubjects.map(s => {
      const mb = monthMap.get(s.code);
      const cb = cumMap.get(s.code);
      const periodAmt = mb ? Math.abs(mb.balance) : 0;
      const yearAmt = cb ? Math.abs(cb.balance) : 0;

      return {
        subject_code: s.code,
        subject_name: s.name,
        period_amount: Math.round(periodAmt * 100) / 100,
        year_amount: Math.round(yearAmt * 100) / 100,
      };
    });

    return { company_name: book?.company_name || '', period: cp, rows };
  };

  // ==================== 应收账款账龄分析 ====================

  proto.getReceivableAging = function (period) {
    return this._getAgingAnalysis(period, 'receivable');
  };

  // ==================== 应付账款账龄分析 ====================

  proto.getPayableAging = function (period) {
    return this._getAgingAnalysis(period, 'payable');
  };

  /**
   * 通用账龄分析（应收账款/应付账款）
   * @param {'receivable'|'payable'} type
   */
  proto._getAgingAnalysis = function (period, type) {
    if (!this.db) return { company_name: '', period, type, rows: [], summary: { within_30: 0, within_90: 0, within_180: 0, within_365: 0, over_365: 0, total: 0 } };
    this._ensureBookId();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';

    // 应收账款 = 1122, 应付账款 = 2202
    const subjectCode = type === 'receivable' ? '1122' : '2202';
    const endDate = cp + '-31';

    const entries = this.db.prepare(`
      SELECT e.subject_code, e.subject_name, v.voucher_date, v.voucher_word, v.voucher_no,
             e.summary, e.debit, e.credit
      FROM gl_voucher_entry e
      JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE v.book_id = ? AND v.status = 'posted'
        AND e.subject_code LIKE ?
        AND v.voucher_date <= ?
      ORDER BY v.voucher_date DESC
    `).all(this.currentBookId, subjectCode + '%', endDate);

    const rows = [];
    const summary = { within_30: 0, within_90: 0, within_180: 0, within_365: 0, over_365: 0, total: 0 };

    const nowDate = new Date(parseInt(cp.substring(0, 4)), parseInt(cp.substring(5, 7)), 0);

    for (const e of entries) {
      const amt = type === 'receivable'
        ? Number(e.debit || 0) - Number(e.credit || 0)
        : Number(e.credit || 0) - Number(e.debit || 0);

      if (Math.abs(amt) < 0.01) continue;

      const entryDate = new Date(e.voucher_date);
      const daysDiff = Math.floor((nowDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

      let bucket;
      if (daysDiff <= 30) bucket = '30天内';
      else if (daysDiff <= 90) bucket = '31-90天';
      else if (daysDiff <= 180) bucket = '91-180天';
      else if (daysDiff <= 365) bucket = '181-365天';
      else bucket = '365天以上';

      rows.push({
        subject_code: e.subject_code,
        subject_name: e.subject_name,
        voucher_date: e.voucher_date,
        voucher_word: e.voucher_word,
        voucher_no: e.voucher_no,
        summary: e.summary,
        amount: Math.round(amt * 100) / 100,
        days_outstanding: daysDiff,
        aging_bucket: bucket,
      });

      if (daysDiff <= 30) summary.within_30 += amt;
      else if (daysDiff <= 90) summary.within_90 += amt;
      else if (daysDiff <= 180) summary.within_180 += amt;
      else if (daysDiff <= 365) summary.within_365 += amt;
      else summary.over_365 += amt;
    }

    // 先求和再舍入，避免累加舍入误差
    const rawTotal = summary.within_30 + summary.within_90 + summary.within_180 + summary.within_365 + summary.over_365;
    summary.within_30 = Math.round(summary.within_30 * 100) / 100;
    summary.within_90 = Math.round(summary.within_90 * 100) / 100;
    summary.within_180 = Math.round(summary.within_180 * 100) / 100;
    summary.within_365 = Math.round(summary.within_365 * 100) / 100;
    summary.over_365 = Math.round(summary.over_365 * 100) / 100;
    summary.total = Math.round(rawTotal * 100) / 100;

    return { company_name: book?.company_name || '', period: cp, type, rows, summary };
  };

  // ==================== 内部方法 ====================

  /**
   * 累计科目余额（年初至今）
   */
  proto._getCumulativeSubjectBalance = function (endPeriod, openingPeriod) {
    this._ensureBookId();
    const self = this;

    const rows = this.db.prepare(`
      SELECT e.subject_code AS code, MAX(e.subject_name) AS name,
             SUM(e.debit) AS debit_amount, SUM(e.credit) AS credit_amount
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE v.status = 'posted' AND v.book_id = ? AND v.period <= ?
      GROUP BY e.subject_code ORDER BY e.subject_code
    `).all(this.currentBookId, endPeriod);

    const openings = this.getOpeningBalances(openingPeriod);

    return rows.map(row => {
      const op = openings.find(o => o.subject_code === row.code);
      const opDebit = op?.debit || 0;
      const opCredit = op?.credit || 0;
      const dAmt = row.debit_amount;
      const cAmt = row.credit_amount;

      const subj = self.db.prepare('SELECT direction FROM bd_subject WHERE code = ? AND book_id = ?').get(row.code, self.currentBookId);
      const direction = subj?.direction || 'debit';
      const balance = direction === 'debit'
        ? opDebit - opCredit + dAmt - cAmt
        : opCredit - opDebit + cAmt - dAmt;

      return { code: row.code, name: row.name, openingDebit: opDebit, openingCredit: opCredit,
        debitAmount: dAmt, creditAmount: cAmt, balance, direction };
    });
  };

  /**
   * 根据报表模板填充金额（含公式计算）
   * 委托给 shared/report-formulas.cjs 统一实现
   * @param {Object} [opts] 可选参数 { netProfitAmount }
   */
  proto._fillTemplateAmount = function (templateRows, balanceMap, openingMap, monthlyMap, opts) {
    return fillTemplateAmount(templateRows, balanceMap, openingMap, monthlyMap, opts);
  };

  /**
   * 预置报表模板（首次使用）
   */
  proto._seedReportTemplates = function () {
    if (!this.db) return;
    this._ensureBookId();
    const count = this.db.prepare('SELECT COUNT(*) as cnt FROM report_template WHERE book_id = ?').get(this.currentBookId);
    if (count && count.cnt > 0) return;

    const stmt = this.db.prepare(
      'INSERT INTO report_template (book_id, report_type, section, row_no, name, subject_codes, is_total, is_header, indent_level, bold, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    this.db.transaction(() => {
      for (const t of REPORT_TEMPLATES) {
        stmt.run(this.currentBookId, t.report_type, t.section || '', t.row_no, t.name,
          t.subject_codes || '', t.is_total || 0, t.is_header || 0, t.indent_level || 0, t.bold || 0, t.display_order);
      }
    })();
  };
}

module.exports = { applyReportMethods };
