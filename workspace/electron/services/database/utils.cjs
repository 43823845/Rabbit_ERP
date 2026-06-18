/**
 * database/utils.cjs — 工具函数与常量
 *
 * 包含：凭证校验、内置科目定义、种子数据生成
 */
const crypto = require('node:crypto');

/** 科目方向 */
const DIRECTION = Object.freeze({ DEBIT: 'debit', CREDIT: 'credit' });

/** 科目类别 */
const CATEGORY = Object.freeze({
  ASSET: 'asset',
  LIABILITY: 'liability',
  EQUITY: 'equity',
  COST: 'cost',
  INCOME: 'income',
  EXPENSE: 'expense',
});

/** 凭证状态 */
const VOUCHER_STATUS = Object.freeze({
  DRAFT: 'draft',
  AUDITED: 'audited',
  POSTED: 'posted',
  DELETED: 'deleted',
});

/** 默认辅助核算类别 */
const DEFAULT_AUX_TYPES = [
  { code: 'CUSTOMER', name: '客户' },
  { code: 'SUPPLIER', name: '供应商' },
  { code: 'DEPARTMENT', name: '部门' },
  { code: 'PROJECT', name: '项目' },
  { code: 'EMPLOYEE', name: '职员' },
];

/** 默认凭证字 */
const DEFAULT_VOUCHER_WORDS = [
  { word: '记', print_title: '记账凭证', is_default: 1 },
  { word: '收', print_title: '收款凭证', is_default: 0 },
  { word: '付', print_title: '付款凭证', is_default: 0 },
  { word: '转', print_title: '转账凭证', is_default: 0 },
];

/** 默认账套期间 */
const DEFAULT_PERIOD = '2026-06';

/**
 * 验证凭证借贷平衡
 * @throws {Error} 验证不通过
 */
function validateVoucher(payload) {
  if (!payload || !Array.isArray(payload.entries) || payload.entries.length < 2) {
    throw new Error('凭证至少需要两条分录');
  }
  const debit = payload.entries.reduce((sum, e) => sum + Number(e.debit || 0), 0);
  const credit = payload.entries.reduce((sum, e) => sum + Number(e.credit || 0), 0);
  if (debit <= 0 || credit <= 0 || Math.abs(debit - credit) > 0.001) {
    throw new Error('借贷金额必须相等且大于 0');
  }
}

/**
 * 密码哈希（PBKDF2-SHA256）
 */
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha256').toString('hex');
}

/**
 * 获取内置会计科目（金蝶标准体系）
 */
function getBuiltinSubjects() {
  return [
    // ========== 资产类 ==========
    { code: '1001', name: '库存现金', direction: 'debit', category: 'asset', is_cash: 1 },
    { code: '1002', name: '银行存款', direction: 'debit', category: 'asset', is_cash: 1 },
    { code: '1012', name: '其他货币资金', direction: 'debit', category: 'asset' },
    { code: '1101', name: '交易性金融资产', direction: 'debit', category: 'asset' },
    { code: '1121', name: '应收票据', direction: 'debit', category: 'asset' },
    { code: '1122', name: '应收账款', direction: 'debit', category: 'asset' },
    { code: '1123', name: '预付账款', direction: 'debit', category: 'asset' },
    { code: '1131', name: '应收股利', direction: 'debit', category: 'asset' },
    { code: '1132', name: '应收利息', direction: 'debit', category: 'asset' },
    { code: '1221', name: '其他应收款', direction: 'debit', category: 'asset' },
    { code: '1231', name: '坏账准备', direction: 'credit', category: 'asset' },
    { code: '1401', name: '材料采购', direction: 'debit', category: 'asset' },
    { code: '1402', name: '在途物资', direction: 'debit', category: 'asset' },
    { code: '1403', name: '原材料', direction: 'debit', category: 'asset' },
    { code: '1405', name: '库存商品', direction: 'debit', category: 'asset' },
    { code: '1406', name: '发出商品', direction: 'debit', category: 'asset' },
    { code: '1408', name: '委托加工物资', direction: 'debit', category: 'asset' },
    { code: '1411', name: '周转材料', direction: 'debit', category: 'asset' },
    { code: '1471', name: '存货跌价准备', direction: 'credit', category: 'asset' },
    { code: '1511', name: '长期股权投资', direction: 'debit', category: 'asset' },
    { code: '1512', name: '长期股权投资减值准备', direction: 'credit', category: 'asset' },
    { code: '1521', name: '投资性房地产', direction: 'debit', category: 'asset' },
    { code: '1531', name: '长期应收款', direction: 'debit', category: 'asset' },
    { code: '1601', name: '固定资产', direction: 'debit', category: 'asset' },
    { code: '1602', name: '累计折旧', direction: 'credit', category: 'asset' },
    { code: '1603', name: '固定资产减值准备', direction: 'credit', category: 'asset' },
    { code: '1604', name: '在建工程', direction: 'debit', category: 'asset' },
    { code: '1605', name: '工程物资', direction: 'debit', category: 'asset' },
    { code: '1606', name: '固定资产清理', direction: 'debit', category: 'asset' },
    { code: '1701', name: '无形资产', direction: 'debit', category: 'asset' },
    { code: '1702', name: '累计摊销', direction: 'credit', category: 'asset' },
    { code: '1703', name: '无形资产减值准备', direction: 'credit', category: 'asset' },
    { code: '1711', name: '商誉', direction: 'debit', category: 'asset' },
    { code: '1801', name: '长期待摊费用', direction: 'debit', category: 'asset' },
    { code: '1811', name: '递延所得税资产', direction: 'debit', category: 'asset' },
    { code: '1901', name: '待处理财产损溢', direction: 'debit', category: 'asset' },
    // ========== 负债类 ==========
    { code: '2001', name: '短期借款', direction: 'credit', category: 'liability' },
    { code: '2201', name: '应付票据', direction: 'credit', category: 'liability' },
    { code: '2202', name: '应付账款', direction: 'credit', category: 'liability' },
    { code: '2203', name: '预收账款', direction: 'credit', category: 'liability' },
    { code: '2211', name: '应付职工薪酬', direction: 'credit', category: 'liability' },
    { code: '2221', name: '应交税费', direction: 'credit', category: 'liability' },
    { code: '2231', name: '应付利息', direction: 'credit', category: 'liability' },
    { code: '2232', name: '应付股利', direction: 'credit', category: 'liability' },
    { code: '2241', name: '其他应付款', direction: 'credit', category: 'liability' },
    { code: '2401', name: '递延收益', direction: 'credit', category: 'liability' },
    { code: '2501', name: '长期借款', direction: 'credit', category: 'liability' },
    { code: '2502', name: '应付债券', direction: 'credit', category: 'liability' },
    { code: '2701', name: '长期应付款', direction: 'credit', category: 'liability' },
    { code: '2711', name: '专项应付款', direction: 'credit', category: 'liability' },
    { code: '2801', name: '预计负债', direction: 'credit', category: 'liability' },
    { code: '2901', name: '递延所得税负债', direction: 'credit', category: 'liability' },
    // ========== 权益类 ==========
    { code: '4001', name: '实收资本', direction: 'credit', category: 'equity' },
    { code: '4002', name: '资本公积', direction: 'credit', category: 'equity' },
    { code: '4101', name: '盈余公积', direction: 'credit', category: 'equity' },
    { code: '4103', name: '本年利润', direction: 'credit', category: 'equity' },
    { code: '4104', name: '利润分配', direction: 'credit', category: 'equity' },
    // ========== 成本类 ==========
    { code: '5001', name: '生产成本', direction: 'debit', category: 'cost' },
    { code: '5101', name: '制造费用', direction: 'debit', category: 'cost' },
    { code: '5201', name: '劳务成本', direction: 'debit', category: 'cost' },
    { code: '5301', name: '研发支出', direction: 'debit', category: 'cost' },
    // ========== 收入类 ==========
    { code: '6001', name: '主营业务收入', direction: 'credit', category: 'income' },
    { code: '6051', name: '其他业务收入', direction: 'credit', category: 'income' },
    { code: '6101', name: '公允价值变动损益', direction: 'credit', category: 'income' },
    { code: '6111', name: '投资收益', direction: 'credit', category: 'income' },
    { code: '6301', name: '营业外收入', direction: 'credit', category: 'income' },
    // ========== 费用类 ==========
    { code: '6401', name: '主营业务成本', direction: 'debit', category: 'expense' },
    { code: '6402', name: '其他业务成本', direction: 'debit', category: 'expense' },
    { code: '6403', name: '税金及附加', direction: 'debit', category: 'expense' },
    { code: '6601', name: '销售费用', direction: 'debit', category: 'expense' },
    { code: '6602', name: '管理费用', direction: 'debit', category: 'expense' },
    { code: '6603', name: '财务费用', direction: 'debit', category: 'expense' },
    { code: '6701', name: '资产减值损失', direction: 'debit', category: 'expense' },
    { code: '6711', name: '营业外支出', direction: 'debit', category: 'expense' },
    { code: '6801', name: '所得税费用', direction: 'debit', category: 'expense' },
    { code: '6901', name: '以前年度损益调整', direction: 'debit', category: 'expense' },
    // ========== 常用二级科目 ==========
    { code: '222101', name: '应交增值税', direction: 'credit', category: 'liability', parent_code: '2221', level: 2 },
    { code: '222102', name: '未交增值税', direction: 'credit', category: 'liability', parent_code: '2221', level: 2 },
    { code: '222103', name: '应交所得税', direction: 'credit', category: 'liability', parent_code: '2221', level: 2 },
    { code: '222104', name: '应交城建税', direction: 'credit', category: 'liability', parent_code: '2221', level: 2 },
    { code: '222105', name: '应交教育费附加', direction: 'credit', category: 'liability', parent_code: '2221', level: 2 },
    { code: '222106', name: '应交个人所得税', direction: 'credit', category: 'liability', parent_code: '2221', level: 2 },
    { code: '660201', name: '工资', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660202', name: '办公费', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660203', name: '差旅费', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660204', name: '业务招待费', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660205', name: '折旧费', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660206', name: '水电费', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660207', name: '咨询费', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660208', name: '社保公积金', direction: 'debit', category: 'expense', parent_code: '6602', level: 2 },
    { code: '660101', name: '广告宣传费', direction: 'debit', category: 'expense', parent_code: '6601', level: 2 },
    { code: '660102', name: '运输费', direction: 'debit', category: 'expense', parent_code: '6601', level: 2 },
    { code: '660103', name: '销售人员工资', direction: 'debit', category: 'expense', parent_code: '6601', level: 2 },
    { code: '660104', name: '展览费', direction: 'debit', category: 'expense', parent_code: '6601', level: 2 },
    { code: '660301', name: '利息收入', direction: 'credit', category: 'expense', parent_code: '6603', level: 2 },
    { code: '660302', name: '利息支出', direction: 'debit', category: 'expense', parent_code: '6603', level: 2 },
    { code: '660303', name: '手续费', direction: 'debit', category: 'expense', parent_code: '6603', level: 2 },
  ];
}

/** 生成内存模式种子数据（Electron 降级使用） */
function createSeedData() {
  const subjects = getBuiltinSubjects().map(s => ({
    ...s, id: 0, book_id: 1, enabled: 1, builtin: 1, aux_type: '', parent_code: s.parent_code || '', level: s.level || 1,
  }));
  return {
    book: { id: 1, name: '默认账套', company_name: '示例公司', current_period: DEFAULT_PERIOD },
    subjects,
    vouchers: [],
    openings: [],
    periods: [],
    auxProjectTypes: DEFAULT_AUX_TYPES.map((t, i) => ({
      id: i + 1, book_id: 1, code: t.code, name: t.name, created_at: new Date().toISOString(),
    })),
    auxProjectValues: [],
  };
}

module.exports = {
  DIRECTION,
  CATEGORY,
  VOUCHER_STATUS,
  DEFAULT_AUX_TYPES,
  DEFAULT_VOUCHER_WORDS,
  DEFAULT_PERIOD,
  validateVoucher,
  hashPassword,
  getBuiltinSubjects,
  createSeedData,
};
