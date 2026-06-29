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

  /** 计提单张卡片的折旧（增加累计折旧，减少净值） */
  proto.depreciateAsset = function (id, periods = 1) {
    this._ensureBookId();
    const card = this.db.prepare('SELECT * FROM fa_asset_card WHERE id = ? AND book_id = ?').get(id, this.currentBookId);
    if (!card) throw new Error('固定资产卡片不存在');
    if (card.status === '报废' || card.status === '已处置') throw new Error('已报废/已处置的资产不能计提折旧');

    const addDep = Math.round((card.monthly_depreciation * periods) * 100) / 100;
    const newAccDep = Math.round((card.accumulated_depreciation + addDep) * 100) / 100;
    const newNetValue = Math.round((card.original_value - newAccDep) * 100) / 100;

    // 净值不能为负
    const finalStatus = newNetValue <= 0 ? '已提足折旧' : card.status;
    const finalNetValue = Math.max(0, newNetValue);
    const finalAccDep = Math.min(card.original_value, newAccDep);

    this.db.prepare(
      `UPDATE fa_asset_card SET accumulated_depreciation = ?, net_value = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND book_id = ?`
    ).run(finalAccDep, finalNetValue, finalStatus, id, this.currentBookId);

    this._log('depreciate_asset', `计提「${card.asset_name}」${periods}期折旧 ${addDep.toFixed(2)}，累计 ${finalAccDep.toFixed(2)}`);
    return { addedDepreciation: addDep, accumulatedDepreciation: finalAccDep, netValue: finalNetValue, status: finalStatus };
  };

  /** 汇总统计 */
  proto.getAssetStats = function () {
    this._ensureBookId();
    const rows = this.db.prepare('SELECT COALESCE(SUM(original_value),0) AS totalOriginal, COALESCE(SUM(accumulated_depreciation),0) AS totalDep, COALESCE(SUM(net_value),0) AS totalNet, COUNT(*) AS cnt FROM fa_asset_card WHERE book_id = ?').get(this.currentBookId);
    return rows || { totalOriginal: 0, totalDep: 0, totalNet: 0, cnt: 0 };
  };
}

module.exports = { applyAssetMethods };
