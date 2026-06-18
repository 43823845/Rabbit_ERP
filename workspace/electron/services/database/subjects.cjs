/**
 * database/subjects.cjs — 会计科目管理
 *
 * 负责 bd_subject 的 CRUD、科目重编号、预置科目
 */
const { getBuiltinSubjects } = require('./utils.cjs');

/**
 * 将科目管理方法挂载到 FinanceDatabase 原型
 */
function applySubjectMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 列出当前账套所有启用科目
   */
  proto.listSubjects = function () {
    if (!this.db) return this.memory.subjects;
    this._ensureBookId();
    const rows = this.db.prepare(
      'SELECT * FROM bd_subject WHERE book_id = ? ORDER BY CAST(code AS INTEGER), level'
    ).all(this.currentBookId);
    return rows.map(row => ({
      ...row,
      auxType: row.aux_type,
      isCash: row.is_cash,
    }));
  };

  /**
   * 创建科目
   */
  proto.createSubject = function ({ code, name, direction, category, parentCode, level, auxType, isCash }) {
    if (!code || !name) throw new Error('科目编码和名称不能为空');
    if (!direction) throw new Error('科目方向不能为空');
    if (!category) throw new Error('科目类别不能为空');

    if (!this.db) {
      const s = { id: Date.now(), book_id: 1, code, name, direction, category,
        parent_code: parentCode || '', level: level || 1, enabled: 1, auxType: auxType || '', isCash: isCash ?? 0 };
      this.memory.subjects.push(s);
      return s;
    }
    this._ensureBookId();
    this.db.prepare(
      'INSERT INTO bd_subject (book_id, code, name, direction, category, parent_code, level, aux_type, is_cash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(this.currentBookId, code, name, direction, category, parentCode || '', level || 1, auxType || '', isCash ?? 0);
    return this.db.prepare('SELECT * FROM bd_subject WHERE book_id = ? AND code = ?').get(this.currentBookId, code);
  };

  /**
   * 更新科目
   */
  proto.updateSubject = function ({ code, name, direction, category, enabled, parentCode, level, auxType, isCash }) {
    if (!code) throw new Error('科目编码不能为空');
    if (!this.db) {
      const idx = this.memory.subjects.findIndex(s => s.code === code);
      if (idx >= 0) {
        Object.assign(this.memory.subjects[idx], {
          name, direction, category,
          enabled: enabled !== undefined ? (enabled ? 1 : 0) : this.memory.subjects[idx].enabled,
          parent_code: parentCode ?? this.memory.subjects[idx].parent_code,
          level: level ?? this.memory.subjects[idx].level,
          auxType: auxType ?? this.memory.subjects[idx].auxType,
          isCash: isCash ?? this.memory.subjects[idx].isCash,
        });
      }
      return this.memory.subjects[idx] || null;
    }
    this._ensureBookId();
    const parts = ['name = ?', 'direction = ?', 'category = ?'];
    const params = [name, direction, category];
    if (enabled !== undefined) { parts.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    if (parentCode !== undefined) { parts.push('parent_code = ?'); params.push(parentCode); }
    if (level !== undefined) { parts.push('level = ?'); params.push(level); }
    if (auxType !== undefined) { parts.push('aux_type = ?'); params.push(auxType); }
    if (isCash !== undefined) { parts.push('is_cash = ?'); params.push(isCash ? 1 : 0); }
    params.push(code, this.currentBookId);
    this.db.prepare(`UPDATE bd_subject SET ${parts.join(', ')} WHERE code = ? AND book_id = ?`).run(...params);
    return this.db.prepare('SELECT * FROM bd_subject WHERE book_id = ? AND code = ?').get(this.currentBookId, code);
  };

  /**
   * 删除科目（含引用检查）
   */
  proto.deleteSubject = function (code) {
    if (!this.db) {
      this.memory.subjects = this.memory.subjects.filter(s => s.code !== code);
      return;
    }
    this._ensureBookId();
    const subj = this.db.prepare('SELECT * FROM bd_subject WHERE book_id = ? AND code = ?').get(this.currentBookId, code);
    if (!subj) throw new Error('科目不存在');
    if (subj.builtin === 1) throw new Error('系统内置科目不可删除，可将其禁用');

    const children = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM bd_subject WHERE book_id = ? AND parent_code = ?'
    ).get(this.currentBookId, code);
    if (children && children.cnt > 0) {
      throw new Error(`该科目下有 ${children.cnt} 个子科目，请先删除子科目`);
    }

    const refEntry = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM gl_voucher_entry e
       JOIN gl_voucher v ON v.id = e.voucher_id
       WHERE v.book_id = ? AND e.subject_code = ?`
    ).get(this.currentBookId, code);
    if (refEntry && refEntry.cnt > 0) {
      throw new Error(`该科目被 ${refEntry.cnt} 条凭证分录引用，无法删除；可将其禁用`);
    }

    const refOpening = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM gl_opening_balance WHERE book_id = ? AND subject_code = ?'
    ).get(this.currentBookId, code);
    if (refOpening && refOpening.cnt > 0) {
      throw new Error('该科目已设置期初余额，无法删除；可先将期初余额清零再删除');
    }

    this.db.prepare('DELETE FROM bd_subject WHERE book_id = ? AND code = ?').run(this.currentBookId, code);
  };

  /**
   * 科目按类别与层级重新编号
   */
  proto.renumberSubjects = function () {
    if (!this.db) return null;
    this._ensureBookId();
    const self = this;

    const tx = this.db.transaction(() => {
      const all = self.db.prepare(
        'SELECT * FROM bd_subject WHERE book_id = ? ORDER BY category, level, code'
      ).all(self.currentBookId);
      const mapping = {};

      // 一级科目：内置不变，自定义从1递增
      let seq = 1;
      for (const s of all.filter(s => s.level === 1)) {
        if (s.builtin === 1) {
          mapping[s.code] = s.code;
        } else {
          while (all.some(x => x.code === String(seq))) seq++;
          const newCode = String(seq);
          if (newCode !== s.code) {
            mapping[s.code] = newCode;
            self.db.prepare('UPDATE bd_subject SET code = ? WHERE id = ?').run(newCode, s.id);
            self.db.prepare(
              'UPDATE gl_voucher_entry SET subject_code = ?, subject_name = ? WHERE subject_code = ? AND voucher_id IN (SELECT id FROM gl_voucher WHERE book_id = ?)'
            ).run(newCode, s.name, s.code, self.currentBookId);
            self.db.prepare(
              'UPDATE gl_opening_balance SET subject_code = ?, subject_name = ? WHERE subject_code = ? AND book_id = ?'
            ).run(newCode, s.name, s.code, self.currentBookId);
          }
          seq++;
        }
      }

      // 二级科目：父编码 + 2位序号
      const level2 = all.filter(s => s.level === 2);
      const parentGroups = {};
      for (const s of level2) {
        const pOld = s.parent_code || '';
        if (!parentGroups[pOld]) parentGroups[pOld] = [];
        parentGroups[pOld].push(s);
      }
      for (const [pOld, children] of Object.entries(parentGroups)) {
        const pNew = mapping[pOld] || pOld;
        children.forEach((s, j) => {
          const childSeq = String(j + 1).padStart(2, '0');
          const newCode = `${pNew}${childSeq}`;
          if (newCode !== s.code) {
            mapping[s.code] = newCode;
            self.db.prepare('UPDATE bd_subject SET code = ?, parent_code = ? WHERE id = ?').run(newCode, pNew, s.id);
            self.db.prepare(
              'UPDATE gl_voucher_entry SET subject_code = ?, subject_name = ? WHERE subject_code = ? AND voucher_id IN (SELECT id FROM gl_voucher WHERE book_id = ?)'
            ).run(newCode, s.name, s.code, self.currentBookId);
            self.db.prepare(
              'UPDATE gl_opening_balance SET subject_code = ?, subject_name = ? WHERE subject_code = ? AND book_id = ?'
            ).run(newCode, s.name, s.code, self.currentBookId);
          }
        });
      }

      self._log('renumber_subjects', '科目编号按类别层级重排');
      return { mapping };
    });

    return tx();
  };

  /**
   * 为当前账套预置内置科目
   */
  proto.seedDefaultSubjects = function () {
    this._ensureBookId();
    const count = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM bd_subject WHERE book_id = ? AND builtin = 1'
    ).get(this.currentBookId);
    if (count.cnt > 0) return;

    const builtins = getBuiltinSubjects();
    const stmt = this.db.prepare(
      'INSERT INTO bd_subject (book_id, code, name, direction, category, parent_code, level, enabled, builtin, aux_type, is_cash) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)'
    );
    const tx = this.db.transaction(() => {
      for (const s of builtins) {
        stmt.run(this.currentBookId, s.code, s.name, s.direction, s.category, s.parent_code || '', s.level || 1, s.aux_type || '', s.is_cash || 0);
      }
    });
    tx();
    this._log('seed_subjects', `预置 ${builtins.length} 个标准科目到 book_id=${this.currentBookId}`);
  };
}

module.exports = { applySubjectMethods };
