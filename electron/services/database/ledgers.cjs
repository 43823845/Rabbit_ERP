/**
 * database/ledgers.cjs — 财务账簿查询
 *
 * 负责明细账、总账、科目余额表、试算平衡表的底层 SQL 检索与余额滚动计算
 */

function applyLedgerMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 动态批量计算指定期间各科目的期初余额（推算逻辑）
   */
  proto._getOpeningBalancesDynamicBatch = function (period) {
    this._ensureBookId();

    // 1. 寻找最近的在当前期间之前的有期初余额的期间
    const prevPeriodRow = this.db.prepare(
      'SELECT period FROM gl_opening_balance WHERE book_id = ? AND period < ? ORDER BY period DESC LIMIT 1'
    ).get(this.currentBookId, period);

    const basePeriod = prevPeriodRow?.period || null;
    const openingsMap = new Map();

    // 2. 读取 basePeriod 对应的所有科目期初
    if (basePeriod) {
      const ops = this.db.prepare(
        'SELECT subject_code, debit, credit FROM gl_opening_balance WHERE book_id = ? AND period = ?'
      ).all(this.currentBookId, basePeriod);
      for (const o of ops) {
        openingsMap.set(o.subject_code, { debit: o.debit || 0, credit: o.credit || 0 });
      }
    }

    // 3. 汇总 basePeriod (或最早期) 至 period (不含) 期间的发生额
    let sql = `
      SELECT e.subject_code AS code, SUM(e.debit) AS d_flow, SUM(e.credit) AS c_flow
      FROM gl_voucher_entry e
      JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE v.status = 'posted' AND v.book_id = ? AND v.period < ?
    `;
    const params = [this.currentBookId, period];
    if (basePeriod) {
      sql += ' AND v.period >= ?';
      params.push(basePeriod);
    }
    sql += ' GROUP BY e.subject_code';

    const flows = this.db.prepare(sql).all(...params);
    const flowMap = new Map(flows.map(f => [f.code, f]));

    // 4. 获取所有活跃科目代码集合 (有期初或有发生的)
    const allCodes = new Set([...openingsMap.keys(), ...flowMap.keys()]);
    const results = [];

    for (const code of allCodes) {
      const op = openingsMap.get(code) || { debit: 0, credit: 0 };
      const fl = flowMap.get(code) || { d_flow: 0, c_flow: 0 };
      results.push({
        subject_code: code,
        debit: op.debit + fl.d_flow,
        credit: op.credit + fl.c_flow
      });
    }

    return results;
  };

  /**
   * 科目余额表查询
   */
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

    // 查询当期的凭证借贷发生额
    const rows = this.db.prepare(`
      SELECT e.subject_code AS code, MAX(e.subject_name) AS name,
             SUM(e.debit) AS debit_amount, SUM(e.credit) AS credit_amount
      FROM gl_voucher_entry e
      JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE v.status = 'posted' ${conds}
      GROUP BY e.subject_code ORDER BY e.subject_code
    `).all(...params);

    // 获取动态期初余额（如果是查询特定月，计算该月的动态期初，如果未指定期间则期初为0）
    const openings = period ? this._getOpeningBalancesDynamicBatch(period) : [];

    // 获取所有活跃启用科目，补全无当期发生额但有余额的科目列表
    const subjects = this.db.prepare('SELECT code, name, direction, category FROM bd_subject WHERE book_id = ? AND enabled = 1').all(this.currentBookId);

    const filteredSubjects = subjects.filter(s => {
      if (subjectCode && s.code !== subjectCode) return false;
      if (category && s.category !== category) return false;
      return true;
    });

    const finalBalances = [];

    for (const s of filteredSubjects) {
      const row = rows.find(r => r.code === s.code);
      const opening = openings.find(o => o.subject_code === s.code);

      const opDebit = opening?.debit || 0;
      const opCredit = opening?.credit || 0;
      const dAmt = row?.debit_amount || 0;
      const cAmt = row?.credit_amount || 0;

      const direction = s.direction || 'debit';
      const balance = direction === 'debit'
        ? opDebit - opCredit + dAmt - cAmt
        : opCredit - opDebit + cAmt - dAmt;

      // 只有在期初、发生、期末有一项不为0时，才在科目余额表中列示
      if (Math.abs(opDebit) > 0.001 || Math.abs(opCredit) > 0.001 ||
          Math.abs(dAmt) > 0.001 || Math.abs(cAmt) > 0.001 ||
          Math.abs(balance) > 0.001) {
        finalBalances.push({
          code: s.code,
          name: s.name,
          openingDebit: opDebit,
          openingCredit: opCredit,
          debitAmount: dAmt,
          creditAmount: cAmt,
          balance,
          direction
        });
      }
    }

    return finalBalances;
  };

  /**
   * 总账查询
   */
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

  /**
   * 明细账查询（含承前页/过次页）
   */
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

  /**
   * 试算平衡表查询
   */
  proto.getTrialBalance = function (period) {
    const balances = this.getSubjectBalance({ period });
    let tdo = 0, tco = 0, tda = 0, tca = 0, tde = 0, tce = 0;
    const rows = balances.map(row => {
      tdo += row.openingDebit; tco += row.openingCredit;
      tda += row.debitAmount; tca += row.creditAmount;
      const isDebitDir = row.direction === 'debit';
      const ed = isDebitDir ? Math.max(0, row.balance) : Math.max(0, -row.balance);
      const ec = isDebitDir ? Math.max(0, -row.balance) : Math.max(0, row.balance);
      tde += ed; tce += ec;
      return { ...row, endingDebit: ed, endingCredit: ec };
    });
    return { rows, totals: { openingDebit: tdo, openingCredit: tco, amountDebit: tda, amountCredit: tca, endingDebit: tde, endingCredit: tce } };
  };
}

module.exports = { applyLedgerMethods };
