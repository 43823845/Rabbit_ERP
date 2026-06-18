/**
 * database/reports.cjs — 财务报表查询
 *
 * 负责所有财务报告的查询与计算：
 *   - 科目余额表、总账、明细账、试算平衡
 *   - 利润表、资产负债表、现金流量表
 *   - 数量金额账簿、跨年数据完整性检查
 */
const { REPORT_TEMPLATES } = require('./schema.cjs');

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
      const balance = subj?.direction === 'debit'
        ? opDebit - opCredit + dAmt - cAmt
        : opCredit - opDebit + cAmt - dAmt;

      return { code: row.code, name: row.name, openingDebit: opDebit, openingCredit: opCredit,
        debitAmount: dAmt, creditAmount: cAmt, balance };
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
      const ed = row.balance >= 0 ? row.balance : 0;
      const ec = row.balance < 0 ? -row.balance : 0;
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

    const allRows = this._fillTemplateAmount(templateRows, balMap, opMap);
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
        const scat = subj?.category || '';
        if (scat === 'asset' && (c.subject_code.startsWith('15') || c.subject_code.startsWith('16') || c.subject_code === '1511')) cat = 'investing';
        else if (scat === 'asset' && (c.subject_code.startsWith('11') || c.subject_code.startsWith('12') || c.subject_code === '1101')) cat = 'investing';
        else if (scat === 'liability' && (c.subject_code.startsWith('25') || c.subject_code.startsWith('27'))) cat = 'financing';
        else if (scat === 'equity') cat = 'financing';
      }

      if (cat === 'investing') { if (isInflow) invIn += absFlow; else invOut += absFlow; }
      else if (cat === 'financing') { if (isInflow) finIn += absFlow; else finOut += absFlow; }
      else { if (isInflow) opIn += absFlow; else opOut += absFlow; }
    }

    const opNet = opIn - opOut, invNet = invIn - invOut, finNet = finIn - finOut;
    const totalNet = opNet + invNet + finNet;

    const rows = [
      { row_no:1, name:'一、经营活动产生的现金流量：', is_header:true, bold:true, indent_level:0, section:'operating', amount:0 },
      { row_no:2, name:'销售商品、提供劳务收到的现金', bold:false, indent_level:0, section:'operating', amount:opIn },
      { row_no:5, name:'经营活动现金流入小计', is_total:true, bold:true, indent_level:0, section:'operating', amount:opIn },
      { row_no:6, name:'购买商品、接受劳务支付的现金', bold:false, indent_level:0, section:'operating', amount:opOut },
      { row_no:10, name:'经营活动现金流出小计', is_total:true, bold:true, indent_level:0, section:'operating', amount:opOut },
      { row_no:11, name:'经营活动产生的现金流量净额', is_total:true, bold:true, indent_level:0, section:'operating', amount:opNet },
      { row_no:13, name:'二、投资活动产生的现金流量：', is_header:true, bold:true, indent_level:0, section:'investing', amount:0 },
      { row_no:14, name:'处置固定资产、无形资产收回的现金', bold:false, indent_level:0, section:'investing', amount:0 },
      { row_no:16, name:'投资活动现金流入小计', is_total:true, bold:true, indent_level:0, section:'investing', amount:invIn },
      { row_no:18, name:'购建固定资产、无形资产支付的现金', bold:false, indent_level:0, section:'investing', amount:invOut },
      { row_no:20, name:'投资活动现金流出小计', is_total:true, bold:true, indent_level:0, section:'investing', amount:invOut },
      { row_no:21, name:'投资活动产生的现金流量净额', is_total:true, bold:true, indent_level:0, section:'investing', amount:invNet },
      { row_no:23, name:'三、筹资活动产生的现金流量：', is_header:true, bold:true, indent_level:0, section:'financing', amount:0 },
      { row_no:24, name:'取得借款收到的现金', bold:false, indent_level:0, section:'financing', amount:0 },
      { row_no:26, name:'筹资活动现金流入小计', is_total:true, bold:true, indent_level:0, section:'financing', amount:finIn },
      { row_no:28, name:'偿还债务支付的现金', bold:false, indent_level:0, section:'financing', amount:0 },
      { row_no:30, name:'筹资活动现金流出小计', is_total:true, bold:true, indent_level:0, section:'financing', amount:finOut },
      { row_no:31, name:'筹资活动产生的现金流量净额', is_total:true, bold:true, indent_level:0, section:'financing', amount:finNet },
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
      const balance = subj?.direction === 'debit'
        ? opDebit - opCredit + dAmt - cAmt
        : opCredit - opDebit + cAmt - dAmt;

      return { code: row.code, name: row.name, openingDebit: opDebit, openingCredit: opCredit,
        debitAmount: dAmt, creditAmount: cAmt, balance };
    });
  };

  /**
   * 根据报表模板填充金额（含公式计算）
   */
  proto._fillTemplateAmount = function (templateRows, balanceMap, openingMap, monthlyMap) {
    const rowMap = new Map();
    const allRows = [];

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
      const bpRow = rowMap.get(21);
      fields.forEach(f => {
        if (bpRow) bpRow[f] = getVal(rowMap.get(1), f) - getVal(rowMap.get(2), f) - getVal(rowMap.get(3), f)
          - getVal(rowMap.get(11), f) - getVal(rowMap.get(14), f) - getVal(rowMap.get(18), f)
          + getVal(rowMap.get(20), f);
      });

      const tpRow = rowMap.get(30);
      fields.forEach(f => {
        if (tpRow) tpRow[f] = getVal(bpRow, f) + getVal(rowMap.get(22), f) - getVal(rowMap.get(24), f);
      });

      netProfitRow = rowMap.get(32);
      fields.forEach(f => {
        if (netProfitRow) netProfitRow[f] = getVal(tpRow, f) - getVal(rowMap.get(31), f);
      });
    }

    // 资产负债表公式
    const asRow = rowMap.get(21); // 固定资产账面价值
    if (asRow) asRow.amount = (rowMap.get(19)?.amount || 0) - (rowMap.get(20)?.amount || 0);

    const caTotal = rowMap.get(15); // 流动资产合计
    if (caTotal) caTotal.amount = [2,3,4,5,6,7,8,9,10].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

    const ncaTotal = rowMap.get(29); // 非流动资产合计
    if (ncaTotal) ncaTotal.amount = [17,18,21,25,28].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

    const atTotal = rowMap.get(30); // 资产总计
    if (atTotal) atTotal.amount = (caTotal?.amount || 0) + (ncaTotal?.amount || 0);

    const clTotal = rowMap.get(41); // 流动负债合计
    if (clTotal) clTotal.amount = [32,34,36,37,40].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);

    const nclTotal = rowMap.get(46); // 非流动负债合计
    const liabTotal = rowMap.get(47); // 负债合计
    if (liabTotal) liabTotal.amount = (clTotal?.amount || 0) + (nclTotal?.amount || 0);

    const eqTotal = rowMap.get(53); // 所有者权益合计
    if (eqTotal) {
      eqTotal.amount = [49,50,51,52].reduce((s, r) => s + (rowMap.get(r)?.amount || 0), 0);
      eqTotal.amount += netProfitRow?.amount || 0;
    }

    const totalRow = rowMap.get(54); // 负债和所有者权益总计
    if (totalRow) totalRow.amount = (liabTotal?.amount || 0) + (eqTotal?.amount || 0);

    return allRows;
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
