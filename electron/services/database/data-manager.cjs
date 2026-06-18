/**
 * database/data-manager.cjs — 数据管理
 *
 * 负责数据库信息查询、备份、导出、VACUUM 等维护操作
 */
const path = require('node:path');
const fs = require('node:fs');

/**
 * 将数据管理方法挂载到 FinanceDatabase 原型
 */
function applyDataManagerMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 获取数据库基本信息
   */
  proto.getDatabaseInfo = function () {
    if (!this.db) return { dbPath: '', dbSize: 0, pageCount: 0, freelistCount: 0, isMock: true };
    const dbPath = path.join(this.app.getPath('userData'), 'Rabbit_ERP.db');
    let dbSize = 0;
    try { dbSize = fs.statSync(dbPath).size; } catch (_) { /* */ }
    const pageCount = this.db.pragma('page_count', { simple: true });
    const freelistCount = this.db.pragma('freelist_count', { simple: true });

    const tableCounts = {};
    try {
      const tables = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      ).all();
      for (const t of tables) {
        try {
          const r = this.db.prepare(`SELECT COUNT(*) as cnt FROM "${t.name}"`).get();
          if (r) tableCounts[t.name] = r.cnt;
        } catch (_) { /* */ }
      }
    } catch (_) { /* */ }

    return { dbPath, dbSize, pageCount, freelistCount, tableCounts, isMock: false };
  };

  /**
   * VACUUM 整理数据库
   */
  proto.vacuum = function () {
    if (!this.db) throw new Error('数据库未初始化');
    this._ensureBookId();
    const dbPath = path.join(this.app.getPath('userData'), 'Rabbit_ERP.db');
    let beforeSize = 0;
    try { beforeSize = fs.statSync(dbPath).size; } catch (_) { /* */ }
    this.db.exec('VACUUM');
    let afterSize = 0;
    try { afterSize = fs.statSync(dbPath).size; } catch (_) { /* */ }
    this._log('vacuum', '数据库整理完成');
    return { success: true, beforeSize, afterSize };
  };

  /**
   * 备份数据库到指定路径
   */
  proto.backupDatabase = function (destPath) {
    if (!this.db) throw new Error('数据库未初始化');
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    const srcPath = path.join(this.app.getPath('userData'), 'Rabbit_ERP.db');
    fs.copyFileSync(srcPath, destPath);
    this._log('backup', `数据库已备份至 ${destPath}`);
    return { success: true, path: destPath };
  };

  /**
   * 导出所有数据为 JSON
   */
  proto.exportAllData = function () {
    if (!this.db) throw new Error('数据库未初始化');
    const tables = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'db_config'"
    ).all();
    const result = {};
    for (const t of tables) {
      try {
        result[t.name] = this.db.prepare(`SELECT * FROM "${t.name}"`).all();
      } catch (_) { result[t.name] = []; }
    }
    return result;
  };
}

module.exports = { applyDataManagerMethods };
