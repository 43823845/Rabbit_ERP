/**
 * mock.ts — Mock 数据层（浏览器开发环境）
 *
 * 职责：在浏览器环境下提供完整的内存模拟 API（科目/凭证/用户/附件/报表）
 *       所有数据存储在 localStorage，支持多公司切换
 */
import type {
  FinanceApi, Company, AuthUser, SysUser, UserPayload, UserRole,
  FinanceSubject, FinanceVoucher,
  SubjectPayload, VoucherPayload, VoucherFilter, OpeningBalance,
  SubjectBalance, DetailLedgerRow, DetailLedgerResult, GeneralLedgerRow,
  TrialBalance, ProfitStatement, BalanceSheet, CashFlowStatement, YearEndIntegrityCheck, BootstrapData,
  ProfitStatementRow, BalanceSheetRow,
  AuxProjectType, AuxProjectValue, AuxProjectPayload,
  QuantityDetailLedgerRow, QuantityGeneralLedgerRow,
  AuxProjectBalanceRow, AuxProjectDetailRow,
  VoucherWordType, VoucherWordPayload,
  MultiColumnScheme, MultiColumnLedgerResult, MultiColumnLedgerRow, MultiColumnSchemePayload, MultiColumnLedgerSummary,
} from '../vite-env';

// 共享报表模板与公式（CJS 模块，Vite 自动转换）
// @ts-ignore - CJS module
import { getTemplatesByType } from '../../shared/report-templates.cjs';
// @ts-ignore - CJS module
import { fillTemplateAmount, classifyCashFlowCategory } from '../../shared/report-formulas.cjs';

async function hashPassword(pwd: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`rabbit_erp_salt_${pwd}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getBuiltinSubjects(): FinanceSubject[] {
  return [
    // ========== 资产类 ==========
    { code: '1001', name: '库存现金', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1, isCash: 1, auxType: '' },
    { code: '1002', name: '银行存款', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1, isCash: 1, auxType: '' },
    { code: '1012', name: '其他货币资金', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1101', name: '交易性金融资产', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1121', name: '应收票据', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1122', name: '应收账款', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1123', name: '预付账款', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1131', name: '应收股利', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1132', name: '应收利息', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1221', name: '其他应收款', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1231', name: '坏账准备', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1401', name: '材料采购', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1402', name: '在途物资', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1403', name: '原材料', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1405', name: '库存商品', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1406', name: '发出商品', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1408', name: '委托加工物资', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1411', name: '周转材料', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1471', name: '存货跌价准备', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1511', name: '长期股权投资', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1512', name: '长期股权投资减值准备', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1521', name: '投资性房地产', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1531', name: '长期应收款', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1601', name: '固定资产', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1602', name: '累计折旧', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1603', name: '固定资产减值准备', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1604', name: '在建工程', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1605', name: '工程物资', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1606', name: '固定资产清理', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1701', name: '无形资产', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1702', name: '累计摊销', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1703', name: '无形资产减值准备', direction: 'credit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1711', name: '商誉', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1801', name: '长期待摊费用', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1811', name: '递延所得税资产', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    { code: '1901', name: '待处理财产损溢', direction: 'debit', category: 'asset', level: 1, enabled: 1, builtin: 1 },
    // ========== 负债类 ==========
    { code: '2001', name: '短期借款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2201', name: '应付票据', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2202', name: '应付账款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2203', name: '预收账款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2211', name: '应付职工薪酬', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2221', name: '应交税费', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2231', name: '应付利息', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2232', name: '应付股利', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2241', name: '其他应付款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2401', name: '递延收益', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2501', name: '长期借款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2502', name: '应付债券', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2701', name: '长期应付款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2711', name: '专项应付款', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2801', name: '预计负债', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    { code: '2901', name: '递延所得税负债', direction: 'credit', category: 'liability', level: 1, enabled: 1, builtin: 1 },
    // ========== 权益类 ==========
    { code: '4001', name: '实收资本', direction: 'credit', category: 'equity', level: 1, enabled: 1, builtin: 1 },
    { code: '4002', name: '资本公积', direction: 'credit', category: 'equity', level: 1, enabled: 1, builtin: 1 },
    { code: '4101', name: '盈余公积', direction: 'credit', category: 'equity', level: 1, enabled: 1, builtin: 1 },
    { code: '4103', name: '本年利润', direction: 'credit', category: 'equity', level: 1, enabled: 1, builtin: 1 },
    { code: '4104', name: '利润分配', direction: 'credit', category: 'equity', level: 1, enabled: 1, builtin: 1 },
    // ========== 成本类 ==========
    { code: '5001', name: '生产成本', direction: 'debit', category: 'cost', level: 1, enabled: 1, builtin: 1 },
    { code: '5101', name: '制造费用', direction: 'debit', category: 'cost', level: 1, enabled: 1, builtin: 1 },
    { code: '5201', name: '劳务成本', direction: 'debit', category: 'cost', level: 1, enabled: 1, builtin: 1 },
    { code: '5301', name: '研发支出', direction: 'debit', category: 'cost', level: 1, enabled: 1, builtin: 1 },
    // ========== 收入类 ==========
    { code: '6001', name: '主营业务收入', direction: 'credit', category: 'income', level: 1, enabled: 1, builtin: 1 },
    { code: '6051', name: '其他业务收入', direction: 'credit', category: 'income', level: 1, enabled: 1, builtin: 1 },
    { code: '6101', name: '公允价值变动损益', direction: 'credit', category: 'income', level: 1, enabled: 1, builtin: 1 },
    { code: '6111', name: '投资收益', direction: 'credit', category: 'income', level: 1, enabled: 1, builtin: 1 },
    { code: '6301', name: '营业外收入', direction: 'credit', category: 'income', level: 1, enabled: 1, builtin: 1 },
    // ========== 费用类 ==========
    { code: '6401', name: '主营业务成本', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6402', name: '其他业务成本', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6403', name: '税金及附加', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6601', name: '销售费用', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6602', name: '管理费用', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6603', name: '财务费用', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6701', name: '资产减值损失', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6711', name: '营业外支出', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6801', name: '所得税费用', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    { code: '6901', name: '以前年度损益调整', direction: 'debit', category: 'expense', level: 1, enabled: 1, builtin: 1 },
    // ========== 常用二级科目 ==========
    // 应交税费明细
    { code: '222101', name: '应交增值税', direction: 'credit', category: 'liability', level: 2, parent_code: '2221', enabled: 1, builtin: 1 },
    { code: '222102', name: '未交增值税', direction: 'credit', category: 'liability', level: 2, parent_code: '2221', enabled: 1, builtin: 1 },
    { code: '222103', name: '应交所得税', direction: 'credit', category: 'liability', level: 2, parent_code: '2221', enabled: 1, builtin: 1 },
    { code: '222104', name: '应交城建税', direction: 'credit', category: 'liability', level: 2, parent_code: '2221', enabled: 1, builtin: 1 },
    { code: '222105', name: '应交教育费附加', direction: 'credit', category: 'liability', level: 2, parent_code: '2221', enabled: 1, builtin: 1 },
    { code: '222106', name: '应交个人所得税', direction: 'credit', category: 'liability', level: 2, parent_code: '2221', enabled: 1, builtin: 1 },
    // 管理费用明细
    { code: '660201', name: '工资', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660202', name: '办公费', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660203', name: '差旅费', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660204', name: '业务招待费', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660205', name: '折旧费', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660206', name: '水电费', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660207', name: '咨询费', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    { code: '660208', name: '社保公积金', direction: 'debit', category: 'expense', level: 2, parent_code: '6602', enabled: 1, builtin: 1 },
    // 销售费用明细
    { code: '660101', name: '广告宣传费', direction: 'debit', category: 'expense', level: 2, parent_code: '6601', enabled: 1, builtin: 1 },
    { code: '660102', name: '运输费', direction: 'debit', category: 'expense', level: 2, parent_code: '6601', enabled: 1, builtin: 1 },
    { code: '660103', name: '销售人员工资', direction: 'debit', category: 'expense', level: 2, parent_code: '6601', enabled: 1, builtin: 1 },
    { code: '660104', name: '展览费', direction: 'debit', category: 'expense', level: 2, parent_code: '6601', enabled: 1, builtin: 1 },
    // 财务费用明细
    { code: '660301', name: '利息收入', direction: 'credit', category: 'expense', level: 2, parent_code: '6603', enabled: 1, builtin: 1 },
    { code: '660302', name: '利息支出', direction: 'debit', category: 'expense', level: 2, parent_code: '6603', enabled: 1, builtin: 1 },
    { code: '660303', name: '手续费', direction: 'debit', category: 'expense', level: 2, parent_code: '6603', enabled: 1, builtin: 1 },
  ];
}

const DEFAULT_SUBJECTS: FinanceSubject[] = getBuiltinSubjects();

interface Store {
  book: { id: number; name: string; company_name: string; current_period: string };
  subjects: FinanceSubject[];
  vouchers: FinanceVoucher[];
  openings: OpeningBalance[];
  periods: { period: string; status: string }[];
  attachments: { id: number; voucher_id: number; file_name: string; file_size: number; file_path: string; mime_type: string; created_at: string }[];
  auxProjectTypes: AuxProjectType[];
  auxProjectValues: AuxProjectValue[];
  multiColumnSchemes: MultiColumnScheme[];
  voucherWords: VoucherWordType[];
  opLogs: { id: number; userId: number; username: string; action: string; target: string; detail: string; createdAt: string }[];
  voucherTemplates: { id: number; name: string; entries: Array<{ summary: string; subjectCode: string; subjectName: string }>; shareType: 'personal' | 'shared'; createdAt: string }[];


  voucherSummaries: { id: number; text: string; category: string; createdAt: string }[];
}

interface MockUser {
  id: number; username: string; _password: string;
  alias: string; role: UserRole; enabled: number; createdAt: string;
}

export class MockFinanceApi implements FinanceApi {
  private companyId: string | null = null;
  private store!: Store;

  /* ---- 固定资产卡片 Mock ---- */
  private _assetKey() { return `finance_assets_${this.companyId}`; }
  private _loadAssets(): import('../vite-env').AssetCard[] {
    try { return JSON.parse(localStorage.getItem(this._assetKey()) || '[]'); }
    catch { return []; }
  }
  private _saveAssets(list: import('../vite-env').AssetCard[]) {
    localStorage.setItem(this._assetKey(), JSON.stringify(list));
  }

  async listAssetCards(filter?: { status?: string; category?: string }): Promise<import('../vite-env').AssetCard[]> {
    let list = this._loadAssets();
    if (filter?.status) list = list.filter(a => a.status === filter.status);
    if (filter?.category) list = list.filter(a => a.category === filter.category);
    return list.sort((a, b) => b.id - a.id);
  }

  async getAssetCard(id: number): Promise<import('../vite-env').AssetCard> {
    const a = this._loadAssets().find(x => x.id === id);
    if (!a) throw new Error('资产卡片不存在');
    return a;
  }

  async createAssetCard(payload: import('../vite-env').AssetCardPayload): Promise<{ id: number; monthlyDepreciation: number }> {
    const list = this._loadAssets();
    const id = list.length > 0 ? Math.max(...list.map(a => a.id)) + 1 : 1;
    const years = payload.usefulLifeYears ?? 5;
    const origVal = payload.originalValue ?? 0;
    const rate = payload.residualRate ?? 0.05;
    const months = years * 12;
    const monthlyDep = months > 0 ? Math.round((origVal * (1 - rate) / months) * 100) / 100 : 0;
    const now = new Date().toISOString();
    const card: import('../vite-env').AssetCard = {
      id, book_id: 1,
      asset_code: payload.assetCode || '',
      asset_name: payload.assetName || '',
      category: payload.category || '办公设备',
      buy_date: payload.buyDate || '',
      original_value: origVal,
      residual_rate: rate,
      useful_life_years: years,
      monthly_depreciation: monthlyDep,
      accumulated_depreciation: 0,
      net_value: origVal,
      status: payload.status || '在用',
      department: payload.department || '',
      remark: payload.remark || '',
      created_at: now,
      updated_at: now,
    };
    list.push(card);
    this._saveAssets(list);
    return { id: card.id, monthlyDepreciation: card.monthly_depreciation };
  }

  async updateAssetCard(id: number, payload: import('../vite-env').AssetCardPayload): Promise<{ monthlyDepreciation: number }> {
    const list = this._loadAssets();
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) throw new Error('资产卡片不存在');
    const years = payload.usefulLifeYears ?? list[idx].useful_life_years;
    const origVal = payload.originalValue ?? list[idx].original_value;
    const rate = payload.residualRate ?? list[idx].residual_rate;
    const months = years * 12;
    const monthlyDep = months > 0 ? Math.round((origVal * (1 - rate) / months) * 100) / 100 : 0;
    const accDep = list[idx].accumulated_depreciation;
    list[idx] = {
      ...list[idx],
      asset_code: payload.assetCode || list[idx].asset_code,
      asset_name: payload.assetName || list[idx].asset_name,
      category: payload.category || list[idx].category,
      buy_date: payload.buyDate || list[idx].buy_date,
      original_value: payload.originalValue ?? list[idx].original_value,
      residual_rate: payload.residualRate ?? list[idx].residual_rate,
      useful_life_years: payload.usefulLifeYears ?? list[idx].useful_life_years,
      monthly_depreciation: monthlyDep,
      net_value: (payload.originalValue ?? list[idx].original_value) - accDep,
      status: payload.status || list[idx].status,
      department: payload.department ?? list[idx].department,
      remark: payload.remark ?? list[idx].remark,
      updated_at: new Date().toISOString(),
    };
    this._saveAssets(list);
    return { monthlyDepreciation: list[idx].monthly_depreciation };
  }

  async deleteAssetCard(id: number): Promise<void> {
    const list = this._loadAssets();
    this._saveAssets(list.filter(a => a.id !== id));
  }

  async depreciateAsset(id: number, periods: number = 1): Promise<{ addedDepreciation: number; accumulatedDepreciation: number; netValue: number; status: string }> {
    const list = this._loadAssets();
    const idx = list.findIndex(a => a.id === id);
    if (idx < 0) throw new Error('资产卡片不存在');
    const card = list[idx];

    // 状态检查（与 electron assets.cjs 保持一致）
    if (card.status === '报废' || card.status === '已处置') throw new Error('已报废/已处置的资产不能计提折旧');
    if (card.status === '已提足折旧') throw new Error('该资产已提足折旧，无需再计提');

    // 计算剩余可提折旧额度，不超过残值
    const residual = card.original_value * (card.residual_rate || 0);
    const maxDepreciable = card.original_value - residual;
    const remainingDepreciable = Math.max(0, maxDepreciable - card.accumulated_depreciation);
    const maxPeriods = card.monthly_depreciation > 0 ? Math.floor(remainingDepreciable / card.monthly_depreciation) : 0;
    const effectivePeriods = Math.min(periods, maxPeriods);
    if (effectivePeriods <= 0) throw new Error('该资产可计提折旧额度已用完');

    const added = Math.round((card.monthly_depreciation * effectivePeriods) * 100) / 100;
    const newAcc = Math.round((card.accumulated_depreciation + added) * 100) / 100;
    const newNet = Math.round((card.original_value - newAcc) * 100) / 100;

    // 净值不能为负，累计折旧不能超过原值
    const finalStatus = newNet <= 0 ? '已提足折旧' : card.status;
    const finalNetValue = Math.max(0, newNet);
    const finalAccDep = Math.min(card.original_value, newAcc);

    list[idx] = {
      ...card,
      accumulated_depreciation: finalAccDep,
      net_value: finalNetValue,
      status: finalStatus,
      updated_at: new Date().toISOString(),
    };
    this._saveAssets(list);
    return { addedDepreciation: added, accumulatedDepreciation: finalAccDep, netValue: finalNetValue, status: finalStatus };
  }

  async getAssetStats(): Promise<import('../vite-env').AssetStats> {
    const list = this._loadAssets();
    return {
      totalOriginal: Math.round(list.reduce((s, a) => s + a.original_value, 0) * 100) / 100,
      totalDep: Math.round(list.reduce((s, a) => s + a.accumulated_depreciation, 0) * 100) / 100,
      totalNet: Math.round(list.reduce((s, a) => s + a.net_value, 0) * 100) / 100,
      cnt: list.length,
    };
  }

  constructor() {

    const last = localStorage.getItem('finance_last_company');
    if (last) {
      try {
        const parsed = JSON.parse(last);
        this.companyId = parsed.companyId;
        this.loadStore();
      } catch (e) { console.warn('[MockApi] 解析上次公司信息失败:', e); this.companyId = null; }
    }
  }

  private storageKey() { return `finance_data_${this.companyId}`; }

  private loadStore() {
    if (!this.companyId) return;
    const saved = localStorage.getItem(this.storageKey());
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const companies = this.getCompaniesSync();
        const c = companies.find((x) => x.id === this.companyId);
        const name = c?.name || '默认账套';
        this.store = {
          book: { id: 1, name, company_name: name, current_period: c?.period || '2026-06' },
          subjects: parsed.subjects || DEFAULT_SUBJECTS.map(s => ({ ...s })),
          vouchers: parsed.vouchers || [],
          openings: parsed.openings || [],
          periods: parsed.periods || [],
          attachments: parsed.attachments || [],
          auxProjectTypes: parsed.auxProjectTypes || [],
          auxProjectValues: parsed.auxProjectValues || [],
          multiColumnSchemes: parsed.multiColumnSchemes || [],
          voucherWords: parsed.voucherWords || [],
          opLogs: parsed.opLogs || [],
          voucherTemplates: parsed.voucherTemplates || [],
          voucherSummaries: parsed.voucherSummaries || [],
        };
        return;
      } catch (e) { console.warn('[MockApi] 解析持久化数据失败:', e); }
    }
    const companies = this.getCompaniesSync();
    const c = companies.find(x => x.id === this.companyId);
    this.store = this._defaultStore(c?.name || '默认账套');
  }

  private _defaultStore(name: string): Store {
    return {
      book: { id: 1, name, company_name: name, current_period: '2026-06' },
      subjects: DEFAULT_SUBJECTS.map(s => ({ ...s })),
      vouchers: [],
      openings: [],
      periods: [],
      attachments: [],
      auxProjectTypes: [
        { id: 1, book_id: 1, code: 'CUSTOMER', name: '客户', created_at: new Date().toISOString() },
        { id: 2, book_id: 1, code: 'SUPPLIER', name: '供应商', created_at: new Date().toISOString() },
        { id: 3, book_id: 1, code: 'DEPARTMENT', name: '部门', created_at: new Date().toISOString() },
        { id: 4, book_id: 1, code: 'PROJECT', name: '项目', created_at: new Date().toISOString() },
        { id: 5, book_id: 1, code: 'EMPLOYEE', name: '职员', created_at: new Date().toISOString() },
      ],
      auxProjectValues: [],
      multiColumnSchemes: [],
      voucherWords: [],
      opLogs: [],
      voucherTemplates: [],
      voucherSummaries: [],
    };
  }

  private save() {
    if (!this.companyId) return;
    localStorage.setItem(this.storageKey(), JSON.stringify({
      vouchers: this.store.vouchers,
      openings: this.store.openings,
      subjects: this.store.subjects,
      periods: this.store.periods,
      attachments: this.store.attachments,
      auxProjectTypes: this.store.auxProjectTypes,
      auxProjectValues: this.store.auxProjectValues,
      multiColumnSchemes: this.store.multiColumnSchemes,
      voucherWords: this.store.voucherWords,
      opLogs: this.store.opLogs,
      voucherTemplates: this.store.voucherTemplates,
      voucherSummaries: this.store.voucherSummaries,
    }));
  }

  private getCompaniesSync(): Company[] {
    try { return JSON.parse(localStorage.getItem('finance_company_list') || '[]'); }
    catch (e) { console.warn('[MockApi] 解析公司列表失败:', e); return []; }
  }

  private saveCompanies(list: Company[]) {
    localStorage.setItem('finance_company_list', JSON.stringify(list));
  }

  /* ---- Auth ---- */
  async login(username: string, password: string): Promise<AuthUser | null> {
    const users = this.getUsersSync();
    const hashedInput = await hashPassword(password);
    const user = users.find(u => u.username === username && u._password === hashedInput);
    if (!user || !user.enabled) return null;
    const companies = this.getCompaniesSync();
    if (companies.length === 0) {
      companies.push({ id: 'default', name: '默认公司', period: '2026-06', createdAt: new Date().toISOString() });
      this.saveCompanies(companies);
    }
    this.companyId = companies[0].id;
    localStorage.setItem('finance_last_company', JSON.stringify({ companyId: this.companyId }));
    this.loadStore();
    return { userId: user.id, username: user.username, alias: user.alias, role: user.role, companyId: this.companyId, companyName: companies[0].name };
  }

  private getUsersSync(): MockUser[] {
    try { return JSON.parse(localStorage.getItem('finance_users') || '[]'); }
    catch (e) { console.warn('[MockApi] 解析用户列表失败:', e); return []; }
  }

  private saveUsers(list: MockUser[]) {
    localStorage.setItem('finance_users', JSON.stringify(list));
  }

  async listUsers(): Promise<SysUser[]> {
    return this.getUsersSync().map(u => ({ id: u.id, username: u.username, alias: u.alias, role: u.role, enabled: u.enabled, createdAt: u.createdAt }));
  }

  async createUser(payload: UserPayload): Promise<SysUser> {
    const users = this.getUsersSync();
    if (users.find(u => u.username === payload.username)) throw new Error('用户名已存在');
    const user = {
      id: Date.now(),
      username: payload.username,
      _password: await hashPassword(payload.password),
      alias: payload.alias || payload.username,
      role: payload.role || 'accountant',
      enabled: 1,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    this.saveUsers(users);
    return { id: user.id, username: user.username, alias: user.alias, role: user.role as UserRole, enabled: 1, createdAt: user.createdAt };
  }

  async updateUser(id: number, data: { alias?: string; role?: UserRole; enabled?: number }): Promise<SysUser> {
    const users = this.getUsersSync();
    const idx = users.findIndex(u => u.id === id);
    if (idx < 0) throw new Error('用户不存在');
    if (data.alias !== undefined) users[idx].alias = data.alias;
    if (data.role !== undefined) users[idx].role = data.role;
    if (data.enabled !== undefined) users[idx].enabled = data.enabled;
    this.saveUsers(users);
    return { id: users[idx].id, username: users[idx].username, alias: users[idx].alias, role: users[idx].role, enabled: users[idx].enabled, createdAt: users[idx].createdAt };
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
    if (!newPassword || newPassword.length < 4) throw new Error('新密码至少4位');
    const authState = this.getCachedUserId();
    const users = this.getUsersSync();
    const user = users.find(u => u.id === authState);
    if (!user) throw new Error('用户不存在');
    const hashedOld = await hashPassword(oldPassword);
    if (user._password !== hashedOld) throw new Error('原密码错误');
    user._password = await hashPassword(newPassword);
    this.saveUsers(users);
    return true;
  }

  async getUserProfile() {
    const id = this.getCachedUserId();
    if (!id) return null;
    const users = this.getUsersSync();
    const u = users.find(x => x.id === id);
    if (!u) return null;
    return { userId: u.id, username: u.username, alias: u.alias, role: u.role };
  }

  private getCachedUserId(): number | null {
    try {
      const raw = localStorage.getItem('finance_auth_state');
      if (raw) { const state = JSON.parse(raw); return state.user?.userId || null; }
    } catch (e) { console.warn('[MockApi] 读取缓存用户ID失败:', e); }
    return null;
  }

  private getCachedUsername(): string {
    try {
      const raw = localStorage.getItem('finance_auth_state');
      if (raw) { const state = JSON.parse(raw); return state.user?.username || state.user?.alias || 'system'; }
    } catch (e) { return 'system'; }
    return 'system';
  }

  private getCachedUserRole(): string {
    try {
      const raw = localStorage.getItem('finance_auth_state');
      if (raw) { const state = JSON.parse(raw); return state.user?.role || 'viewer'; }
    } catch (e) { return 'viewer'; }
    return 'viewer';
  }

  /** 记录操作日志 */
  private logOperation(action: string, target: string, detail: string) {
    const userId = this.getCachedUserId() || 0;
    const username = this.getCachedUsername();
    const entry = {
      id: this.store.opLogs.length > 0 ? Math.max(...this.store.opLogs.map(l => l.id)) + 1 : 1,
      userId,
      username,
      action,
      target,
      detail,
      createdAt: new Date().toISOString(),
    };
    this.store.opLogs.unshift(entry);
    // 保留最近 500 条日志
    if (this.store.opLogs.length > 500) {
      this.store.opLogs = this.store.opLogs.slice(0, 500);
    }
    this.save();
  }

  async getCompanies(): Promise<Company[]> { return this.getCompaniesSync(); }

  async createCompany(name: string, data?: Partial<Company>): Promise<Company> {
    const companies = this.getCompaniesSync();
    const c: Company = { id: `company_${Date.now()}`, name, period: '2026-06', createdAt: new Date().toISOString(), ...data };
    companies.push(c);
    this.saveCompanies(companies);
    // 为新账套初始化数据存储（包含默认科目）
    this._initCompanyStore(c.id, c.name, c.period || '2026-06');
    return c;
  }

  /** 为新账套创建初始数据（默认科目 + 空凭证 + 空期初） */
  private _initCompanyStore(companyId: string, name: string, period: string) {
    const key = `finance_data_${companyId}`;
    if (localStorage.getItem(key)) return; // 已存在，跳过
    const store = {
      book: { id: 1, name, company_name: name, current_period: period },
      subjects: DEFAULT_SUBJECTS.map(s => ({ ...s })),
      vouchers: [],
      openings: [],
      periods: [{ period, status: 'open' }],
      attachments: [],
      auxProjectTypes: [
        { id: 1, book_id: 1, code: 'CUSTOMER', name: '客户', created_at: new Date().toISOString() },
        { id: 2, book_id: 1, code: 'SUPPLIER', name: '供应商', created_at: new Date().toISOString() },
        { id: 3, book_id: 1, code: 'DEPARTMENT', name: '部门', created_at: new Date().toISOString() },
        { id: 4, book_id: 1, code: 'PROJECT', name: '项目', created_at: new Date().toISOString() },
        { id: 5, book_id: 1, code: 'EMPLOYEE', name: '职员', created_at: new Date().toISOString() },
      ],
      auxProjectValues: [],
      multiColumnSchemes: [],
      voucherWords: [],
      opLogs: [],
      voucherTemplates: [],
      voucherSummaries: [],
    };
    localStorage.setItem(key, JSON.stringify(store));
  }

  async updateCompany(id: string, data: Partial<Company>): Promise<Company> {
    const companies = this.getCompaniesSync();
    const idx = companies.findIndex(c => c.id === id);
    if (idx < 0) throw new Error('公司不存在');
    companies[idx] = { ...companies[idx], ...data };
    this.saveCompanies(companies);
    return companies[idx];
  }

  async deleteCompany(companyId: string): Promise<{ deleted: boolean }> {
    let companies = this.getCompaniesSync();
    const idx = companies.findIndex(c => c.id === companyId);
    if (idx < 0) throw new Error('账套不存在');
    companies.splice(idx, 1);
    this.saveCompanies(companies);
    // 删除该公司关联的全部数据（凭证、科目、期初、期间、附件）
    localStorage.removeItem(`finance_data_${companyId}`);
    // 如果删除的是当前选中的账套，切换到第一个剩余账套
    if (this.companyId === companyId) {
      this.companyId = companies.length > 0 ? companies[0].id : null;
      if (this.companyId) {
        localStorage.setItem('finance_last_company', JSON.stringify({ companyId: this.companyId }));
        this.loadStore();
      }
    }
    return { deleted: true };
  }

  async switchCompany(companyId: string): Promise<void> {
    this.companyId = companyId;
    localStorage.setItem('finance_last_company', JSON.stringify({ companyId }));
    this.loadStore();
  }

  getCurrentCompany(): Company | null {
    if (!this.companyId) return null;
    return this.getCompaniesSync().find(c => c.id === this.companyId) || null;
  }

  /* ---- Core ---- */
  async bootstrap(): Promise<BootstrapData> { return this.store; }

  async listSubjects() { return this.store.subjects; }
  async createSubject(p: SubjectPayload): Promise<FinanceSubject> {
    // 检查编码唯一性
    if (this.store.subjects.find(s => s.code === p.code)) throw new Error('科目编码已存在');
    const s: FinanceSubject = {
      code: p.code, name: p.name,
      direction: p.direction as 'debit' | 'credit',
      category: p.category as FinanceSubject['category'],
      parent_code: p.parentCode || '',
      level: p.parentCode ? 2 : (p.level || 1),
      enabled: p.enabled ?? 1,
      builtin: 0,
      auxType: p.auxType || '',
      isCash: p.isCash ?? 0,
    };
    this.store.subjects.push(s); this.save(); return s;
  }
  async updateSubject(p: SubjectPayload): Promise<FinanceSubject> {
    const idx = this.store.subjects.findIndex(s => s.code === p.code);
    if (idx < 0) throw new Error('科目不存在');
    const s = this.store.subjects[idx];
    // 一级科目（builtin）不可更改编码和类别
    if (p.name !== undefined) s.name = p.name;
    if (p.direction !== undefined) s.direction = p.direction as 'debit' | 'credit';
    if (p.category !== undefined) s.category = p.category as FinanceSubject['category'];
    if (p.parentCode !== undefined) s.parent_code = p.parentCode;
    if (p.level !== undefined) s.level = p.level;
    if (p.enabled !== undefined) s.enabled = p.enabled;
    if (p.auxType !== undefined) s.auxType = p.auxType;
    if (p.isCash !== undefined) s.isCash = p.isCash;
    this.store.subjects[idx] = s;
    this.save(); return s;
  }
  async deleteSubject(code: string): Promise<void> {
    const subj = this.store.subjects.find(s => s.code === code);
    if (!subj) throw new Error('科目不存在');
    if (subj.builtin === 1) throw new Error('系统内置科目不可删除，可将其禁用');
    if (this.store.subjects.some(s => s.parent_code === code)) {
      throw new Error('该科目下有子科目，请先删除子科目');
    }
    this.store.subjects = this.store.subjects.filter(s => s.code !== code);
    this.save();
  }

  /* ---- Openings ---- */
  async setOpeningBalance(p: { subjectCode: string; subjectName: string; debit: number; credit: number; period: string }): Promise<OpeningBalance> {
    const idx = this.store.openings.findIndex(o => o.subject_code === p.subjectCode && o.subject_name === p.subjectName && o.period === p.period);
    const entry: OpeningBalance = { id: Date.now(), subject_code: p.subjectCode, subject_name: p.subjectName, debit: p.debit, credit: p.credit, period: p.period };
    if (idx >= 0) this.store.openings[idx] = entry;
    else this.store.openings.push(entry);
    this.save(); return entry;
  }
  async getOpeningBalances(period: string) { return this.store.openings.filter(o => o.period === period); }

  async closePeriod(period: string) {
    // 1. 检查期间是否存在
    const idx = this.store.periods.findIndex(p => p.period === period);
    if (idx < 0) throw new Error(`期间 ${period} 不存在，请先在系统设置中初始化期间`);
    if (this.store.periods[idx].status === 'closed') throw new Error(`期间 ${period} 已经结账，无需重复操作`);

    // 2. 检查是否按顺序结账（同一年度内，前面月份必须先结账）
    const yearNum = parseInt(period.substring(0, 4));
    const monthNum = parseInt(period.substring(5, 7));
    for (let m = 1; m < monthNum; m++) {
      const prevPeriod = yearNum + '-' + String(m).padStart(2, '0');
      const prev = this.store.periods.find(p => p.period === prevPeriod);
      if (prev && prev.status !== 'closed') {
        throw new Error(`前一期间 ${prevPeriod} 尚未结账，请按会计期间顺序逐月结账`);
      }
    }

    // 3. 检查该期间是否存在未过账凭证
    const unposted = this.store.vouchers.filter(v => v.period === period && (v.status === 'draft' || v.status === 'audited'));
    if (unposted.length > 0) {
      throw new Error(`当前期间存在 ${unposted.length} 张未过账凭证，请先审核并过账全部凭证后再结账`);
    }

    // 3.5 强制试算平衡检查（与 electron periods.cjs 保持一致，后端硬校验）
    const tb = await this.getTrialBalance(period);
    if (!tb || !tb.totals) throw new Error('无法获取试算平衡数据，请检查科目余额');
    const endingDiff = Math.abs((tb.totals.endingDebit || 0) - (tb.totals.endingCredit || 0));
    if (endingDiff > 0.01) {
      throw new Error(`试算不平衡（期末借方 ${tb.totals.endingDebit.toFixed(2)} ≠ 贷方 ${tb.totals.endingCredit.toFixed(2)}，差额 ${endingDiff.toFixed(2)}），请检查凭证后再结账`);
    }

    // 4. 执行损益结转
    this._carryForwardProfit(period);

    this.store.periods[idx].status = 'closed'; this.save();
    this.logOperation('期末结账', `期间 ${period}`, `执行期间 ${period} 结账，自动生成损益结转凭证`);
  }

  /** 损益结转：生成结转凭证 */
  private _carryForwardProfit(period: string) {
    const subjBal = this._getSubjectBalancesForPeriod(period);
    const incomeCategories = ['income', 'expense'];
    const profitLossBalances = subjBal.filter(b => {
      const subj = this.store.subjects.find(s => s.code === b.code);
      return subj && incomeCategories.includes(subj.category);
    });

    if (profitLossBalances.length === 0) return;

    const entries: any[] = [];
    let totalIncome = 0;
    let totalExpense = 0;
    let lineNo = 0;

    for (const bal of profitLossBalances) {
      const subj = this.store.subjects.find(s => s.code === bal.code);
      if (!subj || Math.abs(bal.balance) < 0.001) continue;
      const absBal = Math.abs(bal.balance);
      lineNo++;

      if (subj.category === 'income') {
        entries.push({
          summary: `结转${subj.name}`, subjectCode: subj.code, subjectName: subj.name,
          debit: absBal, credit: 0, quantity: 0, unitPrice: 0, unit: '',
          auxTypeId: null, auxValueId: null, line_no: lineNo, lineNo,
        });
        totalIncome += absBal;
      } else if (subj.category === 'expense') {
        entries.push({
          summary: `结转${subj.name}`, subjectCode: subj.code, subjectName: subj.name,
          debit: 0, credit: absBal, quantity: 0, unitPrice: 0, unit: '',
          auxTypeId: null, auxValueId: null, line_no: lineNo, lineNo,
        });
        totalExpense += absBal;
      }
    }

    if (entries.length === 0) return;

    lineNo++;
    entries.push({
      summary: `本期损益结转至本年利润`,
      subjectCode: '4103', subjectName: '本年利润',
      debit: totalExpense, credit: totalIncome,
      quantity: 0, unitPrice: 0, unit: '',
      auxTypeId: null, auxValueId: null, line_no: lineNo, lineNo,
    });

    const monthDay = new Date(parseInt(period.substring(0,4)), parseInt(period.substring(5,7)), 0).getDate();
    const dateStr = `${period}-${String(monthDay).padStart(2,'0')}`;
    const vw = this._defaultVoucherWord();
    const maxNo = this.store.vouchers.filter(v => v.voucher_word === vw && v.period === period).length;
    const voucher: FinanceVoucher = {
      id: Date.now(),
      period,
      voucher_word: vw,
      voucher_no: maxNo + 1,
      voucher_date: dateStr,
      remark: `[损益结转] ${period} 期末损益结转`,
      status: 'posted',
      maker: 'system',
      bookkeeper: '',
      created_at: new Date().toISOString(),
      entries: entries.map((e, i) => ({
        id: Date.now() + i,
        voucher_id: Date.now(),
        summary: e.summary,
        subject_code: e.subjectCode,
        subject_name: e.subjectName,
        subjectCode: e.subjectCode,
        subjectName: e.subjectName,
        debit: e.debit,
        credit: e.credit,
        quantity: e.quantity || 0,
        unitPrice: e.unitPrice || 0,
        unit: e.unit || '',
        auxTypeId: e.auxTypeId,
        auxValueId: e.auxValueId,
        line_no: e.line_no,
      })),
    };
    this.store.vouchers.unshift(voucher);
  }

  /** 内部方法：获取某一期间的科目余额 */
  private _getSubjectBalancesForPeriod(period: string): SubjectBalance[] {
    const map = new Map<string, SubjectBalance>();
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && v.period === period);
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        const code = e.subjectCode; if (!code) return;
        const subj = this.store.subjects.find(s => s.code === code);
        const name = subj?.name || e.subjectName || '';
        const cur = map.get(code) || { code, name, openingDebit: 0, openingCredit: 0, debitAmount: 0, creditAmount: 0, balance: 0 };
        cur.debitAmount += Number(e.debit || 0);
        cur.creditAmount += Number(e.credit || 0);
        map.set(code, cur);
      });
    });
    const yearStart = period.substring(0, 4) + '-01';
    const openings = this.store.openings.filter(o => o.period === yearStart);
    return Array.from(map.values()).map(r => {
      const opening = openings.find(o => o.subject_code === r.code);
      r.openingDebit = Number(opening?.debit || 0);
      r.openingCredit = Number(opening?.credit || 0);
      const dir = this.store.subjects.find(s => s.code === r.code)?.direction;
      if (dir === 'debit') r.balance = r.openingDebit - r.openingCredit + r.debitAmount - r.creditAmount;
      else r.balance = r.openingCredit - r.openingDebit + r.creditAmount - r.debitAmount;
      return r;
    });
  }

  async reopenPeriod(period: string) {
    // 1. 检查期间是否存在且已结账
    const idx = this.store.periods.findIndex(p => p.period === period);
    if (idx < 0) throw new Error(`期间 ${period} 不存在`);
    if (this.store.periods[idx].status !== 'closed') throw new Error(`期间 ${period} 尚未结账，无需反结账`);

    // 2. 反结账必须从最后一个月开始（按倒序）
    const yearNum = parseInt(period.substring(0, 4));
    for (let m = 12; m >= 1; m--) {
      const checkPeriod = yearNum + '-' + String(m).padStart(2, '0');
      const check = this.store.periods.find(p => p.period === checkPeriod);
      if (check && check.status === 'closed') {
        if (checkPeriod !== period) {
          throw new Error(`期间 ${checkPeriod} 已结账，请先反结账 ${checkPeriod}（必须从最后一个已结账期间开始倒序反结账）`);
        }
        break;
      }
    }

    // 3. 删除结转凭证
    this._reverseCarryForward(period);

    this.store.periods[idx].status = 'open'; this.save();
  }

  /** 反结转：删除损益结转凭证 */
  private _reverseCarryForward(period: string) {
    const carryVouchers = this.store.vouchers.filter(
      v => v.period === period && v.remark.includes('[损益结转]') && v.status === 'posted'
    );
    if (carryVouchers.length === 0) return;
    const ids = new Set(carryVouchers.map(v => v.id));
    this.store.vouchers = this.store.vouchers.filter(v => !ids.has(v.id));
    this.store.attachments = this.store.attachments.filter(a => !ids.has(a.voucher_id));
  }

  /* ---- Vouchers ---- */
  async listVouchers(f?: VoucherFilter): Promise<FinanceVoucher[]> {
    let list = [...this.store.vouchers];
    if (f?.period) list = list.filter(v => v.period === f.period);
    if (f?.status) list = list.filter(v => v.status === f.status);
    if (f?.voucherWord) list = list.filter(v => v.voucher_word === f.voucherWord);
    if (f?.startDate) list = list.filter(v => v.voucher_date >= f.startDate!);
    if (f?.endDate) list = list.filter(v => v.voucher_date <= f.endDate!);
    if (f?.keyword) {
      const kw = f.keyword.toLowerCase();
      list = list.filter(v => v.remark.toLowerCase().includes(kw) || v.entries.some(e => (e.summary || '').toLowerCase().includes(kw)));
    }
    if (f?.subjectCode) list = list.filter(v => v.entries.some(e => e.subjectCode === f.subjectCode));
    if (f?.amountMin !== undefined || f?.amountMax !== undefined) {
      list = list.filter(v => {
        const total = v.entries.reduce((s, e) => s + Number(e.debit || 0) + Number(e.credit || 0), 0);
        if (f.amountMin !== undefined && total < f.amountMin) return false;
        if (f.amountMax !== undefined && total > f.amountMax) return false;
        return true;
      });
    }
    list.sort((a, b) => b.voucher_date.localeCompare(a.voucher_date) || b.voucher_no - a.voucher_no);
    // 为每个凭证附加附件列表
    return list.map(v => ({
      ...v,
      attachments: this.store.attachments.filter(a => a.voucher_id === v.id),
    }));
  }
  async getVoucher(id: number) { return this.store.vouchers.find(v => v.id === id)!; }
  async createVoucher(p: VoucherPayload): Promise<FinanceVoucher & { __error?: string }> {
    // 借贷平衡校验（与 electron utils.cjs validateVoucher 保持一致）
    if (!p.entries || !Array.isArray(p.entries) || p.entries.length < 2) throw new Error('凭证至少需要两条分录');
    const totalDebit = p.entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredit = p.entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
    if (totalDebit <= 0 || totalCredit <= 0 || Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error('借贷金额必须相等且大于0');
    }
    // 同账套同期同凭证字同号不能重复
    const period = p.period || this.store.book.current_period;
    const dup = this.store.vouchers.find(v => v.voucher_word === p.voucherWord && v.voucher_no === p.voucherNo && v.period === period);
    if (dup) throw new Error(`凭证 ${p.voucherWord}-${p.voucherNo} 号在期间 ${period} 已存在`);
    const v: FinanceVoucher = {
      id: Date.now(), period,
      voucher_word: p.voucherWord, voucher_no: p.voucherNo, voucher_date: p.voucherDate,
      remark: p.remark, status: 'draft', maker: p.maker, bookkeeper: p.bookkeeper || '',
      created_at: new Date().toISOString(),
      entries: p.entries.map((e, i) => ({
        id: Date.now() + i, voucher_id: Date.now(),
        summary: e.summary, subject_code: e.subjectCode, subject_name: e.subjectName,
        subjectCode: e.subjectCode, subjectName: e.subjectName,
        debit: Number(e.debit || 0), credit: Number(e.credit || 0),
        quantity: Number(e.quantity || 0), unitPrice: Number(e.unitPrice || 0), unit: e.unit || '',
        auxTypeId: e.auxTypeId ?? null, auxValueId: e.auxValueId ?? null,
        line_no: i + 1,
      })),
    };
    this.store.vouchers.unshift(v); this.save();
    this.logOperation('创建凭证', `凭证 ${v.voucher_word}-${v.voucher_no}`, `创建凭证「${v.remark}」`);
    return v;
  }
  async updateVoucher(p: VoucherPayload): Promise<FinanceVoucher & { __error?: string }> {
    // 借贷平衡校验
    if (!p.entries || !Array.isArray(p.entries) || p.entries.length < 2) throw new Error('凭证至少需要两条分录');
    const totalDebit = p.entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
    const totalCredit = p.entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
    if (totalDebit <= 0 || totalCredit <= 0 || Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error('借贷金额必须相等且大于0');
    }
    const idx = this.store.vouchers.findIndex(v => v.id === p.id);
    if (idx < 0) return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '凭证不存在' };
    // 已过账凭证不允许修改
    if (this.store.vouchers[idx].status === 'posted') throw new Error('已过账凭证不可修改，请先反过账');
    this.store.vouchers[idx] = {
      ...this.store.vouchers[idx], voucher_date: p.voucherDate, remark: p.remark, bookkeeper: p.bookkeeper || '',
      entries: p.entries.map((e, i) => ({
        id: Date.now() + i, voucher_id: p.id!,
        summary: e.summary, subject_code: e.subjectCode, subject_name: e.subjectName,
        subjectCode: e.subjectCode, subjectName: e.subjectName,
        debit: Number(e.debit || 0), credit: Number(e.credit || 0),
        quantity: Number(e.quantity || 0), unitPrice: Number(e.unitPrice || 0), unit: e.unit || '',
        auxTypeId: e.auxTypeId ?? null, auxValueId: e.auxValueId ?? null,
        line_no: i + 1,
      })),
    };
    this.save(); return this.store.vouchers[idx];
  }
  async deleteVoucher(id: number) {
    const v = this.store.vouchers.find(x => x.id === id);
    if (!v) throw new Error('凭证不存在');
    if (v.status !== 'draft') throw new Error('仅草稿状态可删除');
    this.store.vouchers = this.store.vouchers.filter(v => v.id !== id); this.save();
    this.logOperation('删除凭证', `凭证 ${v.voucher_word}-${v.voucher_no}`, `删除凭证「${v.remark || v.voucher_word + '-' + v.voucher_no}」`);
  }

  async auditVoucher(id: number): Promise<FinanceVoucher & { __error?: string }> {
    const v = this.store.vouchers.find(x => x.id === id);
    if (!v || v.status !== 'draft') return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '仅草稿状态可审核' };
    const currentUser = this.getCachedUsername();
    const userRole = this.getCachedUserRole();
    // 审核分离：制单人不可审核自己的凭证（管理员除外，适配单人使用场景）
    if (v.maker === currentUser && userRole !== 'admin') {
      return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '制单人与审核人不能为同一人，请由其他用户审核' };
    }
    v.status = 'audited'; this.save();
    this.logOperation('审核', `凭证 ${v.voucher_word}-${v.voucher_no}`, `审核凭证 ${v.remark || v.voucher_word + '-' + v.voucher_no}`);
    return v;
  }
  async unauditVoucher(id: number): Promise<FinanceVoucher & { __error?: string }> {
    const v = this.store.vouchers.find(x => x.id === id);
    if (!v || v.status !== 'audited') return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '仅已审核状态可反审核' };
    v.status = 'draft'; this.save(); return v;
  }
  async postVoucher(id: number): Promise<FinanceVoucher & { __error?: string }> {
    const v = this.store.vouchers.find(x => x.id === id);
    if (!v || v.status !== 'audited') return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '仅已审核状态可过账' };
    v.status = 'posted'; this.save();
    this.logOperation('过账', `凭证 ${v.voucher_word}-${v.voucher_no}`, `过账凭证 ${v.remark || v.voucher_word + '-' + v.voucher_no}`);
    return v;
  }
  async unpostVoucher(id: number): Promise<FinanceVoucher & { __error?: string }> {
    const v = this.store.vouchers.find(x => x.id === id);
    if (!v || v.status !== 'posted') return { id: 0, period: '', voucher_word: '', voucher_no: 0, voucher_date: '', remark: '', status: 'draft', maker: '', entries: [], __error: '仅已过账状态可反过账' };
    v.status = 'audited'; this.save(); return v;
  }
  async reorderVoucherNos(p: { voucherWord: string; period: string }) {
    const list = this.store.vouchers.filter(v => v.voucher_word === p.voucherWord).sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no - b.voucher_no);
    list.forEach((v, i) => { v.voucher_no = i + 1; });
    this.save();
  }
  async reorderAllVoucherNos(period: string): Promise<Array<{ word: string; count: number }>> {
    const wordRows = this._voucherWords();
    const words = wordRows.length > 0 ? wordRows.map(w => w.word) : ['记'];
    const results = [];
    for (const word of words) {
      const list = this.store.vouchers.filter(v => v.voucher_word === word && v.period === period).sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no - b.voucher_no);
      if (list.length > 0) {
        list.forEach((v, i) => { v.voucher_no = i + 1; });
        results.push({ word, count: list.length });
      }
    }
    this.save();
    return results;
  }
  async renumberSubjects(): Promise<any> {
    const all = this.store.subjects;
    // 1级科目：内置科目编码不变
    let seq = 1;
    for (const s of all.filter(s => s.level === 1)) {
      if (s.builtin === 1) continue; // 内置科目不变
      while (all.some(x => x.code === String(seq))) seq++;
      s.code = String(seq);
      seq++;
    }
    // 2级科目：父编码 + 2位序号
    const level2 = all.filter(s => s.level === 2);
    const parentGroups: Record<string, FinanceSubject[]> = {};
    for (const s of level2) {
      const p = s.parent_code || '';
      if (!parentGroups[p]) parentGroups[p] = [];
      parentGroups[p].push(s);
    }
    for (const [pCode, children] of Object.entries(parentGroups)) {
      children.forEach((s, j) => {
        const childSeq = String(j + 1).padStart(2, '0');
        s.code = `${pCode}${childSeq}`;
        s.parent_code = pCode;
      });
    }
    // 同步凭证分录编码（按原始编码匹配，不是名称）
    this.store.vouchers.forEach(v => {
      v.entries.forEach(e => {
        const oldCode = e.subjectCode || e.subject_code;
        const subj = all.find(s => s.code === oldCode);
        if (subj) { e.subjectCode = subj.code; e.subject_code = subj.code; }
      });
    });
    this.save();
    return { mapping: {} };
  }
  async getNextVoucherNo(p: { voucherWord: string; period: string }) {
    const list = this.store.vouchers.filter(v => v.voucher_word === p.voucherWord);
    return (list.length > 0 ? Math.max(...list.map(v => v.voucher_no)) : 0) + 1;
  }

  /* ---- 附件 ---- */
  async listAttachments(voucherId: number) {
    return this.store.attachments.filter(a => a.voucher_id === voucherId);
  }
  async uploadAttachment(voucherId: number, file: { name: string; size: number; dataUrl: string }) {
    const att = {
      id: Date.now(),
      voucher_id: voucherId,
      file_name: file.name,
      file_size: file.size,
      file_path: file.dataUrl,
      mime_type: file.dataUrl.match(/^data:(.+);base64/)?.at(1) || 'application/octet-stream',
      created_at: new Date().toISOString(),
    };
    this.store.attachments.push(att);
    this.save();
    return att;
  }
  async deleteAttachment(attachmentId: number) {
    this.store.attachments = this.store.attachments.filter(a => a.id !== attachmentId);
    this.save();
  }
  async getAttachmentPath(attachmentId: number) {
    const att = this.store.attachments.find(a => a.id === attachmentId);
    return att?.file_path || '';
  }
  async readAttachmentFile(attachmentId: number) {
    const att = this.store.attachments.find(a => a.id === attachmentId);
    if (!att) return null;
    return { mime_type: att.mime_type, data_url: att.file_path };  // mock 中 file_path 就是 dataUrl
  }

  /* ---- Aux Project Types ---- */
  async listAuxProjectTypes() { return this.store.auxProjectTypes; }
  async createAuxProjectType(p: AuxProjectPayload): Promise<AuxProjectType> {
    const exists = this.store.auxProjectTypes.find(t => t.code === p.code);
    if (exists) throw new Error('辅助核算类别编码已存在');
    const t: AuxProjectType = { id: Date.now(), book_id: 1, code: p.code, name: p.name, created_at: new Date().toISOString() };
    this.store.auxProjectTypes.push(t);
    this.save();
    return t;
  }
  async updateAuxProjectType(p: { id: number; code: string; name: string }): Promise<AuxProjectType> {
    const idx = this.store.auxProjectTypes.findIndex(t => t.id === p.id);
    if (idx < 0) throw new Error('类别不存在');
    this.store.auxProjectTypes[idx] = { ...this.store.auxProjectTypes[idx], code: p.code, name: p.name };
    this.save();
    return this.store.auxProjectTypes[idx];
  }
  async deleteAuxProjectType(id: number): Promise<void> {
    const values = this.store.auxProjectValues.filter(v => v.type_id === id);
    if (values.length > 0) throw new Error(`该类别下有 ${values.length} 个项目值，请先删除项目值`);
    this.store.auxProjectTypes = this.store.auxProjectTypes.filter(t => t.id !== id);
    this.save();
  }

  /* ---- Aux Project Values ---- */
  async listAuxProjectValues(typeId: number) {
    return this.store.auxProjectValues.filter(v => v.type_id === typeId);
  }
  async createAuxProjectValue(p: { typeId: number; code: string; name: string }): Promise<AuxProjectValue> {
    const exists = this.store.auxProjectValues.find(v => v.type_id === p.typeId && v.code === p.code);
    if (exists) throw new Error('辅助核算项目编码已存在');
    const v: AuxProjectValue = { id: Date.now(), type_id: p.typeId, book_id: 1, code: p.code, name: p.name, enabled: 1, created_at: new Date().toISOString() };
    this.store.auxProjectValues.push(v);
    this.save();
    return v;
  }
  async updateAuxProjectValue(p: { id: number; code: string; name: string; enabled?: number }): Promise<AuxProjectValue> {
    const idx = this.store.auxProjectValues.findIndex(v => v.id === p.id);
    if (idx < 0) throw new Error('项目不存在');
    this.store.auxProjectValues[idx] = { ...this.store.auxProjectValues[idx], code: p.code, name: p.name };
    if (p.enabled !== undefined) this.store.auxProjectValues[idx].enabled = p.enabled;
    this.save();
    return this.store.auxProjectValues[idx];
  }
  async deleteAuxProjectValue(id: number): Promise<void> {
    this.store.auxProjectValues = this.store.auxProjectValues.filter(v => v.id !== id);
    this.save();
  }

  /* ---- Quantity/Amount Ledger ---- */
  async getQuantityDetailLedger(f?: { subjectCode?: string; period?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }): Promise<{ rows: QuantityDetailLedgerRow[]; total: number }> {
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    const rows: QuantityDetailLedgerRow[] = [];
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (f?.subjectCode && e.subjectCode !== f.subjectCode) return;
        if (f?.startDate && v.voucher_date < f.startDate) return;
        if (f?.endDate && v.voucher_date > f.endDate) return;
        rows.push({
          voucher_date: v.voucher_date, voucher_word: v.voucher_word, voucher_no: v.voucher_no,
          voucher_remark: v.remark, summary: e.summary,
          subject_code: e.subjectCode, subject_name: e.subjectName,
          debit: Number(e.debit || 0), credit: Number(e.credit || 0),
          quantity: Number(e.quantity || 0), unit_price: Number(e.unitPrice || 0), unit: e.unit || '',
        });
      });
    });
    rows.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no - b.voucher_no);
    return { rows, total: rows.length };
  }

  async getQuantityGeneralLedger(f?: { subjectCode?: string; period?: string }): Promise<{ rows: QuantityGeneralLedgerRow[]; total: number }> {
    const map = new Map<string, QuantityGeneralLedgerRow>();
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (f?.subjectCode && e.subjectCode !== f.subjectCode) return;
        const key = e.subjectCode;
        const cur = map.get(key) || { code: e.subjectCode, name: e.subjectName, total_debit: 0, total_credit: 0, in_quantity: 0, out_quantity: 0, net_quantity: 0, unit: e.unit || '' };
        cur.total_debit += Number(e.debit || 0);
        cur.total_credit += Number(e.credit || 0);
        if (e.debit > 0) cur.in_quantity += Number(e.quantity || 0);
        if (e.credit > 0) cur.out_quantity += Number(e.quantity || 0);
        cur.net_quantity = cur.in_quantity - cur.out_quantity;
        map.set(key, cur);
      });
    });
    return { rows: Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)), total: map.size };
  }

  /* ---- Aux Project Reports ---- */
  async getAuxProjectBalance(f?: { auxTypeId?: number; auxValueId?: number; period?: string }): Promise<AuxProjectBalanceRow[]> {
    const rows: AuxProjectBalanceRow[] = [];
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (f?.auxTypeId && e.auxTypeId !== f.auxTypeId) return;
        if (f?.auxValueId && e.auxValueId !== f.auxValueId) return;
        rows.push({
          aux_type_id: e.auxTypeId || 0, aux_value_id: e.auxValueId || 0,
          subject_code: e.subjectCode, subject_name: e.subjectName,
          debit_amount: Number(e.debit || 0), credit_amount: Number(e.credit || 0),
        });
      });
    });
    return rows;
  }

  async getAuxProjectDetail(f?: { auxTypeId?: number; auxValueId?: number; period?: string }): Promise<{ rows: AuxProjectDetailRow[]; total: number }> {
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    const rows: AuxProjectDetailRow[] = [];
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (f?.auxTypeId && e.auxTypeId !== f.auxTypeId) return;
        if (f?.auxValueId && e.auxValueId !== f.auxValueId) return;
        rows.push({
          voucher_date: v.voucher_date, voucher_word: v.voucher_word, voucher_no: v.voucher_no,
          voucher_remark: v.remark, summary: e.summary,
          subject_code: e.subjectCode, subject_name: e.subjectName,
          debit: Number(e.debit || 0), credit: Number(e.credit || 0),
          aux_type_id: e.auxTypeId || 0, aux_value_id: e.auxValueId || 0,
        });
      });
    });
    return { rows, total: rows.length };
  }

  /* ---- Multi-Column Ledger ---- */
  async listMultiColumnSchemes(): Promise<MultiColumnScheme[]> {
    return this.store.multiColumnSchemes;
  }

  async createMultiColumnScheme(p: MultiColumnSchemePayload): Promise<MultiColumnScheme> {
    if (!p.name || !p.parentCode) throw new Error('方案名称和上级科目不能为空');
    const maxId = this.store.multiColumnSchemes.reduce((max, s) => Math.max(max, s.id), 0);
    const now = new Date().toISOString();
    const scheme: MultiColumnScheme = {
      id: maxId + 1,
      book_id: 1,
      name: p.name,
      parent_code: p.parentCode,
      parent_name: p.parentName,
      direction: p.direction || 'debit',
      children_json: p.childrenJson || '[]',
      created_at: now,
      updated_at: now,
    };
    this.store.multiColumnSchemes.push(scheme);
    this.save();
    return scheme;
  }

  async updateMultiColumnScheme(p: { id: number; name: string; parentCode: string; parentName: string; direction?: string; childrenJson?: string }): Promise<MultiColumnScheme> {
    const scheme = this.store.multiColumnSchemes.find(s => s.id === p.id);
    if (!scheme) throw new Error('方案不存在');
    scheme.name = p.name;
    scheme.parent_code = p.parentCode;
    scheme.parent_name = p.parentName;
    if (p.direction) scheme.direction = p.direction;
    if (p.childrenJson) scheme.children_json = p.childrenJson;
    scheme.updated_at = new Date().toISOString();
    this.save();
    return scheme;
  }

  async deleteMultiColumnScheme(id: number): Promise<void> {
    const idx = this.store.multiColumnSchemes.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('方案不存在');
    this.store.multiColumnSchemes.splice(idx, 1);
    this.save();
  }

  async getMultiColumnLedger(f?: { parentCode?: string; period?: string; startDate?: string; endDate?: string; childrenJson?: string }): Promise<MultiColumnLedgerResult> {
    let children: { code: string; name: string }[] = [];
    try { children = JSON.parse(f?.childrenJson || '[]'); } catch (e) { console.warn('[MockApi] 解析多栏账子科目JSON失败:', e); }
    if (children.length === 0) return { columns: [], rows: [], periodSummary: [] };

    const columns = children.map(c => ({ code: c.code, name: c.name }));
    const vouchers = this.store.vouchers.filter(v =>
      v.status === 'posted' &&
      (!f?.period || v.period === f.period) &&
      (!f?.startDate || v.voucher_date >= f.startDate) &&
      (!f?.endDate || v.voucher_date <= f.endDate) &&
      v.entries.some(e => f?.parentCode && e.subjectCode.startsWith(f.parentCode))
    );

    const rows: MultiColumnLedgerRow[] = [];
    vouchers.forEach(v => {
      const matchingEntries = v.entries.filter(e =>
        (!f?.parentCode || e.subjectCode.startsWith(f.parentCode)) &&
        children.some(c => c.code === e.subjectCode)
      );
      // Group by summary within same voucher
      const summaryMap = new Map<string, typeof matchingEntries>();
      matchingEntries.forEach(e => {
        const key = e.summary || '';
        if (!summaryMap.has(key)) summaryMap.set(key, []);
        summaryMap.get(key)!.push(e);
      });
      summaryMap.forEach((entries, summary) => {
        const cells = children.map(c => {
          const cell = entries.filter(e => e.subjectCode === c.code).reduce(
            (acc, e) => ({ debit: acc.debit + Number(e.debit || 0), credit: acc.credit + Number(e.credit || 0) }),
            { debit: 0, credit: 0 }
          );
          return { ...cell, balance: cell.debit - cell.credit };
        });
        rows.push({
          voucher_date: v.voucher_date, voucher_word: v.voucher_word,
          voucher_no: v.voucher_no, period: v.period, summary,
          cells,
        });
      });
    });

    rows.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no - b.voucher_no);

    // Period summary
    const periodSumMap = new Map<string, MultiColumnLedgerSummary>();
    rows.forEach(r => {
      if (!periodSumMap.has(r.period)) {
        periodSumMap.set(r.period, {
          period: r.period,
          cells: columns.map(() => ({ debit: 0, credit: 0, balance: 0 })),
        });
      }
      const ps = periodSumMap.get(r.period)!;
      r.cells.forEach((c, i) => {
        ps.cells[i].debit += c.debit;
        ps.cells[i].credit += c.credit;
        ps.cells[i].balance = ps.cells[i].debit - ps.cells[i].credit;
      });
    });

    return { columns, rows, periodSummary: Array.from(periodSumMap.values()) };
  }

  /* ---- Reports ---- */
  async getSubjectBalance(f?: { period?: string; subjectCode?: string; category?: string }): Promise<SubjectBalance[]> {
    const map = new Map<string, SubjectBalance>();
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        const code = e.subjectCode; if (!code) return;
        if (f?.subjectCode && code !== f.subjectCode) return;
        if (f?.category) {
          const subj = this.store.subjects.find(s => s.code === code);
          if (!subj || subj.category !== f.category) return;
        }
        const subj = this.store.subjects.find(s => s.code === code);
        const name = subj?.name || e.subjectName || '';
        const cur = map.get(code) || { code, name, openingDebit: 0, openingCredit: 0, debitAmount: 0, creditAmount: 0, balance: 0 };
        cur.debitAmount += Number(e.debit || 0);
        cur.creditAmount += Number(e.credit || 0);
        map.set(code, cur);
      });
    });

    // 查找年初期初余额（始终使用该年度的 1 月）
    const yearStart = f?.period ? (f.period.substring(0, 4) + '-01') : null;
    let openings: OpeningBalance[] = [];
    if (yearStart) {
      openings = this.store.openings.filter(o => o.period === yearStart);
    }

    return Array.from(map.values()).map(r => {
      const opening = openings.find(o => o.subject_code === r.code);
      r.openingDebit = Number(opening?.debit || 0);
      r.openingCredit = Number(opening?.credit || 0);
      const dir = this.store.subjects.find(s => s.code === r.code)?.direction;
      if (dir === 'debit') {
        r.balance = r.openingDebit - r.openingCredit + r.debitAmount - r.creditAmount;
      } else {
        r.balance = r.openingCredit - r.openingDebit + r.creditAmount - r.debitAmount;
      }
      return r;
    }).sort((a, b) => a.code.localeCompare(b.code));
  }

  async getDetailLedger(f?: { subjectCode?: string; period?: string; startDate?: string; endDate?: string; page?: number; pageSize?: number }): Promise<DetailLedgerResult> {
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    const rows: DetailLedgerRow[] = [];
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        if (f?.subjectCode && e.subjectCode !== f.subjectCode) return;
        if (f?.startDate && v.voucher_date < f.startDate) return;
        if (f?.endDate && v.voucher_date > f.endDate) return;
        rows.push({ voucher_date: v.voucher_date, voucher_word: v.voucher_word, voucher_no: v.voucher_no, voucher_remark: v.remark, summary: e.summary, subject_code: e.subjectCode, subject_name: e.subjectName, debit: Number(e.debit || 0), credit: Number(e.credit || 0), quantity: Number(e.quantity || 0), unit_price: Number(e.unitPrice || 0), unit: e.unit || '' });
      });
    });
    rows.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date) || a.voucher_no - b.voucher_no);

    const total = rows.length;
    const page = f?.page || 1;
    const pageSize = f?.pageSize || 50;
    const offset = (page - 1) * pageSize;

    // 计算承前页余额（含期初余额）
    let carryForward = 0;
    if (f?.subjectCode) {
      const subj = this.store.subjects.find(s => s.code === f.subjectCode);
      const isDebit = subj?.direction === 'debit';
      // 期初余额
      const yrStart = (f?.period || '2026-01').substring(0, 4) + '-01';
      const opening = this.store.openings.find(o => o.period === yrStart && o.subject_code === f.subjectCode);
      if (opening) {
        carryForward = isDebit
          ? Number(opening.debit || 0) - Number(opening.credit || 0)
          : Number(opening.credit || 0) - Number(opening.debit || 0);
      }
      // 前页凭证发生额
      if (offset > 0) {
        const prevRows = rows.slice(0, offset);
        for (const r of prevRows) {
          if (isDebit) carryForward += Number(r.debit || 0) - Number(r.credit || 0);
          else carryForward += Number(r.credit || 0) - Number(r.debit || 0);
        }
      }
    }

    // 计算过次页余额
    const currentPageRows = rows.slice(offset, offset + pageSize);
    let carriedForward = carryForward;
    if (f?.subjectCode) {
      const subj = this.store.subjects.find(s => s.code === f.subjectCode);
      const isDebit = subj?.direction === 'debit';
      for (const r of currentPageRows) {
        if (isDebit) carriedForward += Number(r.debit || 0) - Number(r.credit || 0);
        else carriedForward += Number(r.credit || 0) - Number(r.debit || 0);
      }
    }

    return { rows: currentPageRows, total, carryForward, carriedForward };
  }

  async getGeneralLedger(f?: { subjectCode?: string; period?: string }): Promise<{ rows: GeneralLedgerRow[]; total: number }> {
    const map = new Map<string, GeneralLedgerRow>();
    const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && (!f?.period || v.period === f.period));
    vouchers.forEach(v => {
      v.entries.forEach(e => {
        const code = e.subjectCode; if (!code) return;
        if (f?.subjectCode && code !== f.subjectCode) return;
        const cur = map.get(code) || { code, name: e.subjectName || '', total_debit: 0, total_credit: 0 };
        cur.total_debit += Number(e.debit || 0); cur.total_credit += Number(e.credit || 0);
        map.set(code, cur);
      });
    });
    return { rows: Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code)), total: map.size };
  }

  async getTrialBalance(period: string): Promise<TrialBalance> {
    const balances = await this.getSubjectBalance({ period });
    let od = 0, oc = 0, ad = 0, ac = 0, ed = 0, ec = 0;
    const rows = balances.map(r => {
      od += r.openingDebit; oc += r.openingCredit; ad += r.debitAmount; ac += r.creditAmount;
      const eDebit = r.balance >= 0 ? r.balance : 0, eCredit = r.balance < 0 ? -r.balance : 0;
      ed += eDebit; ec += eCredit;
      return { ...r, endingDebit: eDebit, endingCredit: eCredit };
    });
    return { rows, totals: { openingDebit: od, openingCredit: oc, amountDebit: ad, amountCredit: ac, endingDebit: ed, endingCredit: ec } };
  }

  /* ---- 报表模板（利润表/资产负债表） ---- */

  async getProfitStatement(period: string): Promise<ProfitStatement> {
    const bm = new Map<string, SubjectBalance>();
    const yearNum = parseInt(period.substring(0, 4));
    const monthNum = parseInt(period.substring(5, 7));

    // 本年累计：按月累加发生额
    for (let m = 1; m <= monthNum; m++) {
      const mp = yearNum + '-' + String(m).padStart(2, '0');
      const monthBalances = await this.getSubjectBalance({ period: mp });
      monthBalances.forEach(b => {
        const prev = bm.get(b.code);
        if (!prev) {
          bm.set(b.code, { ...b });
        } else {
          prev.debitAmount += b.debitAmount;
          prev.creditAmount += b.creditAmount;
        }
      });
    }
    // 按科目方向重新计算累计余额
    for (const [, item] of bm) {
      const dir = this.store.subjects.find(s => s.code === item.code)?.direction;
      if (dir === 'debit') {
        item.balance = item.openingDebit - item.openingCredit + item.debitAmount - item.creditAmount;
      } else {
        item.balance = item.openingCredit - item.openingDebit + item.creditAmount - item.debitAmount;
      }
    }

    // 本月金额
    const monthlyBalances = await this.getSubjectBalance({ period });
    const mm = new Map<string, SubjectBalance>();
    monthlyBalances.forEach(b => mm.set(b.code, b));

    // 年初余额
    const yrStart = period.substring(0, 4) + '-01';
    const opMap = new Map<string, { debit: number; credit: number }>();
    try {
      const openings = await this.getOpeningBalances(yrStart);
      openings.forEach(o => opMap.set(o.subject_code, { debit: o.debit, credit: o.credit }));
    } catch (e) { console.warn('[MockApi] 获取利润表期初余额失败:', e); }

    // 使用共享公式填充
    const profitTemplates = getTemplatesByType('profit');
    const rows = fillTemplateAmount(profitTemplates, bm, opMap, mm);
    return { company_name: '', period, rows: rows as ProfitStatementRow[] };
  }

  async getBalanceSheet(period: string): Promise<BalanceSheet> {
    const yearStart = period.substring(0, 4) + '-01';
    const bm = new Map<string, SubjectBalance>();

    // 年初至今累计：逐月累加所有期间的凭证数据
    const yearNum = parseInt(period.substring(0, 4));
    const monthNum = parseInt(period.substring(5, 7));
    for (let m = 1; m <= monthNum; m++) {
      const mp = yearNum + '-' + String(m).padStart(2, '0');
      const monthBalances = await this.getSubjectBalance({ period: mp });
      monthBalances.forEach(b => {
        const prev = bm.get(b.code);
        if (!prev) {
          bm.set(b.code, { ...b });
        } else {
          prev.debitAmount += b.debitAmount;
          prev.creditAmount += b.creditAmount;
          // 余额逐月末重算（不逐月累加，由最后一期决定）
        }
      });
    }
    // 按科目方向重新计算余额
    for (const [, item] of bm) {
      const dir = this.store.subjects.find(s => s.code === item.code)?.direction;
      if (dir === 'debit') {
        item.balance = item.openingDebit - item.openingCredit + item.debitAmount - item.creditAmount;
      } else {
        item.balance = item.openingCredit - item.openingDebit + item.creditAmount - item.debitAmount;
      }
    }

    const opMap = new Map<string, { debit: number; credit: number }>();
    try {
      const openings = await this.getOpeningBalances(yearStart);
      openings.forEach(o => opMap.set(o.subject_code, { debit: o.debit, credit: o.credit }));
    } catch (e) { console.warn('[MockApi] 获取资产负债表期初余额失败:', e); }

    // 获取净利润（跨报表引用）
    const netProfit = (await this.getProfitStatement(period)).rows.find(r => r.row_no === 32)?.amount || 0;

    // 使用共享公式填充
    const balanceTemplates = getTemplatesByType('balance');
    const allRows = fillTemplateAmount(balanceTemplates, bm, opMap, null, { netProfitAmount: netProfit });

    return {
      company_name: '', period,
      asset_rows: allRows.filter((r: { section: string }) => r.section === 'asset') as BalanceSheetRow[],
      liability_rows: allRows.filter((r: { section: string }) => r.section === 'liability') as BalanceSheetRow[],
      equity_rows: allRows.filter((r: { section: string }) => r.section === 'equity') as BalanceSheetRow[],
    };
  }

  /* ---- 现金流量表（直接法） ---- */
  async getCashFlowStatement(period: string): Promise<CashFlowStatement> {
    const yearNum = parseInt(period.substring(0, 4));
    const monthNum = parseInt(period.substring(5, 7));

    // 获取现金科目
    const cashCodes = this.store.subjects
      .filter(s => s.isCash === 1 && s.enabled === 1)
      .map(s => s.code);

    let operatingInflow = 0, operatingOutflow = 0;
    let investingInflow = 0, investingOutflow = 0;
    let financingInflow = 0, financingOutflow = 0;

    // 查询本年度1月至当前月的所有现金凭证分录
    for (let m = 1; m <= monthNum; m++) {
      const mp = yearNum + '-' + String(m).padStart(2, '0');
      const vouchers = this.store.vouchers.filter(v => v.status === 'posted' && v.period === mp);
      vouchers.forEach(v => {
        const cashEntries = v.entries.filter(e => cashCodes.includes(e.subjectCode));
        cashEntries.forEach(cashEntry => {
          const cashFlow = Number(cashEntry.debit || 0) - Number(cashEntry.credit || 0);
          const isInflow = Number(cashEntry.debit || 0) > 0;
          const absFlow = Math.abs(cashFlow);

          // 根据对方科目类别判断现金流量类别
          const counterpartEntries = v.entries.filter(e => e.subjectCode !== cashEntry.subjectCode && !cashCodes.includes(e.subjectCode));
          let category: string = 'operating';
          for (const ce of counterpartEntries) {
            const subj = this.store.subjects.find(s => s.code === ce.subjectCode);
            const result = classifyCashFlowCategory(ce.subjectCode, subj);
            if (result !== 'operating') category = result;
          }

          if (category === 'investing') {
            if (isInflow) investingInflow += absFlow; else investingOutflow += absFlow;
          } else if (category === 'financing') {
            if (isInflow) financingInflow += absFlow; else financingOutflow += absFlow;
          } else {
            if (isInflow) operatingInflow += absFlow; else operatingOutflow += absFlow;
          }
        });
      });
    }

    const opNet = operatingInflow - operatingOutflow;
    const invNet = investingInflow - investingOutflow;
    const finNet = financingInflow - financingOutflow;
    const totalNet = opNet + invNet + finNet;

    return {
      company_name: '', period,
      rows: [
        // === 经营活动 ===
        { row_no: 1, name: '一、经营活动产生的现金流量：', is_header: true, bold: true, indent_level: 0, section: 'operating', amount: 0 },
        { row_no: 2, name: '销售商品、提供劳务收到的现金', bold: false, indent_level: 0, section: 'operating', amount: operatingInflow, is_header: false, is_total: false },
        { row_no: 3, name: '收到其他与经营活动有关的现金', bold: false, indent_level: 0, section: 'operating', amount: 0, is_header: false, is_total: false },
        { row_no: 5, name: '经营活动现金流入小计', is_total: true, bold: true, indent_level: 0, section: 'operating', amount: operatingInflow, is_header: false },
        { row_no: 6, name: '购买商品、接受劳务支付的现金', bold: false, indent_level: 0, section: 'operating', amount: operatingOutflow, is_header: false, is_total: false },
        { row_no: 7, name: '支付给职工以及为职工支付的现金', bold: false, indent_level: 0, section: 'operating', amount: 0, is_header: false, is_total: false },
        { row_no: 8, name: '支付的各项税费', bold: false, indent_level: 0, section: 'operating', amount: 0, is_header: false, is_total: false },
        { row_no: 9, name: '支付其他与经营活动有关的现金', bold: false, indent_level: 0, section: 'operating', amount: 0, is_header: false, is_total: false },
        { row_no: 10, name: '经营活动现金流出小计', is_total: true, bold: true, indent_level: 0, section: 'operating', amount: operatingOutflow, is_header: false },
        { row_no: 11, name: '经营活动产生的现金流量净额', is_total: true, bold: true, indent_level: 0, section: 'operating', amount: opNet, is_header: false },
        // === 投资活动 ===
        { row_no: 13, name: '二、投资活动产生的现金流量：', is_header: true, bold: true, indent_level: 0, section: 'investing', amount: 0, is_total: false },
        { row_no: 14, name: '收回短期投资、长期债券投资和长期股权投资收到的现金', bold: false, indent_level: 0, section: 'investing', amount: 0, is_header: false, is_total: false },
        { row_no: 15, name: '取得投资收益收到的现金', bold: false, indent_level: 0, section: 'investing', amount: 0, is_header: false, is_total: false },
        { row_no: 16, name: '投资活动现金流入小计', is_total: true, bold: true, indent_level: 0, section: 'investing', amount: investingInflow, is_header: false },
        { row_no: 18, name: '购建固定资产、无形资产和其他非流动资产支付的现金', bold: false, indent_level: 0, section: 'investing', amount: investingOutflow, is_header: false, is_total: false },
        { row_no: 20, name: '投资活动现金流出小计', is_total: true, bold: true, indent_level: 0, section: 'investing', amount: investingOutflow, is_header: false },
        { row_no: 21, name: '投资活动产生的现金流量净额', is_total: true, bold: true, indent_level: 0, section: 'investing', amount: invNet, is_header: false },
        // === 筹资活动 ===
        { row_no: 23, name: '三、筹资活动产生的现金流量：', is_header: true, bold: true, indent_level: 0, section: 'financing', amount: 0, is_total: false },
        { row_no: 24, name: '取得借款收到的现金', bold: false, indent_level: 0, section: 'financing', amount: financingInflow, is_header: false, is_total: false },
        { row_no: 25, name: '吸收投资者投资收到的现金', bold: false, indent_level: 0, section: 'financing', amount: 0, is_header: false, is_total: false },
        { row_no: 26, name: '筹资活动现金流入小计', is_total: true, bold: true, indent_level: 0, section: 'financing', amount: financingInflow, is_header: false },
        { row_no: 28, name: '偿还借款本金支付的现金', bold: false, indent_level: 0, section: 'financing', amount: financingOutflow, is_header: false, is_total: false },
        { row_no: 29, name: '分配利润支付的现金', bold: false, indent_level: 0, section: 'financing', amount: 0, is_header: false, is_total: false },
        { row_no: 30, name: '筹资活动现金流出小计', is_total: true, bold: true, indent_level: 0, section: 'financing', amount: financingOutflow, is_header: false },
        { row_no: 31, name: '筹资活动产生的现金流量净额', is_total: true, bold: true, indent_level: 0, section: 'financing', amount: finNet, is_header: false },
        // === 汇总 ===
        { row_no: 33, name: '四、现金及现金等价物净增加额', is_total: true, bold: true, indent_level: 0, section: 'summary', amount: totalNet, is_header: false },
      ],
    };
  }

  /* ---- 跨年度数据完整性检查 ---- */
  async checkYearEndIntegrity(currentPeriod?: string): Promise<YearEndIntegrityCheck> {
    const period = currentPeriod || '2026-12';
    const yearNum = parseInt(period.substring(0, 4));
    const yearEnd = yearNum + '-12';
    const nextYearStart = String(yearNum + 1) + '-01';

    // 计算年末余额（含年初 + 全年累计）
    const endBalances = new Map<string, number>();
    for (let m = 1; m <= 12; m++) {
      const mp = yearNum + '-' + String(m).padStart(2, '0');
      const bal = await this.getSubjectBalance({ period: mp });
      bal.forEach(b => {
        const prev = endBalances.get(b.code) || 0;
        endBalances.set(b.code, prev + b.balance);
      });
    }

    // 获取下年年初余额
    const nextOpenings = this.store.openings.filter(o => o.period === nextYearStart);
    const details: YearEndIntegrityCheck['details'] = [];
    let matched = 0, mismatched = 0;

    for (const op of nextOpenings) {
      const endBal = endBalances.get(op.subject_code) || 0;
      const opBal = Number(op.debit) - Number(op.credit);
      const diff = Math.abs(endBal - opBal);
      if (diff < 0.01) matched++;
      else {
        mismatched++;
        details.push({
          code: op.subject_code, name: op.subject_name,
          yearEndBalance: Math.round(endBal * 100) / 100,
          nextYearOpening: Math.round(opBal * 100) / 100,
          diff: Math.round(diff * 100) / 100,
        });
      }
    }

    return { yearEnd, nextYearOpen: nextYearStart, matched, mismatched, details };
  }

  /* ---- 凭证字管理 ---- */
  private _voucherWords(): any[] {
    return this.store.voucherWords || [];
  }
  private _defaultVoucherWord(): string {
    const words = this._voucherWords();
    const def = words.find((w: any) => w.is_default === 1);
    return def?.word || '记';
  }

  async listVoucherWords(): Promise<VoucherWordType[]> {
    let words = this._voucherWords();
    if (words.length === 0) {
      // 首次启动自动创建默认凭证字 记、收、付、转
      this.store.voucherWords = [
        { id: 1, book_id: 1, word: '记', print_title: '记账凭证', is_default: 1, created_at: new Date().toISOString() },
        { id: 2, book_id: 1, word: '收', print_title: '收款凭证', is_default: 0, created_at: new Date().toISOString() },
        { id: 3, book_id: 1, word: '付', print_title: '付款凭证', is_default: 0, created_at: new Date().toISOString() },
        { id: 4, book_id: 1, word: '转', print_title: '转账凭证', is_default: 0, created_at: new Date().toISOString() },
      ];
      words = this._voucherWords();
    }
    return [...words].sort((a, b) => b.is_default - a.is_default || a.id - b.id);
  }

  async createVoucherWord(payload: VoucherWordPayload): Promise<VoucherWordType> {
    const words = this._voucherWords();
    if (words.some(w => w.word === payload.word)) {
      throw new Error(`凭证字"${payload.word}"已存在`);
    }
    const id = Math.max(0, ...words.map(w => w.id)) + 1;
    const item: VoucherWordType = {
      id, book_id: 1, word: payload.word,
      print_title: payload.printTitle || '',
      is_default: payload.isDefault ? 1 : 0,
      created_at: new Date().toISOString(),
    };
    if (payload.isDefault) {
      words.forEach(w => { w.is_default = 0; });
    }
    words.push(item);
    this.store.voucherWords = words;
    return { ...item };
  }

  async updateVoucherWord(id: number, payload: Partial<VoucherWordPayload>): Promise<VoucherWordType> {
    const words = this._voucherWords();
    const idx = words.findIndex(w => w.id === id);
    if (idx < 0) throw new Error('凭证字不存在');
    const target = words[idx];
    if (payload.word !== undefined) target.word = payload.word;
    if (payload.printTitle !== undefined) target.print_title = payload.printTitle;
    if (payload.isDefault === 1) {
      words.forEach(w => { w.is_default = 0; });
      target.is_default = 1;
    } else if (payload.isDefault === 0) {
      target.is_default = 0;
    }
    this.store.voucherWords = words;
    return { ...target };
  }

  async deleteVoucherWord(id: number): Promise<void> {
    const words = this._voucherWords();
    const match = words.find(w => w.id === id);
    if (!match) throw new Error('凭证字不存在');
    const vouchers = this.store.vouchers || [];
    const usageCount = vouchers.filter((v: any) => v.voucher_word === match.word).length;
    if (usageCount > 0) {
      throw new Error(`凭证字"${match.word}"已被 ${usageCount} 张凭证使用，无法删除`);
    }
    this.store.voucherWords = words.filter(w => w.id !== id);
  }

  /* ---- 数据管理 ---- */

  async getDatabaseInfo() {
    const store = this.store;
    const tableCounts: Record<string, number> = {
      bd_subject: store.subjects?.length || 0,
      gl_voucher: store.vouchers?.length || 0,
      acct_period: store.periods?.length || 0,
      voucher_words: store.voucherWords?.length || 0,
      gl_opening_balance: store.openings?.length || 0,
      aux_project_type: store.auxProjectTypes?.length || 0,
      aux_project_value: store.auxProjectValues?.length || 0,
      op_logs: store.opLogs?.length || 0,
      voucher_templates: store.voucherTemplates?.length || 0,
      voucher_summaries: store.voucherSummaries?.length || 0,
    };
    return { dbPath: 'localStorage (浏览器模式)', dbSize: 0, pageCount: 0, freelistCount: 0, tableCounts, isMock: true };
  }

  async vacuumDatabase() {
    // 浏览器模式下无需整理
    return { success: true, beforeSize: 0, afterSize: 0 };
  }

  async backupDatabase() {
    // 浏览器模式下导出 JSON 作为备份
    const data = JSON.stringify(this.store, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    a.download = `ERP数据备份_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true };
  }

  async exportAllData() {
    return JSON.parse(JSON.stringify(this.store));
  }

  async exportDataJson() {
    const data = JSON.stringify(this.store, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}${String(now.getSeconds()).padStart(2,'0')}`;
    a.download = `ERP数据导出_${ts}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return { success: true };
  }

  /* ---- 批量操作 ---- */
  async batchAuditVouchers(ids: number[]): Promise<{ success: number; failed: number }> {
    let success = 0, failed = 0;
    const currentUser = this.getCachedUsername();
    const userRole = this.getCachedUserRole();
    for (const id of ids) {
      const v = this.store.vouchers.find(x => x.id === id);
      if (!v || v.status !== 'draft') { failed++; continue; }
      // 审核分离：管理员可绕过限制
      if (v.maker === currentUser && userRole !== 'admin') { failed++; continue; }
      v.status = 'audited';
      this.logOperation('批量审核', `凭证 ${v.voucher_word}-${v.voucher_no}`, `批量审核凭证`);
      success++;
    }
    if (success > 0) this.save();
    return { success, failed };
  }

  async batchPostVouchers(ids: number[]): Promise<{ success: number; failed: number }> {
    let success = 0, failed = 0;
    for (const id of ids) {
      const v = this.store.vouchers.find(x => x.id === id);
      if (!v || v.status !== 'audited') { failed++; continue; }
      v.status = 'posted';
      this.logOperation('批量过账', `凭证 ${v.voucher_word}-${v.voucher_no}`, `批量过账凭证`);
      success++;
    }
    if (success > 0) this.save();
    return { success, failed };
  }

  /* ---- 操作日志 ---- */
  async getOperationLogs(filter?: { startDate?: string; endDate?: string; limit?: number }): Promise<import('../vite-env').OpLogEntry[]> {
    let logs = [...this.store.opLogs];
    if (filter?.startDate) logs = logs.filter(l => l.createdAt >= filter.startDate!);
    if (filter?.endDate) logs = logs.filter(l => l.createdAt <= filter.endDate! + 'T23:59:59');
    if (filter?.limit && filter.limit > 0) logs = logs.slice(0, filter.limit);
    return logs;
  }

  /* ---- 科目引用检查 ---- */
  async checkSubjectUsage(code: string): Promise<{ voucherCount: number; hasChildren: boolean }> {
    const voucherCount = this.store.vouchers.reduce((count, v) => {
      return count + v.entries.filter(e => e.subjectCode === code).length;
    }, 0);
    const hasChildren = this.store.subjects.some(s => s.parent_code === code);
    return { voucherCount, hasChildren };
  }

  /* ---- 凭证模板 ---- */
  async listVoucherTemplates(): Promise<import('../vite-env').VoucherTemplate[]> {
    return [...this.store.voucherTemplates].sort((a, b) => b.id - a.id);
  }

  async saveVoucherTemplate(name: string, entries: Array<{ summary: string; subjectCode: string; subjectName: string }>): Promise<import('../vite-env').VoucherTemplate> {
    const id = this.store.voucherTemplates.length > 0
      ? Math.max(...this.store.voucherTemplates.map(t => t.id)) + 1
      : 1;
    const template: import('../vite-env').VoucherTemplate = {
      id, name,
      entries: JSON.parse(JSON.stringify(entries)),
      shareType: 'personal',
      createdAt: new Date().toISOString(),
    };
    this.store.voucherTemplates.unshift(template);
    this.logOperation('创建模板', `凭证模板 ${name}`, `创建凭证模板「${name}」`);
    this.save();
    return template;
  }

  async deleteVoucherTemplate(id: number): Promise<void> {
    const idx = this.store.voucherTemplates.findIndex(t => t.id === id);
    if (idx < 0) throw new Error('模板不存在');
    const name = this.store.voucherTemplates[idx].name;
    this.store.voucherTemplates.splice(idx, 1);
    this.logOperation('删除模板', `凭证模板 ${name}`, `删除凭证模板「${name}」`);
    this.save();
  }

  /* ---- 摘要库 ---- */
  async listVoucherSummaries(): Promise<import('../vite-env').VoucherSummary[]> {
    return [...this.store.voucherSummaries].sort((a, b) => b.id - a.id);
  }

  async createVoucherSummary(text: string, category: string): Promise<import('../vite-env').VoucherSummary> {
    if (!text.trim()) throw new Error('摘要内容不能为空');
    const id = this.store.voucherSummaries.length > 0
      ? Math.max(...this.store.voucherSummaries.map(s => s.id)) + 1
      : 1;
    const summary: import('../vite-env').VoucherSummary = {
      id, text: text.trim(), category: category || '通用',
      createdAt: new Date().toISOString(),
    };
    this.store.voucherSummaries.unshift(summary);
    this.logOperation('添加摘要', `摘要「${text}」`, `添加常用摘要「${text}」`);
    this.save();
    return summary;
  }

  async deleteVoucherSummary(id: number): Promise<void> {
    const idx = this.store.voucherSummaries.findIndex(s => s.id === id);
    if (idx < 0) throw new Error('摘要不存在');
    const text = this.store.voucherSummaries[idx].text;
    this.store.voucherSummaries.splice(idx, 1);
    this.logOperation('删除摘要', `摘要「${text}」`, `删除常用摘要「${text}」`);
    this.save();
  }
}
