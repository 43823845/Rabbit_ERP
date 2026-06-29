/**
 * database/periods.cjs — 会计期间管理
 *
 * 负责 acct_period 的结账/反结账，含损益结转逻辑
 */

/**
 * 将期间管理方法挂载到 FinanceDatabase 原型
 */
function applyPeriodMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 结账：关闭指定期间
   */
  proto.closePeriod = function (period) {
    this._ensureBookId();

    const periodRow = this.db.prepare(
      'SELECT * FROM acct_period WHERE book_id = ? AND period = ?'
    ).get(this.currentBookId, period);
    if (!periodRow) throw new Error(`期间 ${period} 不存在，请先在系统设置中初始化期间`);
    if (periodRow.status === 'closed') throw new Error(`期间 ${period} 已经结账，无需重复操作`);

    // 检查前序期间是否已结账
    const yearNum = parseInt(period.substring(0, 4));
    const monthNum = parseInt(period.substring(5, 7));
    for (let m = 1; m < monthNum; m++) {
      const prev = yearNum + '-' + String(m).padStart(2, '0');
      const pr = this.db.prepare(
        'SELECT * FROM acct_period WHERE book_id = ? AND period = ?'
      ).get(this.currentBookId, prev);
      if (!pr) throw new Error(`前序期间 ${prev} 未初始化，请先在系统设置中初始化该期间后再结账`);
      if (pr.status !== 'closed') {
        throw new Error(`前一期间 ${prev} 尚未结账，请按会计期间顺序逐月结账`);
      }
    }

    // 检查未过账凭证
    const unpostedCnt = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM gl_voucher WHERE book_id = ? AND period = ? AND status IN ('draft','audited')"
    ).get(this.currentBookId, period);
    if (unpostedCnt && unpostedCnt.cnt > 0) {
      throw new Error(`当前期间存在 ${unpostedCnt.cnt} 张未过账凭证，请先审核并过账全部凭证后再结账`);
    }

    // 强制试算平衡检查（不依赖前端开关，后端硬校验）
    const tb = this.getTrialBalance(period);
    if (!tb || !tb.totals) throw new Error('无法获取试算平衡数据，请检查科目余额');
    // 三层平衡校验：期初余额、本期发生额、期末余额
    const openingDiff = Math.abs((tb.totals.openingDebit || 0) - (tb.totals.openingCredit || 0));
    if (openingDiff > 0.01) {
      throw new Error(`期初余额不平衡（借方 ${(tb.totals.openingDebit || 0).toFixed(2)} ≠ 贷方 ${(tb.totals.openingCredit || 0).toFixed(2)}，差额 ${openingDiff.toFixed(2)}），请检查期初余额`);
    }
    const amountDiff = Math.abs((tb.totals.amountDebit || 0) - (tb.totals.amountCredit || 0));
    if (amountDiff > 0.01) {
      throw new Error(`本期发生额不平衡（借方 ${(tb.totals.amountDebit || 0).toFixed(2)} ≠ 贷方 ${(tb.totals.amountCredit || 0).toFixed(2)}，差额 ${amountDiff.toFixed(2)}），请检查凭证借贷平衡`);
    }
    const endingDiff = Math.abs((tb.totals.endingDebit || 0) - (tb.totals.endingCredit || 0));
    if (endingDiff > 0.01) {
      throw new Error(`期末余额不平衡（借方 ${(tb.totals.endingDebit || 0).toFixed(2)} ≠ 贷方 ${(tb.totals.endingCredit || 0).toFixed(2)}，差额 ${endingDiff.toFixed(2)}），请检查凭证后再结账`);
    }

    // 损益结转
    this._carryForwardProfit(period);

    // 关闭期间
    this.db.prepare(
      "UPDATE acct_period SET status = 'closed', closed_at = datetime('now','localtime') WHERE book_id = ? AND period = ?"
    ).run(this.currentBookId, period);
    this._log('close_period', period);
  };

  /**
   * 反结账：重新打开指定期间
   */
  proto.reopenPeriod = function (period) {
    this._ensureBookId();

    const periodRow = this.db.prepare(
      'SELECT * FROM acct_period WHERE book_id = ? AND period = ?'
    ).get(this.currentBookId, period);
    if (!periodRow) throw new Error(`期间 ${period} 不存在`);
    if (periodRow.status !== 'closed') throw new Error(`期间 ${period} 尚未结账，无需反结账`);

    // 必须从最后已结账月份开始倒序反结账
    const yearNum = parseInt(period.substring(0, 4));
    for (let m = 12; m >= 1; m--) {
      const cp = yearNum + '-' + String(m).padStart(2, '0');
      const cr = this.db.prepare(
        'SELECT * FROM acct_period WHERE book_id = ? AND period = ?'
      ).get(this.currentBookId, cp);
      if (cr && cr.status === 'closed' && cp !== period) {
        throw new Error(`期间 ${cp} 已结账，请先反结账 ${cp}（必须从最后一个已结账期间开始倒序反结账）`);
      }
      if (cr && cr.status === 'closed' && cp === period) break;
    }

    this._reverseCarryForward(period);

    this.db.prepare(
      "UPDATE acct_period SET status = 'open', reopened_at = datetime('now','localtime') WHERE book_id = ? AND period = ?"
    ).run(this.currentBookId, period);
    this._log('reopen_period', period);
  };

  /**
   * 损益结转：将收入/费用余额结转至本年利润（4103）
   */
  proto._carryForwardProfit = function (period) {
    this._ensureBookId();
    const self = this;

    // 幂等检查：如果当前期间已有损益结转凭证，跳过
    const existingCF = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM gl_voucher WHERE book_id = ? AND period = ? AND remark LIKE '[损益结转]%' AND status = 'posted'"
    ).get(this.currentBookId, period);
    if (existingCF && existingCF.cnt > 0) {
      this._log('carry_forward', `期间 ${period} 已存在 ${existingCF.cnt} 张损益结转凭证，跳过重复结转`);
      return;
    }

    const balances = this.getSubjectBalance({ period });
    const incomeCategories = ['income', 'expense'];
    const profitLossBalances = balances.filter(b => {
      const subj = self.db.prepare('SELECT * FROM bd_subject WHERE code = ? AND book_id = ?').get(b.code, self.currentBookId);
      return subj && incomeCategories.includes(subj.category);
    });

    if (profitLossBalances.length === 0) {
      this._log('carry_forward', `期间 ${period} 无损益类科目余额，跳过结转`);
      return;
    }

    const entries = [];
    let lineNo = 0;
    let totalIncome = 0;
    let totalExpense = 0;
    const yearNum = parseInt(period.substring(0, 4));
    const monthNum = parseInt(period.substring(5, 7));
    // 获取当月最后一天作为凭证日期
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const dateStr = `${period}-${String(lastDay).padStart(2, '0')}`;

    for (const bal of profitLossBalances) {
      const subj = self.db.prepare('SELECT * FROM bd_subject WHERE code = ? AND book_id = ?').get(bal.code, self.currentBookId);
      if (!subj || Math.abs(bal.balance) < 0.001) continue;

      const absBal = Math.abs(bal.balance);
      lineNo++;

      if (subj.category === 'income') {
        entries.push({
          summary: `结转${subj.name}`,
          subjectCode: subj.code, subjectName: subj.name,
          debit: absBal, credit: 0,
          quantity: 0, unitPrice: 0, unit: '',
          auxTypeId: null, auxValueId: null, lineNo,
        });
        totalIncome += absBal;
      } else if (subj.category === 'expense') {
        entries.push({
          summary: `结转${subj.name}`,
          subjectCode: subj.code, subjectName: subj.name,
          debit: 0, credit: absBal,
          quantity: 0, unitPrice: 0, unit: '',
          auxTypeId: null, auxValueId: null, lineNo,
        });
        totalExpense += absBal;
      }
    }

    if (entries.length === 0) return;

    lineNo++;
    entries.push({
      summary: '本期损益结转至本年利润',
      subjectCode: '4103', subjectName: '本年利润',
      debit: totalExpense, credit: totalIncome,
      quantity: 0, unitPrice: 0, unit: '',
      auxTypeId: null, auxValueId: null, lineNo,
    });

    const defaultVw = this.db.prepare(
      'SELECT word FROM voucher_words WHERE book_id = ? AND is_default = 1 LIMIT 1'
    ).get(this.currentBookId);
    const voucherWord = defaultVw?.word || '记';
    const voucherNo = this.getNextVoucherNo(voucherWord, period);

    const tx = this.db.transaction(() => {
      const result = self.db.prepare(
        "INSERT INTO gl_voucher (book_id, period, voucher_word, voucher_no, voucher_date, remark, status, maker, bookkeeper) VALUES (?, ?, ?, ?, ?, ?, 'posted', 'system', '')"
      ).run(self.currentBookId, period, voucherWord, voucherNo, dateStr, `[损益结转] ${period} 期末损益结转`);

      const insEntry = self.db.prepare(
        'INSERT INTO gl_voucher_entry (voucher_id, summary, subject_code, subject_name, debit, credit, quantity, unit_price, unit, aux_type_id, aux_value_id, line_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );

      for (const e of entries) {
        insEntry.run(result.lastInsertRowid, e.summary, e.subjectCode, e.subjectName,
          e.debit, e.credit, e.quantity, e.unitPrice, e.unit, e.auxTypeId, e.auxValueId, e.lineNo);
      }
    });
    tx();

    const netProfit = totalIncome - totalExpense;
    this._log('carry_forward', `期间 ${period} 损益结转完成，结转 ${entries.length} 条分录，净利润 ${netProfit.toFixed(2)}`);

    // 年末结转：12月份结账时，将本年利润(4103)余额结转至利润分配-未分配利润(4104)
    if (monthNum === 12) {
      this._carryForwardYearEndProfit(period, netProfit);
    }
  };

  /**
   * 年末利润结转：将本年利润(4103)余额结转至利润分配-未分配利润(4104)
   */
  proto._carryForwardYearEndProfit = function (period, existingNetProfit) {
    const self = this;
    // 获取 4103(本年利润) 和 4104(利润分配-未分配利润) 的期末余额
    const balances = this.getSubjectBalance({ period });
    const profit4103 = balances.find(b => b.code === '4103');
    const totalNetProfit = profit4103 ? Math.abs(profit4103.balance) : existingNetProfit;
    if (totalNetProfit < 0.01) {
      this._log('year_end_transfer', '本年利润余额为0，跳过年末利润结转');
      return;
    }

    // 幂等检查：是否已有年末利润结转凭证
    const existing = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM gl_voucher WHERE book_id = ? AND period = ? AND remark LIKE '[年末利润结转]%' AND status = 'posted'"
    ).get(this.currentBookId, period);
    if (existing && existing.cnt > 0) {
      this._log('year_end_transfer', '已存在年末利润结转凭证，跳过');
      return;
    }

    const defaultVw = this.db.prepare(
      'SELECT word FROM voucher_words WHERE book_id = ? AND is_default = 1 LIMIT 1'
    ).get(this.currentBookId);
    const voucherWord = defaultVw?.word || '记';
    const voucherNo = this.getNextVoucherNo(voucherWord, period);
    const yearNum = parseInt(period.substring(0, 4));
    const dateStr = `${yearNum}-12-31`;

    const tx = this.db.transaction(() => {
      const result = self.db.prepare(
        "INSERT INTO gl_voucher (book_id, period, voucher_word, voucher_no, voucher_date, remark, status, maker, bookkeeper) VALUES (?, ?, ?, ?, ?, ?, 'posted', 'system', '')"
      ).run(self.currentBookId, period, voucherWord, voucherNo, dateStr, `[年末利润结转] ${period} 本年利润结转至未分配利润`);

      const insEntry = self.db.prepare(
        'INSERT INTO gl_voucher_entry (voucher_id, summary, subject_code, subject_name, debit, credit, quantity, unit_price, unit, aux_type_id, aux_value_id, line_no) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      // 借：本年利润 4103
      insEntry.run(result.lastInsertRowid, '结转本年利润', '4103', '本年利润', totalNetProfit, 0, 0, 0, '', null, null, 1);
      // 贷：利润分配-未分配利润 4104
      insEntry.run(result.lastInsertRowid, '结转未分配利润', '4104', '利润分配-未分配利润', 0, totalNetProfit, 0, 0, '', null, null, 2);
    });
    tx();
    this._log('year_end_transfer', `年末利润结转完成，结转金额 ${totalNetProfit.toFixed(2)}（${voucherWord}字-${voucherNo}号）`);
  };

  /**
   * 反结转：删除指定期间的损益结转凭证
   */
  proto._reverseCarryForward = function (period) {
    this._ensureBookId();
    const self = this;
    // 同时清理损益结转凭证和年末利润结转凭证
    const carryVouchers = this.db.prepare(
      "SELECT id, remark FROM gl_voucher WHERE book_id = ? AND period = ? AND (remark LIKE '[损益结转]%' OR remark LIKE '[年末利润结转]%') AND status = 'posted'"
    ).all(this.currentBookId, period);

    if (carryVouchers.length === 0) {
      this._log('reverse_carry_forward', `期间 ${period} 无结转凭证，跳过`);
      return;
    }

    const path = require('node:path');
    const fs = require('node:fs');

    const tx = this.db.transaction(() => {
      for (const cv of carryVouchers) {
        const dir = path.join(self.app.getPath('userData'), 'attachments', String(cv.id));
        try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* */ }
        self.db.prepare('DELETE FROM gl_voucher_attachment WHERE voucher_id = ?').run(cv.id);
        self.db.prepare('DELETE FROM gl_voucher_entry WHERE voucher_id = ?').run(cv.id);
        self.db.prepare('DELETE FROM gl_voucher WHERE id = ?').run(cv.id);
      }
    });
    tx();
    this._log('reverse_carry_forward', `期间 ${period} 反结转完成，删除 ${carryVouchers.length} 张结转凭证`);
  };
}

module.exports = { applyPeriodMethods };
