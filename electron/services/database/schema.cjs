/**
 * database/schema.cjs — 数据库表结构定义
 *
 * 包含所有 CREATE TABLE 语句、索引创建和兼容迁移
 */
const { DEFAULT_AUX_TYPES, DEFAULT_VOUCHER_WORDS } = require('./utils.cjs');
const { REPORT_TEMPLATES } = require('../../../shared/report-templates.cjs');

/** 完整的 DDL 语句 */
const DDL = `
  -- ==================== 系统表 ====================

  CREATE TABLE IF NOT EXISTS db_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sys_company (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT DEFAULT '',
    legal_representative TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    tax_no TEXT DEFAULT '',
    current_period TEXT NOT NULL DEFAULT '2026-06',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sys_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    alias TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'accountant' CHECK(role IN ('admin','accountant','viewer')),
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  -- ==================== 业务表 ====================

  CREATE TABLE IF NOT EXISTS acct_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    current_period TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES sys_company(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS acct_period (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    closed_at TEXT,
    reopened_at TEXT,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bd_subject (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('debit','credit')),
    category TEXT NOT NULL CHECK(category IN ('asset','liability','equity','cost','income','expense')),
    parent_code TEXT DEFAULT '',
    level INTEGER NOT NULL DEFAULT 1,
    enabled INTEGER NOT NULL DEFAULT 1,
    builtin INTEGER NOT NULL DEFAULT 0,
    aux_type TEXT DEFAULT '',
    is_cash INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gl_opening_balance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    subject_code TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    period TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE,
    UNIQUE(subject_code, period, book_id)
  );

  CREATE TABLE IF NOT EXISTS gl_voucher (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    period TEXT NOT NULL,
    voucher_word TEXT NOT NULL,
    voucher_no INTEGER NOT NULL,
    voucher_date TEXT NOT NULL,
    remark TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','audited','posted','deleted')),
    maker TEXT NOT NULL,
    bookkeeper TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gl_voucher_entry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    summary TEXT NOT NULL,
    subject_code TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    debit REAL NOT NULL DEFAULT 0,
    credit REAL NOT NULL DEFAULT 0,
    quantity REAL NOT NULL DEFAULT 0,
    unit_price REAL NOT NULL DEFAULT 0,
    unit TEXT DEFAULT '',
    aux_type_id INTEGER DEFAULT NULL,
    aux_value_id INTEGER DEFAULT NULL,
    line_no INTEGER NOT NULL,
    FOREIGN KEY (voucher_id) REFERENCES gl_voucher(id) ON DELETE CASCADE,
    FOREIGN KEY (aux_type_id) REFERENCES aux_project_type(id) ON DELETE SET NULL,
    FOREIGN KEY (aux_value_id) REFERENCES aux_project_value(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS aux_project_type (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS aux_project_value (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (type_id) REFERENCES aux_project_type(id) ON DELETE CASCADE,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS gl_voucher_attachment (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL,
    mime_type TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (voucher_id) REFERENCES gl_voucher(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS multi_column_scheme (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    parent_code TEXT NOT NULL,
    parent_name TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'debit',
    children_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS report_template (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    report_type TEXT NOT NULL CHECK(report_type IN ('profit','balance')),
    section TEXT DEFAULT '',
    row_no INTEGER NOT NULL,
    name TEXT NOT NULL,
    subject_codes TEXT DEFAULT '',
    is_total INTEGER DEFAULT 0,
    is_header INTEGER DEFAULT 0,
    indent_level INTEGER DEFAULT 0,
    bold INTEGER DEFAULT 0,
    display_order INTEGER NOT NULL,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS voucher_words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    print_title TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sys_operation_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    operator TEXT NOT NULL DEFAULT 'system',
    company_id INTEGER NOT NULL DEFAULT 0,
    book_id INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS voucher_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    entries_json TEXT NOT NULL DEFAULT '[]',
    share_type TEXT NOT NULL DEFAULT 'personal' CHECK(share_type IN ('personal','shared')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS voucher_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS fa_asset_card (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    asset_code TEXT NOT NULL DEFAULT '',
    asset_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '办公设备',
    buy_date TEXT NOT NULL DEFAULT '',
    original_value REAL NOT NULL DEFAULT 0,
    residual_rate REAL NOT NULL DEFAULT 0.05,
    useful_life_years INTEGER NOT NULL DEFAULT 5,
    monthly_depreciation REAL NOT NULL DEFAULT 0,
    accumulated_depreciation REAL NOT NULL DEFAULT 0,
    net_value REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT '在用' CHECK(status IN ('在用','已提足折旧','报废','已处置')),
    department TEXT NOT NULL DEFAULT '',
    remark TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (book_id) REFERENCES acct_book(id) ON DELETE CASCADE
  );
`;

/** 索引创建语句 */
const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_book_code ON bd_subject(book_id, code)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_aux_type_book_code ON aux_project_type(book_id, code)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_aux_value_type_code ON aux_project_value(type_id, code, book_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_opening_subject_period_book ON gl_opening_balance(subject_code, period, book_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_words_book_word ON voucher_words(book_id, word)',
  // UNIQUE约束：防止重复凭证和重复期间
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_book_word_no_period ON gl_voucher(book_id, voucher_word, voucher_no, period)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_period_book ON acct_period(book_id, period)',
  // 性能索引
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_period ON gl_voucher(book_id, period)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_status ON gl_voucher(book_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_date ON gl_voucher(book_id, voucher_date)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_entry_voucher ON gl_voucher_entry(voucher_id)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_entry_subject ON gl_voucher_entry(subject_code)',
  'CREATE INDEX IF NOT EXISTS idx_opening_book_period ON gl_opening_balance(book_id, period)',
  // 注意：idx_period_book 已在上面改为 UNIQUE，这里不再重复创建
  'CREATE INDEX IF NOT EXISTS idx_log_action_time ON sys_operation_log(action, created_at)',
  'CREATE INDEX IF NOT EXISTS idx_asset_book ON fa_asset_card(book_id)',
  'CREATE INDEX IF NOT EXISTS idx_asset_book_status ON fa_asset_card(book_id, status)',
];

// REPORT_TEMPLATES 已移至 ../../shared/report-templates.cjs（共享数据源）

/**
 * 执行数据库 schema 创建和索引
 * @param {import('better-sqlite3').Database} db
 */
function applySchema(db) {
  db.exec(DDL);
  for (const idx of INDEXES) {
    db.exec(idx);
  }
}

/**
 * 为新账套预置种子数据
 * @param {import('better-sqlite3').Database} db
 * @param {number} bookId
 */
function seedBookData(db, bookId) {
  // 1. 预置会计科目
  const { getBuiltinSubjects } = require('./utils.cjs');
  const subjects = getBuiltinSubjects();
  const subjCount = db.prepare('SELECT COUNT(*) as cnt FROM bd_subject WHERE book_id = ? AND builtin = 1').get(bookId);
  if (subjCount.cnt === 0) {
    const stmt = db.prepare(
      'INSERT INTO bd_subject (book_id, code, name, direction, category, parent_code, level, enabled, builtin, aux_type, is_cash) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const s of subjects) {
        stmt.run(bookId, s.code, s.name, s.direction, s.category, s.parent_code || '', s.level || 1, s.aux_type || '', s.is_cash || 0);
      }
    });
    tx();
  }

  // 2. 预置辅助核算类别
  const auxCount = db.prepare('SELECT COUNT(*) as cnt FROM aux_project_type WHERE book_id = ?').get(bookId);
  if (auxCount.cnt === 0) {
    const stmt = db.prepare('INSERT INTO aux_project_type (book_id, code, name) VALUES (?, ?, ?)');
    const tx = db.transaction(() => {
      for (const t of DEFAULT_AUX_TYPES) {
        stmt.run(bookId, t.code, t.name);
      }
    });
    tx();
  }

  // 3. 预置凭证字
  const vwCount = db.prepare('SELECT COUNT(*) as cnt FROM voucher_words WHERE book_id = ?').get(bookId);
  if (vwCount.cnt === 0) {
    const stmt = db.prepare(
      'INSERT INTO voucher_words (book_id, word, print_title, is_default) VALUES (?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const vw of DEFAULT_VOUCHER_WORDS) {
        stmt.run(bookId, vw.word, vw.print_title, vw.is_default);
      }
    });
    tx();
  }

  // 4. 预置报表模板
  const rtCount = db.prepare('SELECT COUNT(*) as cnt FROM report_template WHERE book_id = ?').get(bookId);
  if (rtCount.cnt === 0) {
    const stmt = db.prepare(
      'INSERT INTO report_template (book_id, report_type, section, row_no, name, subject_codes, is_total, is_header, indent_level, bold, display_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const tx = db.transaction(() => {
      for (const t of REPORT_TEMPLATES) {
        stmt.run(bookId, t.report_type, t.section || '', t.row_no, t.name,
          t.subject_codes || '', t.is_total || 0, t.is_header || 0, t.indent_level || 0, t.bold || 0, t.display_order);
      }
    });
    tx();
  }
}

module.exports = { applySchema, seedBookData, REPORT_TEMPLATES };
