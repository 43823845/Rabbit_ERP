/**
 * database/voucher-words.cjs — 凭证字管理
 *
 * 负责 voucher_words 的 CRUD
 */

/**
 * 将凭证字管理方法挂载到 FinanceDatabase 原型
 */
function applyVoucherWordMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  proto.listVoucherWords = function () {
    if (!this.db) return this.memory.voucherWords || [];
    this._ensureBookId();
    let words = this.db.prepare(
      'SELECT * FROM voucher_words WHERE book_id = ? ORDER BY is_default DESC, id ASC'
    ).all(this.currentBookId);

    if (words.length === 0) {
      const defaults = [
        { word: '记', print_title: '记账凭证', is_default: 1 },
        { word: '收', print_title: '收款凭证', is_default: 0 },
        { word: '付', print_title: '付款凭证', is_default: 0 },
        { word: '转', print_title: '转账凭证', is_default: 0 },
      ];
      for (const d of defaults) {
        this.db.prepare('INSERT INTO voucher_words (book_id, word, print_title, is_default) VALUES (?, ?, ?, ?)')
          .run(this.currentBookId, d.word, d.print_title, d.is_default);
      }
      words = this.db.prepare(
        'SELECT * FROM voucher_words WHERE book_id = ? ORDER BY is_default DESC, id ASC'
      ).all(this.currentBookId);
    }
    return words;
  };

  proto.createVoucherWord = function ({ word, printTitle, isDefault }) {
    if (!this.db) throw new Error('数据库未初始化');
    this._ensureBookId();

    const exists = this.db.prepare('SELECT id FROM voucher_words WHERE book_id = ? AND word = ?').get(this.currentBookId, word);
    if (exists) throw new Error(`凭证字"${word}"已存在`);

    const self = this;
    const id = this.db.transaction(() => {
      const rid = self.db.prepare(
        'INSERT INTO voucher_words (book_id, word, print_title, is_default) VALUES (?, ?, ?, ?)'
      ).run(self.currentBookId, word, printTitle || '', isDefault ? 1 : 0).lastInsertRowid;
      if (isDefault) {
        self.db.prepare('UPDATE voucher_words SET is_default = 0 WHERE book_id = ? AND id != ?')
          .run(self.currentBookId, Number(rid));
      }
      return rid;
    })();

    this._log('create_voucher_word', `凭证字 ${word}`);
    return this.db.prepare('SELECT * FROM voucher_words WHERE id = ?').get(id);
  };

  proto.updateVoucherWord = function (id, { word, printTitle, isDefault }) {
    if (!this.db) throw new Error('数据库未初始化');
    this._ensureBookId();

    const existing = this.db.prepare('SELECT * FROM voucher_words WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!existing) throw new Error('凭证字不存在');

    const newWord = word ?? existing.word;
    const newPrintTitle = printTitle ?? existing.print_title;
    const newDefault = isDefault !== undefined ? isDefault : existing.is_default;

    const self = this;
    this.db.transaction(() => {
      self.db.prepare('UPDATE voucher_words SET word = ?, print_title = ?, is_default = ? WHERE id = ?')
        .run(newWord, newPrintTitle, newDefault ? 1 : 0, id);
      if (newDefault) {
        self.db.prepare('UPDATE voucher_words SET is_default = 0 WHERE book_id = ? AND id != ?')
          .run(self.currentBookId, id);
      }
    })();

    this._log('update_voucher_word', `凭证字 ${newWord}`);
    return this.db.prepare('SELECT * FROM voucher_words WHERE id = ?').get(id);
  };

  proto.deleteVoucherWord = function (id) {
    if (!this.db) throw new Error('数据库未初始化');
    this._ensureBookId();

    const existing = this.db.prepare('SELECT * FROM voucher_words WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!existing) throw new Error('凭证字不存在');

    const usageCount = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM gl_voucher WHERE book_id = ? AND voucher_word = ?'
    ).get(this.currentBookId, existing.word);
    if (usageCount && usageCount.cnt > 0) {
      throw new Error(`凭证字"${existing.word}"已被 ${usageCount.cnt} 张凭证使用，无法删除`);
    }

    this.db.prepare('DELETE FROM voucher_words WHERE id = ?').run(id);
    this._log('delete_voucher_word', `凭证字 ${existing.word}`);
  };
}

module.exports = { applyVoucherWordMethods };
