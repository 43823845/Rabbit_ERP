/**
 * database/users.cjs — 用户认证与管理
 *
 * 负责 sys_user 的认证、CRUD、密码修改
 */
const { hashPassword } = require('./utils.cjs');
const config = require('../../../app.config.cjs');

/**
 * 将用户管理方法挂载到 FinanceDatabase 原型
 */
function applyUserMethods(FinanceDatabase) {
  const proto = FinanceDatabase.prototype;

  /**
   * 预置默认管理员（首次运行）
   */
  proto.seedDefaultUsers = function () {
    const count = this.db.prepare('SELECT COUNT(*) as cnt FROM sys_user').get();
    if (count.cnt > 0) return;
    const hash = hashPassword('admin', config.passwordSalt);
    this.db.prepare(
      'INSERT INTO sys_user (username, password_hash, alias, role, enabled) VALUES (?, ?, ?, ?, 1)'
    ).run('admin', hash, '系统管理员', 'admin');
    this._log('seed_users', '创建默认管理员账号 admin');
  };

  /**
   * 用户登录
   */
  proto.loginUser = function ({ username, password }) {
    const user = this.db.prepare(
      'SELECT * FROM sys_user WHERE username = ? AND enabled = 1'
    ).get(username);
    if (!user) return null;
    const hash = hashPassword(password, config.passwordSalt);
    if (hash !== user.password_hash) return null;
    return { id: user.id, username: user.username, alias: user.alias, role: user.role };
  };

  /**
   * 列出所有用户
   */
  proto.listUsers = function () {
    return this.db.prepare(
      'SELECT id, username, alias, role, enabled, created_at AS createdAt FROM sys_user ORDER BY created_at'
    ).all();
  };

  /**
   * 创建用户
   */
  proto.createUser = function ({ username, password, alias, role }) {
    if (!username || !password) throw new Error('用户名和密码不能为空');
    const hash = hashPassword(password, config.passwordSalt);
    this.db.prepare(
      'INSERT INTO sys_user (username, password_hash, alias, role) VALUES (?, ?, ?, ?)'
    ).run(username, hash, alias || username, role || 'accountant');
    this._log('create_user', `创建用户 ${username}`);
    return this.db.prepare(
      'SELECT id, username, alias, role, enabled, created_at AS createdAt FROM sys_user WHERE username = ?'
    ).get(username);
  };

  /**
   * 更新用户信息
   */
  proto.updateUser = function ({ id, alias, role, enabled }) {
    const parts = [];
    const params = [];
    if (alias !== undefined) { parts.push('alias = ?'); params.push(alias); }
    if (role !== undefined) { parts.push('role = ?'); params.push(role); }
    if (enabled !== undefined) { parts.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    if (parts.length === 0) throw new Error('无可更新字段');
    parts.push("updated_at = datetime('now','localtime')");
    params.push(id);
    this.db.prepare(`UPDATE sys_user SET ${parts.join(', ')} WHERE id = ?`).run(...params);
    this._log('update_user', `更新用户 id=${id}`);
    return this.db.prepare(
      'SELECT id, username, alias, role, enabled, created_at AS createdAt FROM sys_user WHERE id = ?'
    ).get(id);
  };

  /**
   * 修改密码
   */
  proto.changePassword = function ({ id, oldPassword, newPassword }) {
    const user = this.db.prepare('SELECT * FROM sys_user WHERE id = ?').get(id);
    if (!user) throw new Error('用户不存在');
    const oldHash = hashPassword(oldPassword, config.passwordSalt);
    if (oldHash !== user.password_hash) throw new Error('原密码错误');
    const newHash = hashPassword(newPassword, config.passwordSalt);
    this.db.prepare('UPDATE sys_user SET password_hash = ? WHERE id = ?').run(newHash, id);
    this._log('change_password', `用户 ${user.username} 修改密码`);
    return true;
  };

  /**
   * 获取用户简要信息
   */
  proto.getUserProfile = function (userId) {
    const user = this.db.prepare('SELECT id, username, alias, role FROM sys_user WHERE id = ?').get(userId);
    if (!user) return null;
    return { userId: user.id, username: user.username, alias: user.alias, role: user.role };
  };
}

module.exports = { applyUserMethods };
