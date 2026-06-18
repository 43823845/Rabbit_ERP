/**
 * database/openings.cjs — 期初余额管理
 *
 * 负责 gl_opening_balance 的查询和设置
 */

/**
 * 将期初余额方法挂载到 FinanceDatabase 原型
 */
function applyOpeningMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 设置/更新某个科目的期初余额
   */
  proto.setOpeningBalance = function ({ subjectCode, subjectName, debit, credit, period }) {
    this._ensureBookId();
    const safeDebit = Number(debit || 0);
    const safeCredit = Number(credit || 0);
    const existing = this.db.prepare(
      'SELECT * FROM gl_opening_balance WHERE subject_code = ? AND period = ? AND book_id = ?'
    ).get(subjectCode, period, this.currentBookId);

    if (existing) {
      this.db.prepare(
        'UPDATE gl_opening_balance SET subject_name = ?, debit = ?, credit = ? WHERE subject_code = ? AND period = ? AND book_id = ?'
      ).run(subjectName, safeDebit, safeCredit, subjectCode, period, this.currentBookId);
    } else {
      this.db.prepare(
        'INSERT INTO gl_opening_balance (subject_code, subject_name, debit, credit, period, book_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(subjectCode, subjectName, safeDebit, safeCredit, period, this.currentBookId);
    }
    return this.db.prepare(
      'SELECT * FROM gl_opening_balance WHERE subject_code = ? AND period = ? AND book_id = ?'
    ).get(subjectCode, period, this.currentBookId);
  };

  /**
   * 获取指定期间的期初余额
   */
  proto.getOpeningBalances = function (period) {
    if (!this.db) return [];
    this._ensureBookId();
    return this.db.prepare(
      'SELECT * FROM gl_opening_balance WHERE period = ? AND book_id = ? ORDER BY subject_code'
    ).all(period, this.currentBookId);
  };
}

module.exports = { applyOpeningMethods };
