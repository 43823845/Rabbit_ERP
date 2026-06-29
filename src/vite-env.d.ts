// ponytail: 全局类型定义 — ERP数据模型(科目/凭证/报表/API) + Window扩展
/// <reference types="vite/client" />

/* ---- company ---- */
export interface Company {
  id: string;
  name: string;
  contactPerson?: string;
  legalRepresentative?: string;
  phone?: string;
  address?: string;
  taxNo?: string;
  period: string;
  createdAt: string;
}

/* ---- auth ---- */
export type UserRole = 'admin' | 'accountant' | 'auditor' | 'viewer';

export interface AuthUser {
  userId: number;
  username: string;
  alias?: string;
  role: UserRole;
  companyId: string;
  companyName: string;
}

export interface SysUser {
  id: number;
  username: string;
  alias: string;
  role: UserRole;
  enabled: number;
  createdAt: string;
}

export interface UserPayload {
  username: string;
  password: string;
  alias?: string;
  role?: UserRole;
}

/* ---- subjects ---- */
export interface FinanceSubject {
  id?: number;
  book_id?: number;           // 所属账套（多账套科目隔离）
  code: string;
  name: string;
  direction: 'debit' | 'credit';
  category: 'asset' | 'liability' | 'equity' | 'cost' | 'income' | 'expense';
  parent_code?: string;
  level: number;
  enabled?: number;
  builtin?: number;
  /** 辅助核算类别字段 */
  auxType?: string;
  /** 是否现金科目 */
  isCash?: number;
}

export interface SubjectPayload {
  code: string;
  name: string;
  direction: string;
  category: string;
  parentCode?: string;
  level?: number;
  enabled?: number;
  auxType?: string;
  isCash?: number;
}

/* ---- opening balance ---- */
export interface OpeningBalance {
  id?: number;
  subject_code: string;
  subject_name: string;
  debit: number;
  credit: number;
  period: string;
}

/* ---- voucher ---- */
export interface VoucherEntry {
  id?: number;
  voucher_id?: number;
  summary: string;
  subject_code?: string;
  subject_name?: string;
  subjectCode: string;
  subjectName: string;
  debit: number;
  credit: number;
  /** 数量（数量金额核算） */
  quantity?: number;
  /** 单价 */
  unitPrice?: number;
  /** 计量单位 */
  unit?: string;
  /** 辅助核算类别ID */
  auxTypeId?: number | null;
  /** 辅助核算项目ID */
  auxValueId?: number | null;
  line_no?: number;
}

export interface VoucherPayload {
  id?: number;
  voucherWord: string;
  voucherNo: number;
  voucherDate: string;
  period?: string;
  remark: string;
  maker: string;
  bookkeeper?: string;
  entries: Array<{
    summary: string;
    subjectCode: string;
    subjectName: string;
    debit: number;
    credit: number;
    quantity?: number;
    unitPrice?: number;
    unit?: string;
    auxTypeId?: number | null;
    auxValueId?: number | null;
  }>;
}

/* ---- aux project ---- */
export interface AuxProjectType {
  id: number;
  book_id: number;
  code: string;
  name: string;
  created_at?: string;
}

export interface AuxProjectValue {
  id: number;
  type_id: number;
  book_id: number;
  code: string;
  name: string;
  enabled: number;
  created_at?: string;
}

export interface AuxProjectPayload {
  code: string;
  name: string;
}

export interface FinanceVoucher {
  id: number;
  book_id?: number;
  period: string;
  voucher_word: string;
  voucher_no: number;
  voucher_date: string;
  remark: string;
  status: 'draft' | 'audited' | 'posted';
  maker: string;
  bookkeeper?: string;
  created_at?: string;
  entries: VoucherEntry[];
  attachments?: VoucherAttachment[];
}

export interface VoucherAttachment {
  id: number;
  voucher_id: number;
  file_name: string;
  file_size: number;
  file_path: string;
  mime_type: string;
  created_at?: string;
}

export interface VoucherFilter {
  period?: string;
  status?: string;
  voucherWord?: string;
  keyword?: string;
  subjectCode?: string;
  amountMin?: number;
  amountMax?: number;
  startDate?: string;
  endDate?: string;
  voucherNoMin?: number;
  voucherNoMax?: number;
  page?: number;
  pageSize?: number;
}

/* ---- ledger ---- */
export interface SubjectBalance {
  code: string;
  name: string;
  openingDebit: number;
  openingCredit: number;
  debitAmount: number;
  creditAmount: number;
  balance: number;
}

export interface DetailLedgerRow {
  voucher_date: string;
  voucher_word: string;
  voucher_no: number;
  voucher_remark: string;
  summary: string;
  subject_code: string;
  subject_name: string;
  debit: number;
  credit: number;
  quantity?: number;
  unit_price?: number;
  unit?: string;
}

export interface GeneralLedgerRow {
  code: string;
  name: string;
  total_debit: number;
  total_credit: number;
}

export interface TrialBalance {
  rows: Array<SubjectBalance & { endingDebit: number; endingCredit: number }>;
  totals: {
    openingDebit: number;
    openingCredit: number;
    amountDebit: number;
    amountCredit: number;
    endingDebit: number;
    endingCredit: number;
  };
}

export interface ReportItem {
  code: string;
  name: string;
  amount: number;
}

export interface ProfitStatementRow {
  row_no: number;
  name: string;
  amount: number;          // 本年累计金额
  monthly_amount: number;  // 本月金额
  opening_amount: number;
  is_header: boolean;
  is_total: boolean;
  bold: boolean;
  indent_level: number;
}

export interface ProfitStatement {
  company_name: string;
  period: string;
  rows: ProfitStatementRow[];
}

export interface BalanceSheetRow {
  row_no: number;
  name: string;
  amount: number;
  opening_amount: number;
  is_header: boolean;
  is_total: boolean;
  bold: boolean;
  indent_level: number;
}

export interface BalanceSheet {
  company_name: string;
  period: string;
  asset_rows: BalanceSheetRow[];
  liability_rows: BalanceSheetRow[];
  equity_rows: BalanceSheetRow[];
}

export interface QuantityDetailLedgerRow extends DetailLedgerRow {
  quantity: number;
  unit_price: number;
  unit: string;
}

export interface QuantityGeneralLedgerRow {
  code: string;
  name: string;
  total_debit: number;
  total_credit: number;
  in_quantity: number;
  out_quantity: number;
  net_quantity: number;
  unit: string;
}

export interface AuxProjectBalanceRow {
  aux_type_id: number;
  aux_value_id: number;
  subject_code: string;
  subject_name: string;
  debit_amount: number;
  credit_amount: number;
}

export interface AuxProjectDetailRow extends DetailLedgerRow {
  aux_type_id: number;
  aux_value_id: number;
}

/* ---- 核算项目组合表 ---- */
export interface AuxProjectComboColumn {
  value_id: number;
  value_code: string;
  value_name: string;
}

export interface AuxProjectComboCell {
  debit: number;
  credit: number;
}

export interface AuxProjectComboRow {
  subject_code: string;
  subject_name: string;
  cells: AuxProjectComboCell[];
}

export interface AuxProjectCombo {
  columns: AuxProjectComboColumn[];
  rows: AuxProjectComboRow[];
  totals: AuxProjectComboCell[];
}

export interface MultiColumnScheme {
  id: number;
  book_id: number;
  name: string;
  parent_code: string;
  parent_name: string;
  direction: string;
  children_json: string;
  created_at: string;
  updated_at: string;
}

export interface MultiColumnLedgerCell {
  debit: number;
  credit: number;
  balance: number;
}

export interface MultiColumnLedgerColumn {
  code: string;
  name: string;
}

export interface MultiColumnLedgerRow {
  voucher_date: string;
  voucher_word: string;
  voucher_no: number;
  period: string;
  summary: string;
  cells: MultiColumnLedgerCell[];
}

export interface MultiColumnLedgerSummary {
  period: string;
  cells: MultiColumnLedgerCell[];
}

export interface MultiColumnLedgerResult {
  columns: MultiColumnLedgerColumn[];
  rows: MultiColumnLedgerRow[];
  periodSummary: MultiColumnLedgerSummary[];
}

/* ---- 现金流量表 ---- */
export interface CashFlowRow {
  row_no: number;
  name: string;
  amount: number;
  is_header?: boolean;
  is_total?: boolean;
  bold?: boolean;
  indent_level?: number;
  section: string;
}

export interface CashFlowStatement {
  company_name: string;
  period: string;
  rows: CashFlowRow[];
}

/* ---- 明细账（含承前页/过次页） ---- */
export interface DetailLedgerResult {
  rows: DetailLedgerRow[];
  total: number;
  /** 承前页余额（当前页第一笔之前的累计余额） */
  carryForward?: number;
  /** 过次页余额（当前页最后一笔之后的累计余额） */
  carriedForward?: number;
}

/* ---- 跨年数据完整性检查 ---- */
export interface YearEndIntegrityCheck {
  yearEnd: string;
  nextYearOpen: string;
  matched: number;
  mismatched: number;
  details: Array<{
    code: string;
    name: string;
    yearEndBalance: number;
    nextYearOpening: number;
    diff: number;
  }>;
}

/* ---- 凭证字 ---- */
export interface VoucherWordType {
  id: number;
  book_id: number;
  word: string;
  print_title: string;
  is_default: number;
  created_at?: string;
}

export interface VoucherWordPayload {
  word: string;
  printTitle: string;
  isDefault?: number;
}

/* ---- 操作日志 ---- */
export interface OpLogEntry {
  id: number;
  userId: number;
  username: string;
  action: string;
  target: string;
  detail: string;
  createdAt: string;
}

/* ---- 凭证模板 ---- */
export interface VoucherTemplate {
  id: number;
  name: string;
  entries: Array<{ summary: string; subjectCode: string; subjectName: string }>;
  shareType: 'personal' | 'shared';
  createdAt: string;
}

/* ---- 摘要库 ---- */
export interface VoucherSummary {
  id: number;
  text: string;
  category: string;
  createdAt: string;
}

/* ---- 所有者权益变动表 ---- */
export interface EquityChangeRow {
  row_no: number;
  name: string;
  paid_in_capital: number;
  capital_reserve: number;
  surplus_reserve: number;
  undistributed_profit: number;
  total: number;
  is_header?: boolean;
  is_total?: boolean;
  bold?: boolean;
  indent_level?: number;
}

export interface EquityChangeStatement {
  company_name: string;
  period: string;
  rows: EquityChangeRow[];
}

/* ---- 应交税费明细表 ---- */
export interface TaxPayableDetailRow {
  tax_code: string;
  tax_name: string;
  opening_balance: number;
  current_debit: number;
  current_credit: number;
  ending_balance: number;
}

export interface TaxPayableDetail {
  company_name: string;
  period: string;
  rows: TaxPayableDetailRow[];
}

/* ---- 费用明细汇总表 ---- */
export interface ExpenseSummaryRow {
  subject_code: string;
  subject_name: string;
  period_amount: number;
  year_amount: number;
}

export interface ExpenseSummary {
  company_name: string;
  period: string;
  rows: ExpenseSummaryRow[];
}

/* ---- 应收账款/应付账款账龄分析 ---- */
export interface AgingRow {
  subject_code: string;
  subject_name: string;
  voucher_date: string;
  voucher_word: string;
  voucher_no: number;
  summary: string;
  amount: number;
  days_outstanding: number;
  aging_bucket: string;
}

export interface AgingAnalysis {
  company_name: string;
  period: string;
  type: 'receivable' | 'payable';
  rows: AgingRow[];
  summary: {
    within_30: number;
    within_90: number;
    within_180: number;
    within_365: number;
    over_365: number;
    total: number;
  };
}

/* ---- 固定资产折旧汇总表 ---- */
export interface DepreciationSummaryRow {
  asset_code: string;
  asset_name: string;
  category: string;
  original_value: number;
  monthly_depreciation: number;
  accumulated_depreciation: number;
  net_value: number;
  current_period_depreciation: number;
}

export interface DepreciationSummary {
  company_name: string;
  period: string;
  rows: DepreciationSummaryRow[];
  totals: {
    original_value: number;
    monthly_depreciation: number;
    accumulated_depreciation: number;
    net_value: number;
    current_period_depreciation: number;
  };
}

/* ---- 固定资产 ---- */
export interface AssetCard {
  id: number;
  book_id: number;
  asset_code: string;
  asset_name: string;
  category: string;
  buy_date: string;
  original_value: number;
  residual_rate: number;
  useful_life_years: number;
  monthly_depreciation: number;
  accumulated_depreciation: number;
  net_value: number;
  status: string;
  department: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface AssetCardPayload {
  assetCode?: string;
  assetName?: string;
  category?: string;
  buyDate?: string;
  originalValue?: number;
  residualRate?: number;
  usefulLifeYears?: number;
  accumulatedDepreciation?: number;
  status?: string;
  department?: string;
  remark?: string;
}

export interface AssetStats {
  totalOriginal: number;
  totalDep: number;
  totalNet: number;
  cnt: number;
}

/* ---- 数据管理 ---- */
export interface DatabaseInfo {
  dbPath: string;
  dbSize: number;
  pageCount: number;
  freelistCount: number;
  tableCounts?: Record<string, number>;
}

export interface MultiColumnSchemePayload {
  name: string;
  parentCode: string;
  parentName: string;
  direction?: string;
  childrenJson?: string;
}

/* ---- bootstrap ---- */
export interface BootstrapData {
  book: { id: number; name: string; company_name: string; current_period: string };
  subjects: FinanceSubject[];
  vouchers: FinanceVoucher[];
  openings: OpeningBalance[];
  periods: { period: string; status: string }[];
  auxProjectTypes?: AuxProjectType[];
  auxProjectValues?: AuxProjectValue[];
}

/* ---- API ---- */
export interface FinanceApi {
  bootstrap(): Promise<BootstrapData>;

  login(username: string, password: string): Promise<AuthUser | null>;
  getCompanies(): Promise<Company[]>;
  createCompany(name: string, data?: Partial<Company>): Promise<Company>;
  updateCompany(id: string, data: Partial<Company>): Promise<Company>;
  deleteCompany(companyId: string): Promise<{ deleted: boolean }>;
  switchCompany(companyId: string): Promise<void>;
  getCurrentCompany(): Company | null;

  listUsers(): Promise<SysUser[]>;
  createUser(payload: UserPayload): Promise<SysUser>;
  updateUser(id: number, data: { alias?: string; role?: UserRole; enabled?: number }): Promise<SysUser>;
  changePassword(oldPassword: string, newPassword: string): Promise<boolean>;
  resetUserPassword(userId: number, newPassword: string): Promise<boolean>;
  getUserProfile(): Promise<{ userId: number; username: string; alias: string; role: UserRole } | null>;

  listSubjects(): Promise<FinanceSubject[]>;
  createSubject(payload: SubjectPayload): Promise<FinanceSubject>;
  updateSubject(payload: SubjectPayload): Promise<FinanceSubject>;
  deleteSubject(code: string): Promise<void>;

  setOpeningBalance(payload: { subjectCode: string; subjectName: string; debit: number; credit: number; period: string }): Promise<OpeningBalance>;
  getOpeningBalances(period: string): Promise<OpeningBalance[]>;

  closePeriod(period: string): Promise<void>;
  reopenPeriod(period: string): Promise<void>;

  listVouchers(filter?: VoucherFilter): Promise<FinanceVoucher[]>;
  getVoucher(id: number): Promise<FinanceVoucher>;
  createVoucher(payload: VoucherPayload): Promise<FinanceVoucher & { __error?: string }>;
  updateVoucher(payload: VoucherPayload): Promise<FinanceVoucher & { __error?: string }>;
  deleteVoucher(id: number): Promise<void>;

  auditVoucher(id: number): Promise<FinanceVoucher & { __error?: string }>;
  unauditVoucher(id: number): Promise<FinanceVoucher & { __error?: string }>;
  postVoucher(id: number): Promise<FinanceVoucher & { __error?: string }>;
  unpostVoucher(id: number): Promise<FinanceVoucher & { __error?: string }>;

  reorderVoucherNos(payload: { voucherWord: string; period: string }): Promise<void>;
  reorderAllVoucherNos(period: string): Promise<Array<{ word: string; count: number }>>;
  renumberSubjects(): Promise<any>;
  getNextVoucherNo(payload: { voucherWord: string; period: string }): Promise<number>;

  /* 附件 */
  listAttachments(voucherId: number): Promise<VoucherAttachment[]>;
  uploadAttachment(voucherId: number, file: { name: string; size: number; dataUrl: string }): Promise<VoucherAttachment>;
  deleteAttachment(attachmentId: number): Promise<void>;
  getAttachmentPath(attachmentId: number): Promise<string>;
  readAttachmentFile(attachmentId: number): Promise<{ mime_type: string; data_url: string } | null>;

  getSubjectBalance(filter?: { period?: string; subjectCode?: string; category?: string }): Promise<SubjectBalance[]>;
  getDetailLedger(filter?: { subjectCode?: string; period?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }): Promise<DetailLedgerResult>;
  getGeneralLedger(filter?: { subjectCode?: string; period?: string; page?: number; pageSize?: number }): Promise<{ rows: GeneralLedgerRow[]; total: number }>;
  getTrialBalance(period: string): Promise<TrialBalance>;
  getProfitStatement(period: string): Promise<ProfitStatement>;
  getBalanceSheet(period: string): Promise<BalanceSheet>;
  getCashFlowStatement(period: string): Promise<CashFlowStatement>;
  getEquityChangeStatement(period: string): Promise<EquityChangeStatement>;
  getTaxPayableDetail(period: string): Promise<TaxPayableDetail>;
  getExpenseSummary(period: string): Promise<ExpenseSummary>;
  getReceivableAging(period: string): Promise<AgingAnalysis>;
  getPayableAging(period: string): Promise<AgingAnalysis>;
  getDepreciationSummary(period: string): Promise<DepreciationSummary>;
  checkYearEndIntegrity(currentPeriod?: string): Promise<YearEndIntegrityCheck>;

  /* 辅助核算类别 */
  listAuxProjectTypes(): Promise<AuxProjectType[]>;
  createAuxProjectType(payload: AuxProjectPayload): Promise<AuxProjectType>;
  updateAuxProjectType(payload: { id: number; code: string; name: string }): Promise<AuxProjectType>;
  deleteAuxProjectType(id: number): Promise<void>;

  /* 辅助核算项目值 */
  listAuxProjectValues(typeId: number): Promise<AuxProjectValue[]>;
  createAuxProjectValue(payload: { typeId: number; code: string; name: string }): Promise<AuxProjectValue>;
  updateAuxProjectValue(payload: { id: number; code: string; name: string; enabled?: number }): Promise<AuxProjectValue>;
  deleteAuxProjectValue(id: number): Promise<void>;

  /* 数量金额账簿 */
  getQuantityDetailLedger(filter?: { subjectCode?: string; period?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }): Promise<{ rows: QuantityDetailLedgerRow[]; total: number }>;
  getQuantityGeneralLedger(filter?: { subjectCode?: string; period?: string; page?: number; pageSize?: number }): Promise<{ rows: QuantityGeneralLedgerRow[]; total: number }>;

  /* 多栏账 */
  listMultiColumnSchemes(): Promise<MultiColumnScheme[]>;
  createMultiColumnScheme(payload: MultiColumnSchemePayload): Promise<MultiColumnScheme>;
  updateMultiColumnScheme(payload: { id: number; name: string; parentCode: string; parentName: string; direction?: string; childrenJson?: string }): Promise<MultiColumnScheme>;
  deleteMultiColumnScheme(id: number): Promise<void>;
  getMultiColumnLedger(filter?: { parentCode?: string; period?: string; startDate?: string; endDate?: string; childrenJson?: string }): Promise<MultiColumnLedgerResult>;

  /* 辅助核算报表 */
  getAuxProjectBalance(filter?: { auxTypeId?: number; auxValueId?: number; period?: string }): Promise<AuxProjectBalanceRow[]>;
  getAuxProjectDetail(filter?: { auxTypeId?: number; auxValueId?: number; period?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }): Promise<{ rows: AuxProjectDetailRow[]; total: number }>;
  getAuxProjectCombo(filter?: { period?: string; auxTypeId?: number }): Promise<AuxProjectCombo>;

  /* 凭证字管理 */
  listVoucherWords(): Promise<VoucherWordType[]>;
  createVoucherWord(payload: VoucherWordPayload): Promise<VoucherWordType>;
  updateVoucherWord(id: number, payload: Partial<VoucherWordPayload>): Promise<VoucherWordType>;
  deleteVoucherWord(id: number): Promise<void>;

  /* 数据管理 */
  getDatabaseInfo(): Promise<DatabaseInfo>;
  vacuumDatabase(): Promise<{ success: boolean; beforeSize?: number; afterSize?: number }>;
  backupDatabase(): Promise<{ success?: boolean; canceled?: boolean; path?: string; __error?: string }>;
  exportAllData(): Promise<any>;
  exportDataJson(): Promise<{ success?: boolean; canceled?: boolean; path?: string; __error?: string }>;

  /* 批量操作 */
  batchAuditVouchers(ids: number[]): Promise<{ success: number; failed: number }>;
  batchPostVouchers(ids: number[]): Promise<{ success: number; failed: number }>;

  /* 操作日志 */
  getOperationLogs(filter?: { startDate?: string; endDate?: string; limit?: number }): Promise<OpLogEntry[]>;

  /* 科目引用检查 */
  checkSubjectUsage(code: string): Promise<{ voucherCount: number; hasChildren: boolean }>;

  /* 凭证模板 */
  listVoucherTemplates(): Promise<VoucherTemplate[]>;
  saveVoucherTemplate(name: string, entries: Array<{ summary: string; subjectCode: string; subjectName: string }>): Promise<VoucherTemplate>;
  deleteVoucherTemplate(id: number): Promise<void>;

  /* 摘要库 */
  listVoucherSummaries(): Promise<VoucherSummary[]>;
  createVoucherSummary(text: string, category: string): Promise<VoucherSummary>;
  deleteVoucherSummary(id: number): Promise<void>;

  /* 固定资产 */
  listAssetCards(filter?: { status?: string; category?: string }): Promise<AssetCard[]>;
  getAssetCard(id: number): Promise<AssetCard | undefined>;
  createAssetCard(payload: AssetCardPayload): Promise<{ id: number; monthlyDepreciation: number }>;
  updateAssetCard(id: number, payload: AssetCardPayload): Promise<{ monthlyDepreciation: number }>;
  deleteAssetCard(id: number): Promise<void>;
  depreciateAsset(id: number, periods?: number): Promise<{ addedDepreciation: number; accumulatedDepreciation: number; netValue: number; status: string }>;
  getAssetStats(): Promise<AssetStats>;
}

declare global {
  interface Window {
    financeApi?: FinanceApi;
    electronAPI?: {
      invoke(channel: string, ...args: unknown[]): Promise<any>;
      windowMin(): Promise<void>;
      windowMax(): Promise<void>;
      windowClose(): Promise<void>;
    };
    /** 科目表单预填父科目 */
    __prefillParent?: FinanceSubject;
    /** API 实例缓存 */
    __financeApiInstance?: FinanceApi;
  }
}
