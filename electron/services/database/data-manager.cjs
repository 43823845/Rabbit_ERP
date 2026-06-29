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
   * 退出时自动备份到程序安装目录下的 bak/ 目录
   * - 路径：{appPath}/bak/Rabbit_ERP_YYYY-MM-DD_HHmmss.db
   * - 自动清理 7 天前的旧备份
   * - 备份失败不影响退出流程
   */
  proto.autoBackup = function () {
    if (!this.db) return { success: false, reason: '数据库未初始化' };
    try {
      // 确定备份目录：安装目录/bak
      const appPath = this.app.isPackaged
        ? path.dirname(this.app.getPath('exe'))
        : this.app.getAppPath();
      const bakDir = path.join(appPath, 'bak');
      if (!fs.existsSync(bakDir)) fs.mkdirSync(bakDir, { recursive: true });

      // WAL checkpoint 确保数据完整写入
      this.db.pragma('wal_checkpoint(TRUNCATE)');

      // 生成时间戳文件名
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      const destPath = path.join(bakDir, `Rabbit_ERP_${ts}.bak`);

      // 执行备份
      const srcPath = path.join(this.app.getPath('userData'), 'Rabbit_ERP.db');
      fs.copyFileSync(srcPath, destPath);

      // 清理 7 天前的旧备份
      this._cleanOldBackups(bakDir, 7);

      console.log(`[autoBackup] 已备份至 ${destPath}`);
      return { success: true, path: destPath };
    } catch (err) {
      console.error('[autoBackup] 备份失败:', err.message);
      return { success: false, reason: err.message };
    }
  };

  /**
   * 清理超过 retentionDays 天的旧备份文件
   */
  proto._cleanOldBackups = function (bakDir, retentionDays) {
    try {
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const files = fs.readdirSync(bakDir);
      for (const f of files) {
        if (!f.startsWith('Rabbit_ERP_') || !f.endsWith('.bak')) continue;
        const fp = path.join(bakDir, f);
        try {
          if (fs.statSync(fp).mtimeMs < cutoff) {
            fs.unlinkSync(fp);
            console.log(`[autoBackup] 清理旧备份: ${f}`);
          }
        } catch (_) { /* 跳过无法处理的文件 */ }
      }
    } catch (_) { /* bak 目录可能不存在 */ }
  };

  /**
   * 查询操作日志
   */
  proto.getOperationLogs = function (filter) {
    if (!this.db) return [];
    this._ensureBookId();

    let sql = `SELECT l.id, l.action, l.detail, l.operator, l.created_at
                FROM sys_operation_log l
                WHERE l.book_id = ?
               `;
    const params = [this.currentBookId];

    if (filter) {
      if (filter.startDate) { sql += ' AND l.created_at >= ?'; params.push(filter.startDate); }
      if (filter.endDate) { sql += ' AND l.created_at <= ?'; params.push(filter.endDate + 'T23:59:59'); }
    }

    sql += ' ORDER BY l.id DESC';

    if (filter && filter.limit && filter.limit > 0) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params);
    return rows.map(r => ({
      id: r.id,
      userId: 0,
      username: r.operator,
      action: r.action,
      target: '',
      detail: r.detail,
      createdAt: r.created_at,
    }));
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
