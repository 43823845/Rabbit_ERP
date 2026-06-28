/**
 * database/summaries.cjs — 摘要库管理
 *
 * 负责 voucher_summaries 表的 CRUD 操作
 */

/**
 * 将摘要库方法挂载到 FinanceDatabase 原型
 */
function applySummaryMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 列出所有摘要
   */
  proto.listVoucherSummaries = function () {
    if (!this.db) return [];
    this._ensureBookId();
    const rows = this.db.prepare(
      'SELECT * FROM voucher_summaries WHERE book_id = ? ORDER BY id DESC'
    ).all(this.currentBookId);
    return rows.map(r => ({
      id: r.id,
      text: r.text,
      category: r.category,
      createdAt: r.created_at,
    }));
  };

  /**
   * 创建摘要
   */
  proto.createVoucherSummary = function (p) {
    if (!this.db) throw new Error('数据库未初始化');
    if (!p.text || !p.text.trim()) throw new Error('摘要内容不能为空');
    this._ensureBookId();
    const result = this.db.prepare(
      'INSERT INTO voucher_summaries (book_id, text, category) VALUES (?, ?, ?)'
    ).run(this.currentBookId, p.text.trim(), p.category || '');
    const row = this.db.prepare('SELECT * FROM voucher_summaries WHERE id = ?').get(result.lastInsertRowid);
    return {
      id: row.id,
      text: row.text,
      category: row.category,
      createdAt: row.created_at,
    };
  };

  /**
   * 删除摘要
   */
  proto.deleteVoucherSummary = function (id) {
    if (!this.db) return;
    this._ensureBookId();
    const row = this.db.prepare('SELECT * FROM voucher_summaries WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!row) throw new Error('摘要不存在');
    this.db.prepare('DELETE FROM voucher_summaries WHERE id = ? AND book_id = ?').run(id, this.currentBookId);
  };
}

module.exports = { applySummaryMethods };
