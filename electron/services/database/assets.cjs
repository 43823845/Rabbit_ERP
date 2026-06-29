/**
 * database/assets.cjs — 固定资产卡片管理
 *
 * 负责 fa_asset_card 的 CRUD 和折旧计算
 */

function applyAssetMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 计提折旧（直线法）：月折旧额 = 原值 × (1 - 残值率) ÷ 使用月数
   */
  proto._calcMonthlyDepreciation = function (originalValue, residualRate, usefulLifeYears) {
    const months = usefulLifeYears * 12;
    if (months <= 0) return 0;
    return Math.round((originalValue * (1 - residualRate) / months) * 100) / 100;
  };

  /** 固定资产卡片列表 */
  proto.listAssetCards = function (filter) {
    this._ensureBookId();
    let sql = 'SELECT * FROM fa_asset_card WHERE book_id = ?';
    const params = [this.currentBookId];
    if (filter?.status) { sql += ' AND status = ?'; params.push(filter.status); }
    if (filter?.category) { sql += ' AND category = ?'; params.push(filter.category); }
    sql += ' ORDER BY asset_code';
    return this.db.prepare(sql).all(...params);
  };

  /** 获取单个卡片 */
  proto.getAssetCard = function (id) {
    this._ensureBookId();
    return this.db.prepare('SELECT * FROM fa_asset_card WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
  };

  /** 新增固定资产卡片 */
  proto.createAssetCard = function (payload) {
    this._ensureBookId();
    const monthlyDep = this._calcMonthlyDepreciation(
      payload.originalValue || 0,
      payload.residualRate ?? 0.05,
      payload.usefulLifeYears || 5
    );
    const result = this.db.prepare(
      `INSERT INTO fa_asset_card (book_id, asset_code, asset_name, category, buy_date, original_value,
        residual_rate, useful_life_years, monthly_depreciation, accumulated_depreciation, net_value,
        status, department, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
    ).run(
      this.currentBookId,
      payload.assetCode || '',
      payload.assetName || '',
      payload.category || '办公设备',
      payload.buyDate || '',
      payload.originalValue || 0,
      payload.residualRate ?? 0.05,
      payload.usefulLifeYears || 5,
      monthlyDep,
      payload.originalValue || 0, // net_value 初始 = 原值
      payload.status || '在用',
      payload.department || '',
      payload.remark || ''
    );
    this._log('create_asset', `新增固定资产「${payload.assetName}」原值 ${(payload.originalValue || 0).toFixed(2)}`);
    return { id: result.lastInsertRowid, monthlyDepreciation: monthlyDep };
  };

  /** 更新固定资产卡片 */
  proto.updateAssetCard = function (id, payload) {
    this._ensureBookId();
    const existing = this.db.prepare('SELECT * FROM fa_asset_card WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!existing) throw new Error('固定资产卡片不存在');

    const origVal = payload.originalValue ?? existing.original_value;
    const resRate = payload.residualRate ?? existing.residual_rate;
    const lifeYrs = payload.usefulLifeYears ?? existing.useful_life_years;
    const monthlyDep = this._calcMonthlyDepreciation(origVal, resRate, lifeYrs);

    // 累计折旧只由 depreciateAsset 修改，不从前端 payload 接收
    const accDep = existing.accumulated_depreciation;
    const netVal = Math.round((origVal - accDep) * 100) / 100;

    this.db.prepare(
      `UPDATE fa_asset_card SET
        asset_code = ?, asset_name = ?, category = ?, buy_date = ?,
        original_value = ?, residual_rate = ?, useful_life_years = ?,
        monthly_depreciation = ?, accumulated_depreciation = ?, net_value = ?,
        status = ?, department = ?, remark = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND book_id = ?`
    ).run(
      payload.assetCode ?? existing.asset_code,
      payload.assetName ?? existing.asset_name,
      payload.category ?? existing.category,
      payload.buyDate ?? existing.buy_date,
      origVal, resRate, lifeYrs,
      monthlyDep, accDep, netVal,
      payload.status ?? existing.status,
      payload.department ?? existing.department,
      payload.remark ?? existing.remark,
      id, this.currentBookId
    );
    this._log('update_asset', `更新固定资产「${payload.assetName || existing.asset_name}」`);
    return { monthlyDepreciation: monthlyDep };
  };

  /** 删除固定资产卡片 */
  proto.deleteAssetCard = function (id) {
    this._ensureBookId();
    const existing = this.db.prepare('SELECT asset_name FROM fa_asset_card WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!existing) throw new Error('固定资产卡片不存在');
    this.db.prepare('DELETE FROM fa_asset_card WHERE id = ? AND book_id = ?').run(id, this.currentBookId);
    this._log('delete_asset', `删除固定资产「${existing.asset_name}」`);
  };

  /** 计提单张卡片的折旧（增加累计折旧，减少净值，并自动生成折旧凭证） */
  proto.depreciateAsset = function (id, periods = 1) {
    this._ensureBookId();
    const card = this.db.prepare('SELECT * FROM fa_asset_card WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!card) throw new Error('固定资产卡片不存在');
    if (card.status === '报废' || card.status === '已处置') throw new Error('已报废/已处置的资产不能计提折旧');
    if (card.status === '已提足折旧') throw new Error('该资产已提足折旧，无需再计提');

    // 计算剩余可提折旧额度，不超过残值
    const residual = card.original_value * (card.residual_rate || 0);
    const maxDepreciable = card.original_value - residual;
    const remainingDepreciable = Math.max(0, maxDepreciable - card.accumulated_depreciation);
    const maxPeriods = card.monthly_depreciation > 0 ? Math.floor(remainingDepreciable / card.monthly_depreciation) : 0;
    let effectivePeriods = Math.min(periods, maxPeriods);

    // 处理最后一期折旧：剩余额度不足一个完整月但仍有余额时，计提剩余额度
    let addDep;
    if (effectivePeriods === 0 && remainingDepreciable > 0 && remainingDepreciable < card.monthly_depreciation) {
      addDep = Math.round(remainingDepreciable * 100) / 100;
    } else if (effectivePeriods <= 0) {
      throw new Error('该资产可计提折旧额度已用完');
    } else {
      addDep = Math.round((card.monthly_depreciation * effectivePeriods) * 100) / 100;
    }

    const newAccDep = Math.round((card.accumulated_depreciation + addDep) * 100) / 100;
    const newNetValue = Math.round((card.original_value - newAccDep) * 100) / 100;

    // 净值不能为负
    const finalStatus = newNetValue <= residual ? '已提足折旧' : card.status;
    const finalNetValue = Math.max(residual, newNetValue);
    const finalAccDep = Math.min(card.original_value - residual, newAccDep);

    const self = this;
    let generatedVoucherNo = 0;
    this.db.transaction(() => {
      self.db.prepare(
        `UPDATE fa_asset_card SET accumulated_depreciation = ?, net_value = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND book_id = ?`
      ).run(finalAccDep, finalNetValue, finalStatus, id, self.currentBookId);

      // 自动生成折旧会计凭证（借：管理费用 6602 / 贷：累计折旧 1602）
      const period = self._getCurrentPeriod();
      const nextNo = self.getNextVoucherNo({ voucherWord: '记', period });
      generatedVoucherNo = nextNo;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const voucherResult = self.db.prepare(
        `INSERT INTO gl_voucher (book_id, period, voucher_word, voucher_no, voucher_date, remark, status, maker, created_at)
         VALUES (?, ?, '记', ?, ?, '计提折旧：' || ?, 'posted', 'system', ?)`
      ).run(self.currentBookId, period, nextNo, period + '-01', card.asset_name, now);
      const voucherId = voucherResult.lastInsertRowid;

      self.db.prepare(
        `INSERT INTO gl_voucher_entry (voucher_id, summary, subject_code, subject_name, debit, credit, line_no)
         VALUES (?, '计提折旧', '6602', '管理费用', ?, 0, 1)`
      ).run(voucherId, addDep);
      self.db.prepare(
        `INSERT INTO gl_voucher_entry (voucher_id, summary, subject_code, subject_name, debit, credit, line_no)
         VALUES (?, '累计折旧', '1602', '累计折旧', 0, ?, 2)`
      ).run(voucherId, addDep);
    })();

    this._log('depreciate_asset', `计提「${card.asset_name}」折旧 ${addDep.toFixed(2)}（自动生成记字-${generatedVoucherNo}号凭证），累计 ${finalAccDep.toFixed(2)}`);
    return { addedDepreciation: addDep, accumulatedDepreciation: finalAccDep, netValue: finalNetValue, status: finalStatus };
  };

  /** 获取当前账套期间 */
  proto._getCurrentPeriod = function () {
    const book = this.db.prepare('SELECT current_period FROM acct_book WHERE id = ?').get(this.currentBookId);
    return book?.current_period || '2026-06';
  };

  /** 汇总统计 */
  proto.getAssetStats = function () {
    this._ensureBookId();
    const rows = this.db.prepare('SELECT COALESCE(SUM(original_value),0) AS totalOriginal, COALESCE(SUM(accumulated_depreciation),0) AS totalDep, COALESCE(SUM(net_value),0) AS totalNet, COUNT(*) AS cnt FROM fa_asset_card WHERE book_id = ?').get(this.currentBookId);
    return rows || { totalOriginal: 0, totalDep: 0, totalNet: 0, cnt: 0 };
  };

  /** 固定资产折旧汇总表 */
  proto.getDepreciationSummary = function (period) {
    this._ensureBookId();

    const book = this.db.prepare('SELECT name AS company_name FROM acct_book WHERE id = ?').get(this.currentBookId);
    const cp = period || '2026-06';

    // 获取所有非报废/已处置的固定资产
    const cards = this.db.prepare(
      "SELECT * FROM fa_asset_card WHERE book_id = ? AND status NOT IN ('报废','已处置') ORDER BY category, asset_code"
    ).all(this.currentBookId);

    let totalOriginal = 0, totalMonthlyDep = 0, totalAccDep = 0, totalNetVal = 0, totalCurrentDep = 0;

    const rows = cards.map(card => {
      totalOriginal += card.original_value || 0;
      totalMonthlyDep += card.monthly_depreciation || 0;
      totalAccDep += card.accumulated_depreciation || 0;
      totalNetVal += card.net_value || 0;

      // 当期折旧：精确匹配 depreciateAsset 生成的凭证（remark = '计提折旧：<资产名称>'）
      let currentDep = 0;
      const depEntry = this.db.prepare(`
        SELECT SUM(e.credit) as dep_amount
        FROM gl_voucher_entry e
        JOIN gl_voucher v ON v.id = e.voucher_id
        WHERE v.book_id = ? AND v.status = 'posted' AND v.period = ?
          AND e.subject_code = '1602'
          AND v.remark = '计提折旧：' || ?
      `).get(this.currentBookId, cp, card.asset_name);
      currentDep = depEntry?.dep_amount || 0;
      totalCurrentDep += currentDep;

      return {
        asset_code: card.asset_code || '',
        asset_name: card.asset_name || '',
        category: card.category || '',
        original_value: Math.round((card.original_value || 0) * 100) / 100,
        monthly_depreciation: Math.round((card.monthly_depreciation || 0) * 100) / 100,
        accumulated_depreciation: Math.round((card.accumulated_depreciation || 0) * 100) / 100,
        net_value: Math.round((card.net_value || 0) * 100) / 100,
        current_period_depreciation: Math.round(currentDep * 100) / 100,
      };
    });

    return {
      company_name: book?.company_name || '',
      period: cp,
      rows,
      totals: {
        original_value: Math.round(totalOriginal * 100) / 100,
        monthly_depreciation: Math.round(totalMonthlyDep * 100) / 100,
        accumulated_depreciation: Math.round(totalAccDep * 100) / 100,
        net_value: Math.round(totalNetVal * 100) / 100,
        current_period_depreciation: Math.round(totalCurrentDep * 100) / 100,
      },
    };
  };
}

module.exports = { applyAssetMethods };
