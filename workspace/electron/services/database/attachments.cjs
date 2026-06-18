/**
 * database/attachments.cjs — 凭证附件管理
 *
 * 负责 gl_voucher_attachment 的文件上传、查询、下载、删除
 */
const path = require('node:path');
const fs = require('node:fs');

/**
 * 将附件管理方法挂载到 FinanceDatabase 原型
 */
function applyAttachmentMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 获取附件存储目录
   */
  proto._attachmentsDir = function (voucherId) {
    const base = path.join(this.app.getPath('userData'), 'attachments', String(voucherId));
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    return base;
  };

  /**
   * 列出凭证附件
   */
  proto.listAttachments = function (voucherId) {
    if (!this.db) return [];
    return this.db.prepare(
      'SELECT id, voucher_id, file_name, file_size, file_path, mime_type, created_at FROM gl_voucher_attachment WHERE voucher_id = ? ORDER BY created_at'
    ).all(voucherId);
  };

  /**
   * 上传附件（Base64 → 文件）
   */
  proto.uploadAttachment = function (voucherId, fileData) {
    if (!this.db) throw new Error('数据库未初始化');
    const dir = this._attachmentsDir(voucherId);
    const ext = path.extname(fileData.name);
    const baseName = path.basename(fileData.name, ext);
    const ts = Date.now();
    const safeName = `${baseName}_${ts}${ext}`;
    const fullPath = path.join(dir, safeName);

    const matches = fileData.dataUrl.match(/^data:(.+);base64,(.+)$/);
    const mimeType = matches ? matches[1] : 'application/octet-stream';
    const buffer = Buffer.from(matches ? matches[2] : fileData.dataUrl, 'base64');
    fs.writeFileSync(fullPath, buffer);

    const result = this.db.prepare(
      'INSERT INTO gl_voucher_attachment (voucher_id, file_name, file_size, file_path, mime_type) VALUES (?, ?, ?, ?, ?)'
    ).run(voucherId, fileData.name, fileData.size, fullPath, mimeType);

    return this.db.prepare('SELECT * FROM gl_voucher_attachment WHERE id = ?').get(result.lastInsertRowid);
  };

  /**
   * 删除附件（数据库 + 磁盘）
   */
  proto.deleteAttachment = function (attachmentId) {
    if (!this.db) return;
    const row = this.db.prepare('SELECT * FROM gl_voucher_attachment WHERE id = ?').get(attachmentId);
    if (!row) return;
    try { if (row.file_path && fs.existsSync(row.file_path)) fs.unlinkSync(row.file_path); } catch (_) { /* */ }
    this.db.prepare('DELETE FROM gl_voucher_attachment WHERE id = ?').run(attachmentId);
  };

  /**
   * 获取附件文件路径
   */
  proto.getAttachmentPath = function (attachmentId) {
    if (!this.db) return null;
    return this.db.prepare('SELECT file_path, mime_type FROM gl_voucher_attachment WHERE id = ?').get(attachmentId) || null;
  };

  /**
   * 读取附件为 Base64（用于前端预览）
   */
  proto.readAttachmentFile = function (attachmentId) {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT file_path, mime_type FROM gl_voucher_attachment WHERE id = ?').get(attachmentId);
    if (!row || !row.file_path) return null;
    try {
      const buffer = fs.readFileSync(row.file_path);
      return { mime_type: row.mime_type, data_url: `data:${row.mime_type};base64,${buffer.toString('base64')}` };
    } catch (_) {
      return null;
    }
  };

  /**
   * 获取凭证附件（内部使用）
   */
  proto._getAttachments = function (voucherId) {
    if (!this.db) return [];
    return this.listAttachments(voucherId);
  };
}

module.exports = { applyAttachmentMethods };
