/**
 * database/auxiliary.cjs — 辅助核算管理
 *
 * 负责 aux_project_type + aux_project_value 的 CRUD，及辅助核算报表查询
 */

/**
 * 将辅助核算方法挂载到 FinanceDatabase 原型
 */
function applyAuxiliaryMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  // ---- 辅助核算类别 ----

  proto.listAuxProjectTypes = function () {
    if (!this.db) return [];
    this._ensureBookId();
    return this.db.prepare(
      'SELECT * FROM aux_project_type WHERE book_id = ? ORDER BY code'
    ).all(this.currentBookId);
  };

  proto.createAuxProjectType = function ({ code, name }) {
    if (!code || !name) throw new Error('编码和名称不能为空');
    this._ensureBookId();
    const exists = this.db.prepare(
      'SELECT id FROM aux_project_type WHERE book_id = ? AND code = ?'
    ).get(this.currentBookId, code);
    if (exists) throw new Error('辅助核算类别编码已存在');
    const r = this.db.prepare(
      'INSERT INTO aux_project_type (book_id, code, name) VALUES (?, ?, ?)'
    ).run(this.currentBookId, code, name);
    return this.db.prepare('SELECT * FROM aux_project_type WHERE id = ?').get(r.lastInsertRowid);
  };

  proto.updateAuxProjectType = function ({ id, code, name }) {
    if (!id) throw new Error('ID不能为空');
    this.db.prepare('UPDATE aux_project_type SET code = ?, name = ? WHERE id = ?').run(code, name, id);
    return this.db.prepare('SELECT * FROM aux_project_type WHERE id = ?').get(id);
  };

  proto.deleteAuxProjectType = function (id) {
    this._ensureBookId();
    const vals = this.db.prepare('SELECT COUNT(*) as cnt FROM aux_project_value WHERE type_id = ?').get(id);
    if (vals && vals.cnt > 0) throw new Error(`该类别下有 ${vals.cnt} 个项目值，请先删除项目值`);
    this.db.prepare('DELETE FROM aux_project_type WHERE id = ? AND book_id = ?').run(id, this.currentBookId);
  };

  // ---- 辅助核算项目值 ----

  proto.listAuxProjectValues = function (typeId) {
    if (!this.db) return [];
    this._ensureBookId();
    return this.db.prepare(
      'SELECT * FROM aux_project_value WHERE type_id = ? AND book_id = ? ORDER BY code'
    ).all(typeId, this.currentBookId);
  };

  proto.createAuxProjectValue = function ({ typeId, code, name }) {
    if (!typeId || !code || !name) throw new Error('类别、编码和名称不能为空');
    this._ensureBookId();
    const exists = this.db.prepare(
      'SELECT id FROM aux_project_value WHERE type_id = ? AND code = ? AND book_id = ?'
    ).get(typeId, code, this.currentBookId);
    if (exists) throw new Error('辅助核算项目编码已存在');
    const r = this.db.prepare(
      'INSERT INTO aux_project_value (type_id, book_id, code, name) VALUES (?, ?, ?, ?)'
    ).run(typeId, this.currentBookId, code, name);
    return this.db.prepare('SELECT * FROM aux_project_value WHERE id = ?').get(r.lastInsertRowid);
  };

  proto.updateAuxProjectValue = function ({ id, code, name, enabled }) {
    if (!id) throw new Error('ID不能为空');
    const parts = ['code = ?', 'name = ?'];
    const params = [code, name];
    if (enabled !== undefined) { parts.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    params.push(id);
    this.db.prepare(`UPDATE aux_project_value SET ${parts.join(', ')} WHERE id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM aux_project_value WHERE id = ?').get(id);
  };

  proto.deleteAuxProjectValue = function (id) {
    this._ensureBookId();
    this.db.prepare('DELETE FROM aux_project_value WHERE id = ? AND book_id = ?').run(id, this.currentBookId);
  };

  // ---- 辅助核算报表 ----

  proto.getAuxProjectBalance = function ({ auxTypeId, auxValueId, period }) {
    if (!this.db) return [];
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (auxTypeId) { conds += ' AND e.aux_type_id = ?'; params.push(auxTypeId); }
    if (auxValueId) { conds += ' AND e.aux_value_id = ?'; params.push(auxValueId); }

    return this.db.prepare(`
      SELECT e.aux_type_id, e.aux_value_id, e.subject_code, e.subject_name,
             SUM(e.debit) AS debit_amount, SUM(e.credit) AS credit_amount
      FROM gl_voucher_entry e
      JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE 1=1 ${conds}
      GROUP BY e.aux_type_id, e.aux_value_id, e.subject_code, e.subject_name
      ORDER BY e.aux_type_id, e.aux_value_id, e.subject_code
    `).all(...params);
  };

  proto.getAuxProjectDetail = function ({ auxTypeId, auxValueId, period, startDate, endDate, page = 1, pageSize = 50 }) {
    if (!this.db) return { rows: [], total: 0 };
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (auxTypeId) { conds += ' AND e.aux_type_id = ?'; params.push(auxTypeId); }
    if (auxValueId) { conds += ' AND e.aux_value_id = ?'; params.push(auxValueId); }
    if (startDate) { conds += ' AND v.voucher_date >= ?'; params.push(startDate); }
    if (endDate) { conds += ' AND v.voucher_date <= ?'; params.push(endDate); }

    const { total } = this.db.prepare(
      `SELECT COUNT(*) as total FROM gl_voucher_entry e JOIN gl_voucher v ON v.id = e.voucher_id WHERE 1=1 ${conds}`
    ).get(...params);

    const offset = (page - 1) * pageSize;
    const rows = this.db.prepare(`
      SELECT v.voucher_date, v.voucher_word, v.voucher_no, v.remark AS voucher_remark,
             e.summary, e.subject_code, e.subject_name, e.debit, e.credit,
             e.aux_type_id, e.aux_value_id
      FROM gl_voucher_entry e JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE 1=1 ${conds}
      ORDER BY v.voucher_date, v.voucher_no, e.line_no
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset);

    return { rows, total };
  };

  // ---- 核算项目组合表（交叉表） ----

  /**
   * 核算项目组合表：按核算类别展示各科目在各项目值下的借贷发生额
   * 输出格式：columns(项目值列表) + rows(每科目一行，cells 与 columns 对应)
   */
  proto.getAuxProjectCombo = function ({ period, auxTypeId }) {
    if (!this.db) return { columns: [], rows: [] };
    this._ensureBookId();

    let conds = " AND v.status = 'posted' AND v.book_id = ?";
    const params = [this.currentBookId];
    if (period) { conds += ' AND v.period = ?'; params.push(period); }
    if (auxTypeId) { conds += ' AND e.aux_type_id = ?'; params.push(auxTypeId); }

    // 获取所有有辅助核算的科目
    const rawRows = this.db.prepare(`
      SELECT e.aux_type_id, e.aux_value_id, e.subject_code, e.subject_name,
             SUM(e.debit) AS debit_amount, SUM(e.credit) AS credit_amount
      FROM gl_voucher_entry e
      JOIN gl_voucher v ON v.id = e.voucher_id
      WHERE 1=1 ${conds} AND e.aux_type_id IS NOT NULL AND e.aux_value_id IS NOT NULL
      GROUP BY e.aux_type_id, e.aux_value_id, e.subject_code, e.subject_name
      ORDER BY e.subject_code, e.aux_value_id
    `).all(...params);

    if (rawRows.length === 0) return { columns: [], rows: [] };

    // 获取项目值信息作为列
    const usedValueIds = [...new Set(rawRows.map(r => r.aux_value_id))];
    const vp = usedValueIds.map(() => '?').join(',');
    const valueInfos = this.db.prepare(
      `SELECT id, code, name FROM aux_project_value WHERE id IN (${vp}) ORDER BY code`
    ).all(...usedValueIds);

    const columns = valueInfos.map(v => ({
      value_id: v.id,
      value_code: v.code,
      value_name: v.name,
    }));

    // 按科目分组，构造行数据
    const subjectMap = new Map();
    for (const r of rawRows) {
      if (!subjectMap.has(r.subject_code)) {
        subjectMap.set(r.subject_code, {
          subject_code: r.subject_code,
          subject_name: r.subject_name,
          cells: columns.map(() => ({ debit: 0, credit: 0 })),
        });
      }
      const row = subjectMap.get(r.subject_code);
      const colIdx = columns.findIndex(c => c.value_id === r.aux_value_id);
      if (colIdx >= 0) {
        row.cells[colIdx].debit += Math.round((r.debit_amount || 0) * 100) / 100;
        row.cells[colIdx].credit += Math.round((r.credit_amount || 0) * 100) / 100;
      }
    }

    const rows = [...subjectMap.values()];
    // 计算总计行
    const totals = columns.map((col, ci) => {
      let totalDebit = 0, totalCredit = 0;
      for (const row of rows) {
        totalDebit += row.cells[ci].debit;
        totalCredit += row.cells[ci].credit;
      }
      return { debit: Math.round(totalDebit * 100) / 100, credit: Math.round(totalCredit * 100) / 100 };
    });

    return { columns, rows, totals };
  };

  /**
   * 为当前账套预置辅助核算类别
   */
  proto.seedDefaultAuxProjectTypes = function () {
    this._ensureBookId();
    const count = this.db.prepare('SELECT COUNT(*) as cnt FROM aux_project_type WHERE book_id = ?').get(this.currentBookId);
    if (count.cnt > 0) return;

    const defaults = [
      { code: 'CUSTOMER', name: '客户' },
      { code: 'SUPPLIER', name: '供应商' },
      { code: 'DEPARTMENT', name: '部门' },
      { code: 'PROJECT', name: '项目' },
      { code: 'EMPLOYEE', name: '职员' },
    ];
    const stmt = this.db.prepare('INSERT INTO aux_project_type (book_id, code, name) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      for (const t of defaults) stmt.run(this.currentBookId, t.code, t.name);
    })();
    this._log('seed_aux_types', `预置 ${defaults.length} 个辅助核算类别到 book_id=${this.currentBookId}`);
  };
}

module.exports = { applyAuxiliaryMethods };
