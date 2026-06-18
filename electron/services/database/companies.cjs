/**
 * database/companies.cjs — 公司与账套管理
 *
 * 负责 sys_company 和 acct_book 的 CRUD，以及账套切换
 */
const { seedBookData } = require('./schema.cjs');
const { DEFAULT_PERIOD } = require('./utils.cjs');

/**
 * 将公司/账套管理方法挂载到 FinanceDatabase 原型
 */
function applyCompanyMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 获取所有公司列表
   */
  proto.getCompanies = function () {
    if (!this.db) return [];
    return this.db.prepare(
      `SELECT id, name, contact_person AS contactPerson, legal_representative AS legalRepresentative, phone, address,
              tax_no AS taxNo, current_period AS period, created_at AS createdAt
       FROM sys_company WHERE enabled = 1 ORDER BY created_at`
    ).all();
  };

  /**
   * 创建公司（同时自动创建关联账套、预置科目、期间、凭证字等）
   */
  proto.createCompany = function ({ name, contactPerson, legalRepresentative, phone, address, taxNo }) {
    const self = this;
    const tx = this.db.transaction(() => {
      const cr = self.db.prepare(
        'INSERT INTO sys_company (name, contact_person, legal_representative, phone, address, tax_no) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(name, contactPerson || '', legalRepresentative || '', phone || '', address || '', taxNo || '');

      const br = self.db.prepare(
        'INSERT INTO acct_book (company_id, name, current_period) VALUES (?, ?, ?)'
      ).run(cr.lastInsertRowid, name, DEFAULT_PERIOD);

      // 创建初始期间
      self.db.prepare(
        'INSERT INTO acct_period (book_id, period, status) VALUES (?, ?, ?)'
      ).run(br.lastInsertRowid, DEFAULT_PERIOD, 'open');

      // 预置数据
      seedBookData(self.db, Number(br.lastInsertRowid));

      self.currentBookId = Number(br.lastInsertRowid);
      self.currentCompanyId = Number(cr.lastInsertRowid);

      self._log('create_company', `创建公司 ${name}`);
      return cr.lastInsertRowid;
    });

    const id = tx();
    return this.db.prepare(
      `SELECT id, name, contact_person AS contactPerson, legal_representative AS legalRepresentative, phone, address,
              tax_no AS taxNo, current_period AS period, created_at AS createdAt
       FROM sys_company WHERE id = ?`
    ).get(id);
  };

  /**
   * 更新公司信息
   */
  proto.updateCompany = function ({ id, name, contactPerson, legalRepresentative, phone, address, taxNo }) {
    const parts = [];
    const params = [];
    if (name !== undefined) { parts.push('name = ?'); params.push(name); }
    if (contactPerson !== undefined) { parts.push('contact_person = ?'); params.push(contactPerson); }
    if (legalRepresentative !== undefined) { parts.push('legal_representative = ?'); params.push(legalRepresentative); }
    if (phone !== undefined) { parts.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { parts.push('address = ?'); params.push(address); }
    if (taxNo !== undefined) { parts.push('tax_no = ?'); params.push(taxNo); }
    if (parts.length > 0) {
      parts.push("updated_at = datetime('now','localtime')");
      params.push(id);
      this.db.prepare(`UPDATE sys_company SET ${parts.join(', ')} WHERE id = ?`).run(...params);
      if (name !== undefined) {
        this.db.prepare('UPDATE acct_book SET name = ? WHERE company_id = ?').run(name, id);
      }
      this._log('update_company', `更新公司信息 id=${id}`);
    }
    return this.db.prepare(
      `SELECT id, name, contact_person AS contactPerson, legal_representative AS legalRepresentative, phone, address,
              tax_no AS taxNo, current_period AS period, created_at AS createdAt
       FROM sys_company WHERE id = ?`
    ).get(id);
  };

  /**
   * 切换活动账套
   */
  proto.switchCompany = function (companyId) {
    const self = this;
    const tx = this.db.transaction(() => {
      const company = self.db.prepare('SELECT * FROM sys_company WHERE id = ?').get(companyId);
      if (!company) throw new Error('账套不存在');

      let book = self.db.prepare('SELECT * FROM acct_book WHERE company_id = ?').get(companyId);
      if (!book) {
        const br = self.db.prepare(
          'INSERT INTO acct_book (company_id, name, current_period) VALUES (?, ?, ?)'
        ).run(company.id, company.name, company.current_period);
        book = self.db.prepare('SELECT * FROM acct_book WHERE id = ?').get(br.lastInsertRowid);
      }

      // 确保当前期间存在
      const periodRow = self.db.prepare(
        'SELECT * FROM acct_period WHERE book_id = ? AND period = ?'
      ).get(book.id, company.current_period);
      if (!periodRow) {
        self.db.prepare('INSERT INTO acct_period (book_id, period, status) VALUES (?, ?, ?)')
          .run(book.id, company.current_period, 'open');
      }

      self.currentBookId = Number(book.id);
      self.currentCompanyId = Number(company.id);

      // 确保有预置数据
      seedBookData(self.db, Number(book.id));

      return { companyId: company.id, companyName: company.name };
    });
    return tx();
  };

  /**
   * 删除公司及关联的所有数据
   */
  proto.deleteCompany = function (companyId) {
    if (!this.db) throw new Error('数据库未初始化');

    const company = this.db.prepare('SELECT * FROM sys_company WHERE id = ?').get(companyId);
    if (!company) throw new Error('账套不存在');

    const book = this.db.prepare('SELECT * FROM acct_book WHERE company_id = ?').get(companyId);
    const bookId = book?.id;

    // 如果当前选中此公司，先重置
    if (this.currentCompanyId === Number(companyId)) {
      this.currentCompanyId = null;
      this.currentBookId = null;
    }

    const path = require('node:path');
    const fs = require('node:fs');

    if (bookId) {
      // 删除附件文件
      const attachDir = path.join(this.app.getPath('userData'), 'attachments');
      const voucherIds = this.db.prepare('SELECT id FROM gl_voucher WHERE book_id = ?').all(bookId);
      for (const v of voucherIds) {
        const dir = path.join(attachDir, String(v.id));
        try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* */ }
      }

      // 按外键依赖顺序级联删除
      this.db.prepare('DELETE FROM gl_voucher_entry WHERE voucher_id IN (SELECT id FROM gl_voucher WHERE book_id = ?)').run(bookId);
      this.db.prepare('DELETE FROM gl_voucher_attachment WHERE voucher_id IN (SELECT id FROM gl_voucher WHERE book_id = ?)').run(bookId);
      this.db.prepare('DELETE FROM gl_voucher WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM gl_opening_balance WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM multi_column_scheme WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM report_template WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM voucher_words WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM aux_project_value WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM aux_project_type WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM acct_period WHERE book_id = ?').run(bookId);
      this.db.prepare('DELETE FROM bd_subject WHERE book_id = ?').run(bookId);
    }

    this.db.prepare('DELETE FROM acct_book WHERE company_id = ?').run(companyId);
    this.db.prepare('DELETE FROM sys_operation_log WHERE company_id = ?').run(companyId);
    this.db.prepare('DELETE FROM sys_company WHERE id = ?').run(companyId);

    this._log('delete_company', `删除公司 ${company.name}`);
    return { deleted: true };
  };
}

module.exports = { applyCompanyMethods };
