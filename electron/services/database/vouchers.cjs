/**
 * database/vouchers.cjs — 凭证管理
 *
 * 负责 gl_voucher + gl_voucher_entry 的 CRUD、状态变更、编号管理
 */
const { validateVoucher } = require('./utils.cjs');

/**
 * 将凭证管理方法挂载到 FinanceDatabase 原型
 */
function applyVoucherMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 查询凭证列表（支持多条件筛选 + 分页）
   */
  proto.listVouchers = function ({ period, status, voucherWord, keyword, subjectCode,
    startDate, endDate, amountMin, amountMax, page = 1, pageSize = 0 }) {

    if (!this.db) return this.memory.vouchers;
    this._ensureBookId();

    let sql = 'SELECT * FROM gl_voucher WHERE book_id = ?';
    const params = [this.currentBookId];

    if (period) { sql += ' AND period = ?'; params.push(period); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (voucherWord) { sql += ' AND voucher_word = ?'; params.push(voucherWord); }
    if (startDate) { sql += ' AND voucher_date >= ?'; params.push(startDate); }
    if (endDate) { sql += ' AND voucher_date <= ?'; params.push(endDate + ' 23:59:59'); }
    if (keyword) {
      sql += ` AND (remark LIKE ? OR id IN (SELECT voucher_id FROM gl_voucher_entry WHERE summary LIKE ? OR subject_name LIKE ? OR subject_code LIKE ?))`;
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw, kw);
    }
    if (subjectCode) {
      sql += ` AND id IN (SELECT voucher_id FROM gl_voucher_entry WHERE subject_code = ?)`;
      params.push(subjectCode);
    }

    sql += ' ORDER BY voucher_date DESC, voucher_no DESC';

    const needAmountFilter = amountMin !== undefined || amountMax !== undefined;

    if (pageSize > 0 && !needAmountFilter) {
      sql += ' LIMIT ? OFFSET ?';
      params.push(pageSize, (page - 1) * pageSize);
    }

    const vouchers = this.db.prepare(sql).all(...params);
    const voucherIds = vouchers.map(v => v.id);
    if (voucherIds.length === 0) return [];

    const ph = voucherIds.map(() => '?').join(',');
    const entries = this.db.prepare(
      `SELECT * FROM gl_voucher_entry WHERE voucher_id IN (${ph}) ORDER BY line_no`
    ).all(...voucherIds);

    const grouped = new Map();
    for (const e of entries) {
      e.subjectCode = e.subject_code;
      e.subjectName = e.subject_name;
      if (!grouped.has(e.voucher_id)) grouped.set(e.voucher_id, []);
      grouped.get(e.voucher_id).push(e);
    }

    let result = vouchers.map(v => ({
      ...v,
      entries: grouped.get(v.id) || [],
      attachments: this._getAttachments(v.id),
    }));

    if (needAmountFilter) {
      result = result.filter(v => {
        const total = v.entries.reduce((s, e) => s + Number(e.debit || 0) + Number(e.credit || 0), 0);
        if (amountMin !== undefined && total < amountMin) return false;
        if (amountMax !== undefined && total > amountMax) return false;
        return true;
      });
      if (pageSize > 0) {
        const offset = (page - 1) * pageSize;
        result = result.slice(offset, offset + pageSize);
      }
    }

    return result;
  };

  /**
   * 获取单张凭证
   */
  proto.getVoucher = function (id) {
    if (!this.db) return this.memory.vouchers.find(v => v.id === id);
    const voucher = this.db.prepare('SELECT * FROM gl_voucher WHERE id = ?').get(id);
    if (!voucher) return null;
    const result = this._withEntries(voucher);
    result.attachments = this._getAttachments(id);
    return result;
  };

  /**
   * 创建凭证
   */
  proto.createVoucher = function (payload) {
    validateVoucher(payload);

    const entries = payload.entries.map((e, i) => ({
      summary: e.summary,
      subjectCode: e.subjectCode,
      subjectName: e.subjectName,
      debit: Number(e.debit || 0),
      credit: Number(e.credit || 0),
      quantity: Number(e.quantity || 0),
      unitPrice: Number(e.unitPrice || 0),
      unit: e.unit || '',
      auxTypeId: e.auxTypeId ?? null,
      auxValueId: e.auxValueId ?? null,
      lineNo: i + 1,
    }));

    if (!this.db) {
      const voucher = {
        id: this.memory.vouchers.length + 1,
        voucher_word: payload.voucherWord,
        voucher_no: payload.voucherNo,
        voucher_date: payload.voucherDate,
        period: payload.period || '2026-06',
        remark: payload.remark || '',
        status: 'draft',
        maker: payload.maker || 'demo',
        created_at: new Date().toISOString(),
        entries,
      };
      this.memory.vouchers.unshift(voucher);
      return voucher;
    }

    this._ensureBookId();
    const self = this;
    const createTx = this.db.transaction(() => {
      const result = self.db.prepare(
        'INSERT INTO gl_voucher (book_id, period, voucher_word, voucher_no, voucher_date, remark, maker, bookkeeper) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(self.currentBookId, payload.period || '2026-06', payload.voucherWord, payload.voucherNo,
        payload.voucherDate, payload.remark || '', payload.maker || 'demo', payload.bookkeeper || '');

      const insertEntry = self.db.prepare(
        'INSERT INTO gl_voucher_entry (voucher_id, summary, subject_code, subject_name, debit, credit, quantity, unit_price, unit, aux_type_id, aux_value_id, line_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );

      for (const e of entries) {
        insertEntry.run(result.lastInsertRowid, e.summary, e.subjectCode, e.subjectName,
          e.debit, e.credit, e.quantity, e.unitPrice, e.unit, e.auxTypeId, e.auxValueId, e.lineNo);
      }

      return result.lastInsertRowid;
    });

    const id = createTx();
    this._log('create_voucher', `凭证 ${payload.voucherWord}-${payload.voucherNo}`);
    return this.getVoucher(id);
  };

  /**
   * 修改凭证（仅草稿状态）
   */
  proto.updateVoucher = function ({ id, voucherDate, remark, bookkeeper, entries }) {
    if (!this.db) return null;

    const existing = this.db.prepare('SELECT * FROM gl_voucher WHERE id = ?').get(id);
    if (!existing || existing.status !== 'draft') {
      throw new Error('仅草稿状态可修改');
    }

    validateVoucher({ voucherWord: existing.voucher_word, voucherNo: existing.voucher_no, entries });

    const self = this;
    const tx = this.db.transaction(() => {
      self.db.prepare('UPDATE gl_voucher SET voucher_date = ?, remark = ?, bookkeeper = ? WHERE id = ?')
        .run(voucherDate, remark || '', bookkeeper || '', id);
      self.db.prepare('DELETE FROM gl_voucher_entry WHERE voucher_id = ?').run(id);
      const ins = self.db.prepare(
        'INSERT INTO gl_voucher_entry (voucher_id, summary, subject_code, subject_name, debit, credit, quantity, unit_price, unit, aux_type_id, aux_value_id, line_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      entries.forEach((e, i) => {
        ins.run(id, e.summary, e.subjectCode, e.subjectName, Number(e.debit || 0), Number(e.credit || 0),
          Number(e.quantity || 0), Number(e.unitPrice || 0), e.unit || '', e.auxTypeId ?? null, e.auxValueId ?? null, i + 1);
      });
    });
    tx();
    this._log('update_voucher', `凭证 ${existing.voucher_word}-${existing.voucher_no}`);
    return this.getVoucher(id);
  };

  /**
   * 删除凭证（仅草稿状态）
   */
  proto.deleteVoucher = function (id) {
    if (!this.db) return;
    const v = this.db.prepare('SELECT * FROM gl_voucher WHERE id = ?').get(id);
    if (!v || v.status !== 'draft') throw new Error('仅草稿状态可删除');

    const path = require('node:path');
    const fs = require('node:fs');
    const attachDir = path.join(this.app.getPath('userData'), 'attachments', String(id));
    try { if (fs.existsSync(attachDir)) fs.rmSync(attachDir, { recursive: true, force: true }); } catch (_) { /* */ }
    this.db.prepare('DELETE FROM gl_voucher WHERE id = ?').run(id);
    this._log('delete_voucher', `凭证 ${v.voucher_word}-${v.voucher_no}`);
  };

  /**
   * 凭证状态变更（通用）
   */
  proto._changeVoucherStatus = function (id, fromStatus, toStatus, errorMsg, logAction) {
    if (!this.db) return null;
    const v = this.db.prepare('SELECT * FROM gl_voucher WHERE id = ?').get(id);
    if (!v || v.status !== fromStatus) throw new Error(errorMsg);
    this.db.prepare('UPDATE gl_voucher SET status = ? WHERE id = ?').run(toStatus, id);
    this._log(logAction, `凭证 ${v.voucher_word}-${v.voucher_no}`);
    return this.getVoucher(id);
  };

  proto.auditVoucher = function (id) { return this._changeVoucherStatus(id, 'draft', 'audited', '仅草稿状态可审核', 'audit_voucher'); };
  proto.unauditVoucher = function (id) { return this._changeVoucherStatus(id, 'audited', 'draft', '仅已审核状态可反审核', 'unaudit_voucher'); };
  proto.postVoucher = function (id) { return this._changeVoucherStatus(id, 'audited', 'posted', '仅已审核状态可过账', 'post_voucher'); };
  proto.unpostVoucher = function (id) { return this._changeVoucherStatus(id, 'posted', 'audited', '仅已过账状态可反过账', 'unpost_voucher'); };

  /**
   * 批量审核凭证
   */
  proto.batchAuditVouchers = function (ids) {
    if (!this.db) return { success: 0, failed: ids.length };
    this._ensureBookId();
    let success = 0, failed = 0;
    const self = this;
    const tx = this.db.transaction(() => {
      const stmt = self.db.prepare('UPDATE gl_voucher SET status = ? WHERE id = ? AND status = ? AND book_id = ?');
      for (const id of ids) {
        const result = stmt.run('audited', id, 'draft', self.currentBookId);
        if (result.changes > 0) {
          success++;
          const v = self.db.prepare('SELECT * FROM gl_voucher WHERE id = ?').get(id);
          if (v) self._log('audit_voucher', `凭证 ${v.voucher_word}-${v.voucher_no}`);
        } else {
          failed++;
        }
      }
    });
    tx();
    return { success, failed };
  };

  /**
   * 批量过账凭证
   */
  proto.batchPostVouchers = function (ids) {
    if (!this.db) return { success: 0, failed: ids.length };
    this._ensureBookId();
    let success = 0, failed = 0;
    const self = this;
    const tx = this.db.transaction(() => {
      const stmt = self.db.prepare('UPDATE gl_voucher SET status = ? WHERE id = ? AND status = ? AND book_id = ?');
      for (const id of ids) {
        const result = stmt.run('posted', id, 'audited', self.currentBookId);
        if (result.changes > 0) {
          success++;
          const v = self.db.prepare('SELECT * FROM gl_voucher WHERE id = ?').get(id);
          if (v) self._log('post_voucher', `凭证 ${v.voucher_word}-${v.voucher_no}`);
        } else {
          failed++;
        }
      }
    });
    tx();
    return { success, failed };
  };

  /**
   * 重排凭证编号（单个凭证字）
   */
  proto.reorderVoucherNos = function (voucherWord, period) {
    if (!this.db) return;
    this._ensureBookId();
    const vouchers = this.db.prepare(
      'SELECT * FROM gl_voucher WHERE book_id = ? AND voucher_word = ? AND period = ? AND status != ? ORDER BY voucher_date, voucher_no'
    ).all(this.currentBookId, voucherWord, period, 'deleted');

    const self = this;
    const tx = this.db.transaction(() => {
      const stmt = self.db.prepare('UPDATE gl_voucher SET voucher_no = ? WHERE id = ?');
      vouchers.forEach((v, i) => stmt.run(i + 1, v.id));
    });
    tx();
    this._log('reorder_voucher', `${voucherWord} 字 ${period} 期间，共 ${vouchers.length} 张凭证`);
    return { count: vouchers.length };
  };

  /**
   * 全凭证字断号整理
   */
  proto.reorderAllVoucherNos = function (period) {
    if (!this.db) return;
    this._ensureBookId();
    const wordRows = this.db.prepare(
      'SELECT word FROM voucher_words WHERE book_id = ? ORDER BY id'
    ).all(this.currentBookId);
    const words = wordRows.length > 0 ? wordRows.map(r => r.word) : ['记'];
    const results = [];
    const self = this;

    for (const word of words) {
      const vouchers = self.db.prepare(
        'SELECT * FROM gl_voucher WHERE book_id = ? AND voucher_word = ? AND period = ? AND status != ? ORDER BY voucher_date, voucher_no'
      ).all(self.currentBookId, word, period, 'deleted');
      if (vouchers.length > 0) {
        self.db.transaction(() => {
          const stmt = self.db.prepare('UPDATE gl_voucher SET voucher_no = ? WHERE id = ?');
          vouchers.forEach((v, i) => stmt.run(i + 1, v.id));
        })();
        results.push({ word, count: vouchers.length });
      }
    }
    this._log('reorder_all', `${period} 期间整理断号`);
    return results;
  };

  /**
   * 获取下一凭证号
   */
  proto.getNextVoucherNo = function (voucherWord, period) {
    if (!this.db) {
      return this.memory.vouchers.filter(v => v.voucher_word === voucherWord).length + 1;
    }
    this._ensureBookId();
    const row = this.db.prepare(
      'SELECT MAX(voucher_no) AS maxNo FROM gl_voucher WHERE book_id = ? AND voucher_word = ? AND period = ? AND status != ?'
    ).get(this.currentBookId, voucherWord, period, 'deleted');
    return (row?.maxNo || 0) + 1;
  };

  /**
   * 加载凭证关联的分录条目
   */
  proto._withEntries = function (voucher) {
    const entries = this.db.prepare('SELECT * FROM gl_voucher_entry WHERE voucher_id = ? ORDER BY line_no')
      .all(voucher.id)
      .map(e => ({
        ...e,
        subjectCode: e.subject_code,
        subjectName: e.subject_name,
        unitPrice: e.unit_price,
        auxTypeId: e.aux_type_id,
        auxValueId: e.aux_value_id,
      }));
    return { ...voucher, entries };
  };
}

module.exports = { applyVoucherMethods };
