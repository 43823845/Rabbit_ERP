/**
 * database/templates.cjs — 凭证模板管理
 *
 * 负责 voucher_templates 表的 CRUD 操作
 */

/**
 * 将凭证模板方法挂载到 FinanceDatabase 原型
 */
function applyTemplateMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 列出所有模板
   */
  proto.listVoucherTemplates = function () {
    if (!this.db) return [];
    this._ensureBookId();
    const rows = this.db.prepare(
      'SELECT * FROM voucher_templates WHERE book_id = ? ORDER BY id DESC'
    ).all(this.currentBookId);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      entries: JSON.parse(r.entries_json || '[]'),
      shareType: r.share_type,
      createdAt: r.created_at,
    }));
  };

  /**
   * 保存模板
   */
  proto.saveVoucherTemplate = function (p) {
    if (!this.db) throw new Error('数据库未初始化');
    this._ensureBookId();
    const id = p.id;
    if (id) {
      // 更新已有模板
      this.db.prepare(
        'UPDATE voucher_templates SET name = ?, entries_json = ?, share_type = ? WHERE id = ? AND book_id = ?'
      ).run(p.name, JSON.stringify(p.entries || []), p.shareType || 'personal', id, this.currentBookId);
      this._log('update_template', `模板 ${p.name}`);
    } else {
      // 新建模板
      const result = this.db.prepare(
        'INSERT INTO voucher_templates (book_id, name, entries_json, share_type) VALUES (?, ?, ?, ?)'
      ).run(this.currentBookId, p.name, JSON.stringify(p.entries || []), p.shareType || 'personal');
      this._log('create_template', `模板 ${p.name}`);
      const row = this.db.prepare('SELECT * FROM voucher_templates WHERE id = ?').get(result.lastInsertRowid);
      return {
        id: row.id,
        name: row.name,
        entries: JSON.parse(row.entries_json || '[]'),
        shareType: row.share_type,
        createdAt: row.created_at,
      };
    }
    const row = this.db.prepare('SELECT * FROM voucher_templates WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      entries: JSON.parse(row.entries_json || '[]'),
      shareType: row.share_type,
      createdAt: row.created_at,
    };
  };

  /**
   * 删除模板
   */
  proto.deleteVoucherTemplate = function (id) {
    if (!this.db) return;
    this._ensureBookId();
    const row = this.db.prepare('SELECT * FROM voucher_templates WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!row) throw new Error('模板不存在');
    this.db.prepare('DELETE FROM voucher_templates WHERE id = ? AND book_id = ?').run(id, this.currentBookId);
    this._log('delete_template', `模板 ${row.name}`);
  };
}

module.exports = { applyTemplateMethods };
