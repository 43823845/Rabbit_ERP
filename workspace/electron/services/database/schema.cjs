/**
 * database/schema.cjs — 数据库表结构定义
 *
 * 包含所有 CREATE TABLE 语句、索引创建和兼容迁移
 */
const { DEFAULT_AUX_TYPES, DEFAULT_VOUCHER_WORDS } = require('./utils.cjs');

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
`;

/** 索引创建语句 */
const INDEXES = [
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_book_code ON bd_subject(book_id, code)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_aux_type_book_code ON aux_project_type(book_id, code)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_aux_value_type_code ON aux_project_value(type_id, code, book_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_opening_subject_period_book ON gl_opening_balance(subject_code, period, book_id)',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_words_book_word ON voucher_words(book_id, word)',
  // 性能索引
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_period ON gl_voucher(book_id, period)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_status ON gl_voucher(book_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_date ON gl_voucher(book_id, voucher_date)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_book_word_no ON gl_voucher(book_id, voucher_word, voucher_no)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_entry_voucher ON gl_voucher_entry(voucher_id)',
  'CREATE INDEX IF NOT EXISTS idx_voucher_entry_subject ON gl_voucher_entry(subject_code)',
  'CREATE INDEX IF NOT EXISTS idx_opening_book_period ON gl_opening_balance(book_id, period)',
  'CREATE INDEX IF NOT EXISTS idx_period_book ON acct_period(book_id, period)',
  'CREATE INDEX IF NOT EXISTS idx_log_action_time ON sys_operation_log(action, created_at)',
];

/** 报表模板种子数据 */
const REPORT_TEMPLATES = [
  // ===== 利润表 =====
  { report_type:'profit', row_no:1, name:'一、营业收入', is_header:1, bold:1, subject_codes:'6001', display_order:1 },
  { report_type:'profit', row_no:2, name:'减：营业成本', bold:0, subject_codes:'6401,6402', display_order:2 },
  { report_type:'profit', row_no:3, name:'税金及附加', bold:0, subject_codes:'6403', display_order:3 },
  { report_type:'profit', row_no:4, name:'其中：消费税', indent_level:1, subject_codes:'', display_order:4 },
  { report_type:'profit', row_no:5, name:'营业税', indent_level:1, subject_codes:'', display_order:5 },
  { report_type:'profit', row_no:6, name:'城市维护建设税', indent_level:1, subject_codes:'', display_order:6 },
  { report_type:'profit', row_no:7, name:'资源税', indent_level:1, subject_codes:'', display_order:7 },
  { report_type:'profit', row_no:8, name:'土地增值税', indent_level:1, subject_codes:'', display_order:8 },
  { report_type:'profit', row_no:9, name:'城镇土地使用税、房产税、车船税、印花税', indent_level:1, subject_codes:'', display_order:9 },
  { report_type:'profit', row_no:10, name:'教育费附加、矿产资源补偿税、排污费', indent_level:1, subject_codes:'', display_order:10 },
  { report_type:'profit', row_no:11, name:'销售费用', bold:0, subject_codes:'6601', display_order:11 },
  { report_type:'profit', row_no:12, name:'其中：商品维修费', indent_level:1, subject_codes:'', display_order:12 },
  { report_type:'profit', row_no:13, name:'广告费和业务宣传费', indent_level:1, subject_codes:'', display_order:13 },
  { report_type:'profit', row_no:14, name:'管理费用', bold:0, subject_codes:'6602', display_order:14 },
  { report_type:'profit', row_no:15, name:'其中：开办费', indent_level:1, subject_codes:'', display_order:15 },
  { report_type:'profit', row_no:16, name:'业务招待费', indent_level:1, subject_codes:'660201', display_order:16 },
  { report_type:'profit', row_no:17, name:'研究费用', indent_level:1, subject_codes:'', display_order:17 },
  { report_type:'profit', row_no:18, name:'财务费用', bold:0, subject_codes:'6603', display_order:18 },
  { report_type:'profit', row_no:19, name:'其中：利息费用', indent_level:1, subject_codes:'660302', display_order:19 },
  { report_type:'profit', row_no:20, name:'加：投资收益', bold:0, subject_codes:'6111', display_order:20 },
  { report_type:'profit', row_no:21, name:'二、营业利润', is_total:1, bold:1, display_order:21 },
  { report_type:'profit', row_no:22, name:'加：营业外收入', bold:0, subject_codes:'6301', display_order:22 },
  { report_type:'profit', row_no:23, name:'其中：政府补助', indent_level:1, subject_codes:'', display_order:23 },
  { report_type:'profit', row_no:24, name:'减：营业外支出', bold:0, subject_codes:'6711', display_order:24 },
  { report_type:'profit', row_no:25, name:'其中：坏账损失', indent_level:1, subject_codes:'', display_order:25 },
  { report_type:'profit', row_no:30, name:'三、利润总额', is_total:1, bold:1, display_order:30 },
  { report_type:'profit', row_no:31, name:'减：所得税费用', bold:0, subject_codes:'6801', display_order:31 },
  { report_type:'profit', row_no:32, name:'四、净利润', is_total:1, bold:1, display_order:32 },
  // ===== 资产负债表 =====
  { report_type:'balance', section:'asset', row_no:1, name:'流动资产：', is_header:1, bold:1, display_order:1 },
  { report_type:'balance', section:'asset', row_no:2, name:'货币资金', bold:0, subject_codes:'1001,1002', display_order:2 },
  { report_type:'balance', section:'asset', row_no:3, name:'短期投资', bold:0, display_order:3 },
  { report_type:'balance', section:'asset', row_no:4, name:'应收票据', bold:0, subject_codes:'1121', display_order:4 },
  { report_type:'balance', section:'asset', row_no:5, name:'应收账款', bold:0, subject_codes:'1122', display_order:5 },
  { report_type:'balance', section:'asset', row_no:6, name:'预付账款', bold:0, subject_codes:'1123', display_order:6 },
  { report_type:'balance', section:'asset', row_no:7, name:'应收股利', bold:0, display_order:7 },
  { report_type:'balance', section:'asset', row_no:8, name:'应收利息', bold:0, display_order:8 },
  { report_type:'balance', section:'asset', row_no:9, name:'其他应收款', bold:0, subject_codes:'1221', display_order:9 },
  { report_type:'balance', section:'asset', row_no:10, name:'存货', bold:0, subject_codes:'1405', display_order:10 },
  { report_type:'balance', section:'asset', row_no:15, name:'流动资产合计', is_total:1, bold:1, display_order:15 },
  { report_type:'balance', section:'asset', row_no:16, name:'非流动资产：', is_header:1, bold:1, display_order:16 },
  { report_type:'balance', section:'asset', row_no:17, name:'长期债券投资', bold:0, display_order:17 },
  { report_type:'balance', section:'asset', row_no:18, name:'长期股权投资', bold:0, subject_codes:'1511', display_order:18 },
  { report_type:'balance', section:'asset', row_no:19, name:'固定资产原价', bold:0, subject_codes:'1601', display_order:19 },
  { report_type:'balance', section:'asset', row_no:20, name:'减：累计折旧', bold:0, subject_codes:'1602', display_order:20 },
  { report_type:'balance', section:'asset', row_no:21, name:'固定资产账面价值', is_total:1, bold:1, display_order:21 },
  { report_type:'balance', section:'asset', row_no:25, name:'无形资产', bold:0, subject_codes:'1701', display_order:25 },
  { report_type:'balance', section:'asset', row_no:28, name:'长期待摊费用', bold:0, subject_codes:'1801', display_order:28 },
  { report_type:'balance', section:'asset', row_no:29, name:'非流动资产合计', is_total:1, bold:1, display_order:29 },
  { report_type:'balance', section:'asset', row_no:30, name:'资产总计', is_total:1, bold:1, display_order:30 },
  { report_type:'balance', section:'liability', row_no:31, name:'流动负债：', is_header:1, bold:1, display_order:31 },
  { report_type:'balance', section:'liability', row_no:32, name:'短期借款', bold:0, subject_codes:'2001', display_order:32 },
  { report_type:'balance', section:'liability', row_no:34, name:'应付账款', bold:0, subject_codes:'2202', display_order:34 },
  { report_type:'balance', section:'liability', row_no:36, name:'应付职工薪酬', bold:0, subject_codes:'2211', display_order:36 },
  { report_type:'balance', section:'liability', row_no:37, name:'应交税费', bold:0, subject_codes:'2221', display_order:37 },
  { report_type:'balance', section:'liability', row_no:40, name:'其他应付款', bold:0, subject_codes:'2241', display_order:40 },
  { report_type:'balance', section:'liability', row_no:41, name:'流动负债合计', is_total:1, bold:1, display_order:41 },
  { report_type:'balance', section:'liability', row_no:46, name:'非流动负债合计', is_total:1, bold:1, display_order:46 },
  { report_type:'balance', section:'liability', row_no:47, name:'负债合计', is_total:1, bold:1, display_order:47 },
  { report_type:'balance', section:'equity', row_no:48, name:'所有者权益：', is_header:1, bold:1, display_order:48 },
  { report_type:'balance', section:'equity', row_no:49, name:'实收资本（或股本）', bold:0, subject_codes:'4001', display_order:49 },
  { report_type:'balance', section:'equity', row_no:50, name:'资本公积', bold:0, subject_codes:'4002', display_order:50 },
  { report_type:'balance', section:'equity', row_no:51, name:'盈余公积', bold:0, subject_codes:'4101', display_order:51 },
  { report_type:'balance', section:'equity', row_no:52, name:'未分配利润', bold:0, subject_codes:'4104', display_order:52 },
  { report_type:'balance', section:'equity', row_no:53, name:'所有者权益合计', is_total:1, bold:1, display_order:53 },
  { report_type:'balance', section:'equity', row_no:54, name:'负债和所有者权益总计', is_total:1, bold:1, display_order:99 },
];

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
