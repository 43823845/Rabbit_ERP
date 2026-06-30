/**
 * Electron API —— 通过 IPC 与主进程的 SQLite 数据库通信
 */
import type {
  FinanceApi, BootstrapData, Company, AuthUser, SysUser, UserPayload, UserRole,
  FinanceSubject, FinanceVoucher, VoucherAttachment,
  SubjectPayload, VoucherPayload, VoucherFilter, OpeningBalance,
  SubjectBalance, DetailLedgerResult, GeneralLedgerRow,
  TrialBalance, ProfitStatement, BalanceSheet, CashFlowStatement, YearEndIntegrityCheck,
  EquityChangeStatement, TaxPayableDetail, ExpenseSummary, AgingAnalysis, DepreciationSummary,
  AuxProjectType, AuxProjectValue, AuxProjectPayload,
  QuantityDetailLedgerRow, QuantityGeneralLedgerRow,
  AuxProjectBalanceRow, AuxProjectDetailRow,
  MultiColumnScheme, MultiColumnSchemePayload, MultiColumnLedgerResult,
  VoucherWordType, VoucherWordPayload,
} from '../vite-env';

function ipc(channel: string, ...args: any[]): Promise<any> {
  return window.electronAPI!.invoke(`finance:${channel}`, ...args).then((result: any) => {
    if (result && typeof result === 'object' && '__error' in result) {
      throw new Error(result.__error);
    }
    return result;
  });
}

export class ElectronFinanceApi implements FinanceApi {
  /** 缓存的账套列表，供 getCurrentCompany 使用 */
  private _companiesCache: Company[] = [];

  async bootstrap(): Promise<BootstrapData> { return ipc('bootstrap'); }
  async login(username: string, password: string): Promise<AuthUser | null> {
    const result = await ipc('login', { username, password });
    if (!result) return null;
    // 登录后立即缓存账套列表
    this._companiesCache = await ipc('getCompanies') as Company[];
    return result;
  }
  async listUsers(): Promise<SysUser[]> { return ipc('listUsers'); }
  async createUser(payload: UserPayload): Promise<SysUser> { return ipc('createUser', payload); }
  async updateUser(id: number, data: { alias?: string; role?: UserRole; enabled?: number }): Promise<SysUser> { return ipc('updateUser', { id, ...data }); }
  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> { return ipc('changePassword', { id: this.getCachedUserId(), oldPassword, newPassword }); }
  async resetUserPassword(userId: number, newPassword: string): Promise<boolean> { return ipc('resetPassword', { id: userId, newPassword }); }
  async getUserProfile() {
    const id = this.getCachedUserId();
    if (!id) return null;
    return ipc('getUserProfile', id);
  }
  private getCachedUserId(): number | null {
    try {
      const raw = localStorage.getItem('finance_auth_state');
      if (raw) {
        const state = JSON.parse(raw);
        return state.user?.userId || null;
      }
    } catch { /* ignore */ }
    return null;
  }
  /** 从 auth 缓存中读取当前用户所属的 companyId */
  private getCachedCompanyId(): string | null {
    try {
      const raw = localStorage.getItem('finance_auth_state');
      if (raw) {
        const state = JSON.parse(raw);
        return String(state.user?.companyId || '');
      }
    } catch { /* ignore */ }
    return null;
  }
  /** 根据 auth 中缓存的 companyId 匹配当前账套（同步方法） */
  getCurrentCompany(): Company | null {
    const companyId = this.getCachedCompanyId();
    if (!companyId || this._companiesCache.length === 0) return null;
    return this._companiesCache.find(c => String(c.id) === companyId) || null;
  }
  async getCompanies(): Promise<Company[]> {
    const list = await ipc('getCompanies') as Company[];
    this._companiesCache = list;
    return list;
  }
  async createCompany(name: string, data?: Partial<Company>): Promise<Company> {
    const created = await ipc('createCompany', { name, period: '2026-06', ...data }) as Company;
    this._companiesCache = await ipc('getCompanies') as Company[];
    return created;
  }
  async updateCompany(id: string, data: Partial<Company>): Promise<Company> {
    const updated = await ipc('updateCompany', { id, ...data }) as Company;
    // 更新缓存中的对应条目
    const idx = this._companiesCache.findIndex(c => String(c.id) === String(id));
    if (idx >= 0) this._companiesCache[idx] = updated;
    return updated;
  }
  async deleteCompany(companyId: string): Promise<{ deleted: boolean }> {
    const result = await ipc('deleteCompany', companyId);
    this._companiesCache = this._companiesCache.filter(c => String(c.id) !== String(companyId));
    return result;
  }
  async switchCompany(companyId: string): Promise<void> { await ipc('switchCompany', companyId); }

  async listSubjects(): Promise<FinanceSubject[]> { return ipc('listSubjects'); }
  async createSubject(p: SubjectPayload): Promise<FinanceSubject> { return ipc('createSubject', p); }
  async updateSubject(p: SubjectPayload): Promise<FinanceSubject> { return ipc('updateSubject', p); }
  async deleteSubject(code: string): Promise<void> { return ipc('deleteSubject', code); }

  async setOpeningBalance(p: OpeningBalance & { subjectCode: string; subjectName: string }): Promise<OpeningBalance> { return ipc('setOpeningBalance', p); }
  async getOpeningBalances(period: string): Promise<OpeningBalance[]> { return ipc('getOpeningBalances', period); }
  async closePeriod(period: string): Promise<void> { return ipc('closePeriod', period); }
  async reopenPeriod(period: string): Promise<void> { return ipc('reopenPeriod', period); }

  async listVouchers(f?: VoucherFilter): Promise<FinanceVoucher[]> { return ipc('listVouchers', f); }
  async getVoucher(id: number): Promise<FinanceVoucher> { return ipc('getVoucher', id); }
  async createVoucher(p: VoucherPayload): Promise<FinanceVoucher> { return ipc('createVoucher', p); }
  async updateVoucher(p: VoucherPayload): Promise<FinanceVoucher> { return ipc('updateVoucher', p); }
  async deleteVoucher(id: number): Promise<void> { return ipc('deleteVoucher', id); }
  async auditVoucher(id: number, operator?: string): Promise<FinanceVoucher> { return ipc('auditVoucher', id, operator); }
  async unauditVoucher(id: number): Promise<FinanceVoucher> { return ipc('unauditVoucher', id); }
  async postVoucher(id: number): Promise<FinanceVoucher> { return ipc('postVoucher', id); }
  async unpostVoucher(id: number): Promise<FinanceVoucher> { return ipc('unpostVoucher', id); }
  async reorderVoucherNos(p: { voucherWord: string; period: string }): Promise<void> { return ipc('reorderVoucherNos', p); }
  async reorderAllVoucherNos(period: string): Promise<Array<{ word: string; count: number }>> { return ipc('reorderAllVoucherNos', period); }
  async renumberSubjects(): Promise<any> { return ipc('renumberSubjects'); }
  async getNextVoucherNo(p: { voucherWord: string; period: string }): Promise<number> { return ipc('getNextVoucherNo', p); }

  /* 附件 */
  async listAttachments(voucherId: number): Promise<VoucherAttachment[]> { return ipc('listAttachments', voucherId); }
  async uploadAttachment(voucherId: number, file: { name: string; size: number; dataUrl: string }): Promise<VoucherAttachment> {
    // 显式构造纯对象，防止 Vue Proxy 导致 IPC 结构化克隆失败
    return ipc('uploadAttachment', {
      voucherId,
      file: { name: String(file.name), size: Number(file.size), dataUrl: String(file.dataUrl) },
    });
  }
  async deleteAttachment(attachmentId: number): Promise<void> { return ipc('deleteAttachment', attachmentId); }
  async getAttachmentPath(attachmentId: number): Promise<string> { return ipc('getAttachmentPath', attachmentId); }
  async readAttachmentFile(attachmentId: number): Promise<{ mime_type: string; data_url: string } | null> { return ipc('readAttachmentFile', attachmentId); }

  async getSubjectBalance(f?: { period?: string; subjectCode?: string; category?: string }): Promise<SubjectBalance[]> { return ipc('getSubjectBalance', f); }
  async getDetailLedger(f?: { subjectCode?: string; period?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }): Promise<DetailLedgerResult> { return ipc('getDetailLedger', f); }
  async getGeneralLedger(f?: { subjectCode?: string; period?: string }): Promise<{ rows: GeneralLedgerRow[]; total: number }> { return ipc('getGeneralLedger', f); }
  async getTrialBalance(period: string): Promise<TrialBalance> { return ipc('getTrialBalance', period); }
  async getProfitStatement(period: string): Promise<ProfitStatement> { return ipc('getProfitStatement', period); }
  async getBalanceSheet(period: string): Promise<BalanceSheet> { return ipc('getBalanceSheet', period); }
  async getCashFlowStatement(period: string): Promise<CashFlowStatement> { return ipc('getCashFlowStatement', period); }
  async getEquityChangeStatement(period: string): Promise<EquityChangeStatement> { return ipc('getEquityChangeStatement', period); }
  async getTaxPayableDetail(period: string): Promise<TaxPayableDetail> { return ipc('getTaxPayableDetail', period); }
  async getExpenseSummary(period: string): Promise<ExpenseSummary> { return ipc('getExpenseSummary', period); }
  async getReceivableAging(period: string): Promise<AgingAnalysis> { return ipc('getReceivableAging', period); }
  async getPayableAging(period: string): Promise<AgingAnalysis> { return ipc('getPayableAging', period); }
  async checkYearEndIntegrity(currentPeriod?: string): Promise<YearEndIntegrityCheck> { return ipc('checkYearEndIntegrity', currentPeriod); }

  /* 辅助核算类别 */
  async listAuxProjectTypes(): Promise<AuxProjectType[]> { return ipc('listAuxProjectTypes'); }
  async createAuxProjectType(p: AuxProjectPayload): Promise<AuxProjectType> { return ipc('createAuxProjectType', p); }
  async updateAuxProjectType(p: { id: number; code: string; name: string }): Promise<AuxProjectType> { return ipc('updateAuxProjectType', p); }
  async deleteAuxProjectType(id: number): Promise<void> { return ipc('deleteAuxProjectType', id); }

  /* 辅助核算项目值 */
  async listAuxProjectValues(typeId: number): Promise<AuxProjectValue[]> { return ipc('listAuxProjectValues', typeId); }
  async createAuxProjectValue(p: { typeId: number; code: string; name: string }): Promise<AuxProjectValue> { return ipc('createAuxProjectValue', p); }
  async updateAuxProjectValue(p: { id: number; code: string; name: string; enabled?: number }): Promise<AuxProjectValue> { return ipc('updateAuxProjectValue', p); }
  async deleteAuxProjectValue(id: number): Promise<void> { return ipc('deleteAuxProjectValue', id); }

  /* 数量金额账簿 */
  async getQuantityDetailLedger(f?: { subjectCode?: string; period?: string; startDate?: string; endDate?: string }): Promise<{ rows: QuantityDetailLedgerRow[]; total: number }> { return ipc('getQuantityDetailLedger', f); }
  async getQuantityGeneralLedger(f?: { subjectCode?: string; period?: string }): Promise<{ rows: QuantityGeneralLedgerRow[]; total: number }> { return ipc('getQuantityGeneralLedger', f); }

  /* 多栏账 */
  async listMultiColumnSchemes(): Promise<MultiColumnScheme[]> { return ipc('listMultiColumnSchemes'); }
  async createMultiColumnScheme(p: MultiColumnSchemePayload): Promise<MultiColumnScheme> { return ipc('createMultiColumnScheme', p); }
  async updateMultiColumnScheme(p: { id: number; name: string; parentCode: string; parentName: string; direction?: string; childrenJson?: string }): Promise<MultiColumnScheme> { return ipc('updateMultiColumnScheme', p); }
  async deleteMultiColumnScheme(id: number): Promise<void> { return ipc('deleteMultiColumnScheme', id); }
  async getMultiColumnLedger(f?: { parentCode?: string; period?: string; startDate?: string; endDate?: string; childrenJson?: string }): Promise<MultiColumnLedgerResult> { return ipc('getMultiColumnLedger', f); }

  /* 辅助核算报表 */
  async getAuxProjectBalance(f?: { auxTypeId?: number; auxValueId?: number; period?: string }): Promise<AuxProjectBalanceRow[]> { return ipc('getAuxProjectBalance', f); }
  async getAuxProjectDetail(f?: { auxTypeId?: number; auxValueId?: number; period?: string }): Promise<{ rows: AuxProjectDetailRow[]; total: number }> { return ipc('getAuxProjectDetail', f); }
  async getAuxProjectCombo(f?: { period?: string; auxTypeId?: number }) { return ipc('getAuxProjectCombo', f); }

  /* 凭证字管理 */
  async listVoucherWords(): Promise<VoucherWordType[]> { return ipc('listVoucherWords'); }
  async createVoucherWord(payload: VoucherWordPayload): Promise<VoucherWordType> { return ipc('createVoucherWord', payload); }
  async updateVoucherWord(id: number, payload: Partial<VoucherWordPayload>): Promise<VoucherWordType> { return ipc('updateVoucherWord', { id, payload }); }
  async deleteVoucherWord(id: number): Promise<void> { return ipc('deleteVoucherWord', id); }

  /* 数据管理 */
  async getDatabaseInfo(): Promise<any> { return ipc('getDatabaseInfo'); }
  async vacuumDatabase(): Promise<any> { return ipc('vacuumDatabase'); }
  async backupDatabase(): Promise<any> { return ipc('backupDatabase'); }
  async exportAllData(): Promise<any> { return ipc('exportAllData'); }
  async exportDataJson(): Promise<any> { return ipc('exportDataJson'); }

  /* 批量操作 */
  async batchAuditVouchers(ids: number[], operator?: string): Promise<{ success: number; failed: number }> { return ipc('batchAuditVouchers', ids, operator); }
  async batchPostVouchers(ids: number[]): Promise<{ success: number; failed: number }> { return ipc('batchPostVouchers', ids); }

  /* 操作日志 */
  async getOperationLogs(filter?: { startDate?: string; endDate?: string; limit?: number }): Promise<import('../vite-env').OpLogEntry[]> { return ipc('getOperationLogs', filter); }

  /* 科目引用检查 */
  async checkSubjectUsage(code: string): Promise<{ voucherCount: number; hasChildren: boolean }> { return ipc('checkSubjectUsage', code); }

  /* 凭证模板 */
  async listVoucherTemplates(): Promise<import('../vite-env').VoucherTemplate[]> { return ipc('listVoucherTemplates'); }
  async saveVoucherTemplate(name: string, entries: Array<{ summary: string; subjectCode: string; subjectName: string }>): Promise<import('../vite-env').VoucherTemplate> { return ipc('saveVoucherTemplate', { name, entries }); }
  async deleteVoucherTemplate(id: number): Promise<void> { return ipc('deleteVoucherTemplate', id); }

  /* 摘要库 */
  async listVoucherSummaries(): Promise<import('../vite-env').VoucherSummary[]> { return ipc('listVoucherSummaries'); }
  async createVoucherSummary(text: string, category: string): Promise<import('../vite-env').VoucherSummary> { return ipc('createVoucherSummary', { text, category }); }
  async deleteVoucherSummary(id: number): Promise<void> { return ipc('deleteVoucherSummary', id); }

  /* 固定资产 */
  async listAssetCards(filter?: any) { return ipc('listAssetCards', filter); }
  async getAssetCard(id: number) { return ipc('getAssetCard', id); }
  async createAssetCard(payload: any) { return ipc('createAssetCard', payload); }
  async updateAssetCard(id: number, payload: any) { return ipc('updateAssetCard', { ...payload, id }); }
  async deleteAssetCard(id: number) { return ipc('deleteAssetCard', id); }
  async depreciateAsset(id: number, periods = 1) { return ipc('depreciateAsset', { id, periods }); }
  async getAssetStats() { return ipc('getAssetStats'); }
  async getDepreciationSummary(period: string): Promise<DepreciationSummary> { return ipc('getDepreciationSummary', period); }
}
