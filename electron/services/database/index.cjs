/**
 * database/index.cjs — 数据库服务主入口
 *
 * 组合所有功能模块，对外导出统一的 FinanceDatabase 类
 */
const path = require('node:path');
const { createSeedData } = require('./utils.cjs');
const { applySchema } = require('./schema.cjs');
const { applyCompanyMethods } = require('./companies.cjs');
const { applyUserMethods } = require('./users.cjs');
const { applySubjectMethods } = require('./subjects.cjs');
const { applyVoucherMethods } = require('./vouchers.cjs');
const { applyPeriodMethods } = require('./periods.cjs');
const { applyOpeningMethods } = require('./openings.cjs');
const { applyReportMethods } = require('./reports.cjs');
const { applyAuxiliaryMethods } = require('./auxiliary.cjs');
const { applyAttachmentMethods } = require('./attachments.cjs');
const { applyVoucherWordMethods } = require('./voucher-words.cjs');
const { applyMultiColumnMethods } = require('./multi-column.cjs');
const { applyDataManagerMethods } = require('./data-manager.cjs');

let Database;
try {
  Database = require('better-sqlite3');
} catch {
  Database = null;
}

class FinanceDatabase {
  constructor(app) {
    this.app = app;
    this.db = null;
    this.memory = null;
    this.currentBookId = null;
    this.currentCompanyId = null;
  }

  // ==================== 初始化 ====================

  initialize() {
    if (Database) {
      const dbPath = path.join(this.app.getPath('userData'), 'Rabbit_ERP.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      applySchema(this.db);
      this.seedDefaultUsers();
    }
    this.memory = createSeedData();
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
  }

  // ==================== 内部工具方法 ====================

  _ensureBookId() {
    if (this.currentBookId) return;
    const book = this.db.prepare('SELECT id FROM acct_book ORDER BY id LIMIT 1').get();
    if (book) {
      this.currentBookId = book.id;
      this.currentCompanyId = this.db.prepare('SELECT company_id FROM acct_book WHERE id = ?').get(book.id)?.company_id || null;
    }
  }

  _log(action, detail, operator = 'system') {
    if (this.db) {
      this.db.prepare(
        'INSERT INTO sys_operation_log (action, detail, operator, company_id, book_id) VALUES (?, ?, ?, ?, ?)'
      ).run(action, detail, operator, this.currentCompanyId || 0, this.currentBookId || 0);
    }
  }

  _logInit(action, detail) {
    if (this.db) {
      this.db.prepare(
        'INSERT INTO sys_operation_log (action, detail, operator, company_id, book_id) VALUES (?, ?, ?, 0, 0)'
      ).run(action, detail, 'system');
    }
  }

  // ==================== Bootstrap ====================

  getBootstrapData() {
    if (!this.db) return this.memory;
    this._ensureBookId();
    return {
      book: this.db.prepare(
        'SELECT id, name, name AS company_name, current_period, created_at FROM acct_book WHERE id = ?'
      ).get(this.currentBookId),
      subjects: this.db.prepare('SELECT * FROM bd_subject WHERE book_id = ? AND enabled = 1 ORDER BY code').all(this.currentBookId),
      vouchers: this.listVouchers({}),
      openings: this.db.prepare('SELECT * FROM gl_opening_balance WHERE book_id = ?').all(this.currentBookId),
      periods: this.db.prepare('SELECT * FROM acct_period WHERE book_id = ? ORDER BY period').all(this.currentBookId),
      auxProjectTypes: this.listAuxProjectTypes(),
      auxProjectValues: this.db.prepare('SELECT * FROM aux_project_value WHERE book_id = ? ORDER BY type_id, code').all(this.currentBookId),
    };
  }
}

// 将所有功能模块方法挂载到 FinanceDatabase 原型
applyCompanyMethods(FinanceDatabase);
applyUserMethods(FinanceDatabase);
applySubjectMethods(FinanceDatabase);
applyVoucherMethods(FinanceDatabase);
applyPeriodMethods(FinanceDatabase);
applyOpeningMethods(FinanceDatabase);
applyReportMethods(FinanceDatabase);
applyAuxiliaryMethods(FinanceDatabase);
applyAttachmentMethods(FinanceDatabase);
applyVoucherWordMethods(FinanceDatabase);
applyMultiColumnMethods(FinanceDatabase);
applyDataManagerMethods(FinanceDatabase);

module.exports = { FinanceDatabase, validateVoucher: require('./utils.cjs').validateVoucher };
