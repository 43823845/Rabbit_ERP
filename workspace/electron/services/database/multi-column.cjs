/**
 * database/multi-column.cjs — 多栏账管理
 *
 * 负责 multi_column_scheme 的 CRUD 和多栏账查询
 */

/**
 * 将多栏账方法挂载到 FinanceDatabase 原型
 */
function applyMultiColumnMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  proto.listMultiColumnSchemes = function () {
    if (!this.db) return [];
    this._ensureBookId();
    return this.db.prepare(
      'SELECT * FROM multi_column_scheme WHERE book_id = ? ORDER BY updated_at DESC'
    ).all(this.currentBookId);
  };

  proto.createMultiColumnScheme = function ({ name, parentCode, parentName, direction = 'debit', childrenJson = '[]' }) {
    if (!name || !parentCode) throw new Error('方案名称和上级科目不能为空');
    this._ensureBookId();
    const r = this.db.prepare(
      'INSERT INTO multi_column_scheme (book_id, name, parent_code, parent_name, direction, children_json) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(this.currentBookId, name, parentCode, parentName, direction, childrenJson);
    return this.db.prepare('SELECT * FROM multi_column_scheme WHERE id = ?').get(r.lastInsertRowid);
  };

  proto.updateMultiColumnScheme = function ({ id, name, parentCode, parentName, direction, childrenJson }) {
    if (!id) throw new Error('方案ID不能为空');
    this.db.prepare(
      `UPDATE multi_column_scheme SET name=?, parent_code=?, parent_name=?, direction=?, children_json=?, updated_at=datetime('now','localtime') WHERE id=?`
    ).run(name, parentCode, parentName, direction, childrenJson, id);
    return this.db.prepare('SELECT * FROM multi_column_scheme WHERE id = ?').get(id);
  };

  proto.deleteMultiColumnScheme = function (id) {
    this._ensureBookId();
    this.db.prepare('DELETE FROM multi_column_scheme WHERE id = ? AND book_id = ?').run(id, this.currentBookId);
  };

  /**
   * 多栏账查询：按凭证+摘要分组，展开子科目金额
   */
  proto.getMultiColumnLedger = function ({ parentCode, period, startDate, endDate, childrenJson }) {
    if (!this.db) return { columns: [], rows: [], periodSummary: [] };
    this._ensureBookId();

    let children = [];
    try { children = JSON.parse(childrenJson || '[]'); } catch (_) { children = []; }
    if (children.length === 0) return { columns: [], rows: [], periodSummary: [] };

    let conds = " AND v.status = 'posted' AND v.book_id = ? AND e.subject_code LIKE ?";
    const params = [this.currentBookId, `${parentCode}%`];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (startDate) { conds += ' AND v.voucher_date >= ?'; params.push(startDate); }
    if (endDate) { conds += ' AND v.voucher_date <= ?'; params.push(endDate); }

    const allRows = this.db.prepare(`
      SELECT v.voucher_date, v.voucher_word, v.voucher_no, v.period,
             e.summary, e.subject_code, e.subject_name, e.debit, e.credit
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE 1=1 ${conds}
      ORDER BY v.period, v.voucher_date, v.voucher_no, e.line_no
    `).all(...params);

    const columns = children.map(c => ({ code: c.code, name: c.name }));

    const rowMap = new Map();
    for (const r of allRows) {
      const key = `${r.voucher_date}|${r.voucher_word}|${r.voucher_no}|${r.summary}|${r.period}`;
      if (!rowMap.has(key)) {
        rowMap.set(key, { voucher_date: r.voucher_date, voucher_word: r.voucher_word,
          voucher_no: r.voucher_no, period: r.period, summary: r.summary, cells: {} });
      }
      const row = rowMap.get(key);
      const child = children.find(c => r.subject_code === c.code);
      if (child) {
        if (!row.cells[child.code]) row.cells[child.code] = { debit: 0, credit: 0 };
        row.cells[child.code].debit += Number(r.debit);
        row.cells[child.code].credit += Number(r.credit);
      }
    }

    const rows = Array.from(rowMap.values()).map(r => ({
      voucher_date: r.voucher_date, voucher_word: r.voucher_word,
      voucher_no: r.voucher_no, period: r.period, summary: r.summary,
      cells: children.map(c => {
        const cell = r.cells[c.code] || { debit: 0, credit: 0 };
        return { debit: cell.debit, credit: cell.credit, balance: cell.debit - cell.credit };
      }),
    }));

    // 按期间汇总
    const psMap = new Map();
    for (const r of rows) {
      if (!psMap.has(r.period)) {
        psMap.set(r.period, { period: r.period, cells: children.map(() => ({ debit: 0, credit: 0 })) });
      }
      const ps = psMap.get(r.period);
      r.cells.forEach((cell, i) => { ps.cells[i].debit += cell.debit; ps.cells[i].credit += cell.credit; });
    }
    const periodSummary = Array.from(psMap.values()).map(ps => ({
      period: ps.period,
      cells: ps.cells.map(c => ({ debit: c.debit, credit: c.credit, balance: c.debit - c.credit })),
    }));

    return { columns, rows, periodSummary };
  };
}

module.exports = { applyMultiColumnMethods };
