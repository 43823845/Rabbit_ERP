/**
 * 业务常量数据
 *
 * 集中管理摘要选项、业务模板等固定配置数据
 */

/** 摘要自动补全选项列表 */
export const SUMMARY_OPTIONS = [
  '支付办公费用',
  '收到销售货款',
  '提取备用金',
  '计提本月折旧',
  '支付本月工资',
  '确认主营业务收入',
  '收到投资款',
  '采购商品',
  '缴纳税费',
  '支付房租',
  '支付水电费',
  '报销差旅费',
  '支付招待费',
  '银行利息收入',
  '银行手续费',
  '结转损益',
];

/** 业务凭证模板 — 快捷生成常见凭证分录 */
export interface BusinessTemplate {
  label: string;
  /** 摘要文字 */
  remark: string;
  /** 预设分录行 */
  rows: Array<{
    summary: string;
    subjectName: string;
    debit: number;
    credit: number;
  }>;
}

/** 预设业务凭证模板列表 */
export const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    label: '提取备用金',
    remark: '提取备用金',
    rows: [
      { summary: '提取备用金', subjectName: '库存现金', debit: 5000, credit: 0 },
      { summary: '提取备用金', subjectName: '银行存款', debit: 0, credit: 5000 },
    ],
  },
  {
    label: '支付办公费',
    remark: '支付办公费用',
    rows: [
      { summary: '支付办公费用', subjectName: '管理费用-办公费', debit: 1200, credit: 0 },
      { summary: '支付办公费用', subjectName: '银行存款', debit: 0, credit: 1200 },
    ],
  },
  {
    label: '确认收入',
    remark: '确认主营业务收入',
    rows: [
      { summary: '确认收入', subjectName: '银行存款', debit: 10000, credit: 0 },
      { summary: '确认主营业务收入', subjectName: '主营业务收入', debit: 0, credit: 10000 },
    ],
  },
  {
    label: '支付工资',
    remark: '支付本月工资',
    rows: [
      { summary: '计提工资', subjectName: '管理费用-工资', debit: 30000, credit: 0 },
      { summary: '计提工资', subjectName: '应付职工薪酬', debit: 0, credit: 30000 },
    ],
  },
  {
    label: '计提折旧',
    remark: '计提本月折旧',
    rows: [
      { summary: '计提折旧', subjectName: '管理费用-折旧费', debit: 2000, credit: 0 },
      { summary: '累计折旧', subjectName: '累计折旧', debit: 0, credit: 2000 },
    ],
  },
  {
    label: '收到投资款',
    remark: '收到投资款',
    rows: [
      { summary: '收到投资款', subjectName: '银行存款', debit: 100000, credit: 0 },
      { summary: '实收资本', subjectName: '实收资本', debit: 0, credit: 100000 },
    ],
  },
  {
    label: '采购商品',
    remark: '采购商品',
    rows: [
      { summary: '采购商品', subjectName: '库存商品', debit: 8000, credit: 0 },
      { summary: '采购商品', subjectName: '银行存款', debit: 0, credit: 8000 },
    ],
  },
  {
    label: '销售商品收款',
    remark: '收到销售货款',
    rows: [
      { summary: '收到货款', subjectName: '银行存款', debit: 20000, credit: 0 },
      { summary: '销售收入', subjectName: '主营业务收入', debit: 0, credit: 20000 },
    ],
  },
];
