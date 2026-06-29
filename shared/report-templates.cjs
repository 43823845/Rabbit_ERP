/**
 * shared/report-templates.cjs — 报表模板定义（单一数据源）
 *
 * 被 Electron 端（schema.cjs / reports.cjs）引用
 */

/** 报表模板种子数据 */
const REPORT_TEMPLATES = [
  // ===== 利润表 =====
  { report_type:'profit', row_no:1, name:'一、营业收入', is_header:1, bold:1, subject_codes:'6001,6051', display_order:1 },
  { report_type:'profit', row_no:2, name:'减：营业成本', bold:0, subject_codes:'6401,6402', display_order:2 },
  { report_type:'profit', row_no:3, name:'税金及附加', bold:0, subject_codes:'6403', display_order:3 },
  { report_type:'profit', row_no:4, name:'其中：消费税', indent_level:1, subject_codes:'', display_order:4 },
  { report_type:'profit', row_no:5, name:'营业税', indent_level:1, subject_codes:'', display_order:5 },
  { report_type:'profit', row_no:6, name:'城市维护建设税', indent_level:1, subject_codes:'', display_order:6 },
  { report_type:'profit', row_no:7, name:'资源税', indent_level:1, subject_codes:'', display_order:7 },
  { report_type:'profit', row_no:8, name:'土地增值税', indent_level:1, subject_codes:'', display_order:8 },
  { report_type:'profit', row_no:9, name:'城镇土地使用税、房产税、车船税、印花税', indent_level:1, subject_codes:'', display_order:9 },
  { report_type:'profit', row_no:10, name:'教育费附加、矿产资源补偿税、排污费', indent_level:1, subject_codes:'', display_order:10 },
  { report_type:'profit', row_no:11, name:'销售费用', bold:0, subject_codes:'6601', display_order:11 },
  { report_type:'profit', row_no:12, name:'其中：商品维修费', indent_level:1, subject_codes:'', display_order:12 },
  { report_type:'profit', row_no:13, name:'广告费和业务宣传费', indent_level:1, subject_codes:'', display_order:13 },
  { report_type:'profit', row_no:14, name:'管理费用', bold:0, subject_codes:'6602', display_order:14 },
  { report_type:'profit', row_no:15, name:'其中：开办费', indent_level:1, subject_codes:'', display_order:15 },
  { report_type:'profit', row_no:16, name:'业务招待费', indent_level:1, subject_codes:'660201', display_order:16 },
  { report_type:'profit', row_no:17, name:'研究费用', indent_level:1, subject_codes:'', display_order:17 },
  { report_type:'profit', row_no:18, name:'财务费用', bold:0, subject_codes:'6603', display_order:18 },
  { report_type:'profit', row_no:19, name:'其中：利息费用', indent_level:1, subject_codes:'660302', display_order:19 },
  { report_type:'profit', row_no:20, name:'加：投资收益', bold:0, subject_codes:'6111', display_order:20 },
  { report_type:'profit', row_no:21, name:'二、营业利润', is_total:1, bold:1, display_order:21 },
  { report_type:'profit', row_no:22, name:'加：营业外收入', bold:0, subject_codes:'6301', display_order:22 },
  { report_type:'profit', row_no:23, name:'其中：政府补助', indent_level:1, subject_codes:'', display_order:23 },
  { report_type:'profit', row_no:24, name:'减：营业外支出', bold:0, subject_codes:'6711', display_order:24 },
  { report_type:'profit', row_no:25, name:'其中：坏账损失', indent_level:1, subject_codes:'', display_order:25 },
  { report_type:'profit', row_no:30, name:'三、利润总额', is_total:1, bold:1, display_order:30 },
  { report_type:'profit', row_no:31, name:'减：所得税费用', bold:0, subject_codes:'6801', display_order:31 },
  { report_type:'profit', row_no:32, name:'四、净利润', is_total:1, bold:1, display_order:32 },
  // ===== 资产负债表 =====
  { report_type:'balance', section:'asset', row_no:1, name:'流动资产：', is_header:1, bold:1, display_order:1 },
  { report_type:'balance', section:'asset', row_no:2, name:'货币资金', bold:0, subject_codes:'1001,1002', display_order:2 },
  { report_type:'balance', section:'asset', row_no:3, name:'短期投资', bold:0, subject_codes:'1101', display_order:3 },
  { report_type:'balance', section:'asset', row_no:4, name:'应收票据', bold:0, subject_codes:'1121', display_order:4 },
  { report_type:'balance', section:'asset', row_no:5, name:'应收账款', bold:0, subject_codes:'1122', display_order:5 },
  { report_type:'balance', section:'asset', row_no:6, name:'预付账款', bold:0, subject_codes:'1123', display_order:6 },
  { report_type:'balance', section:'asset', row_no:7, name:'应收股利', bold:0, subject_codes:'1131', display_order:7 },
  { report_type:'balance', section:'asset', row_no:8, name:'应收利息', bold:0, subject_codes:'1132', display_order:8 },
  { report_type:'balance', section:'asset', row_no:9, name:'其他应收款', bold:0, subject_codes:'1221', display_order:9 },
  { report_type:'balance', section:'asset', row_no:10, name:'存货', bold:0, subject_codes:'1401,1402,1403,1405,1406,1408,1411', display_order:10 },
  { report_type:'balance', section:'asset', row_no:15, name:'流动资产合计', is_total:1, bold:1, display_order:15 },
  { report_type:'balance', section:'asset', row_no:16, name:'非流动资产：', is_header:1, bold:1, display_order:16 },
  { report_type:'balance', section:'asset', row_no:17, name:'长期债券投资', bold:0, display_order:17 },
  { report_type:'balance', section:'asset', row_no:18, name:'长期股权投资', bold:0, subject_codes:'1511', display_order:18 },
  { report_type:'balance', section:'asset', row_no:19, name:'固定资产原价', bold:0, subject_codes:'1601', display_order:19 },
  { report_type:'balance', section:'asset', row_no:20, name:'减：累计折旧', bold:0, subject_codes:'1602', display_order:20 },
  { report_type:'balance', section:'asset', row_no:21, name:'固定资产账面价值', is_total:1, bold:1, display_order:21 },
  { report_type:'balance', section:'asset', row_no:22, name:'生产性生物资产', bold:0, subject_codes:'1621', display_order:22 },
  { report_type:'balance', section:'asset', row_no:23, name:'开发支出', bold:0, subject_codes:'5301', display_order:23 },
  { report_type:'balance', section:'asset', row_no:24, name:'其他非流动资产', bold:0, display_order:24 },
  { report_type:'balance', section:'asset', row_no:25, name:'无形资产', bold:0, subject_codes:'1701', display_order:25 },
  { report_type:'balance', section:'asset', row_no:26, name:'在建工程', bold:0, subject_codes:'1604', display_order:26 },
  { report_type:'balance', section:'asset', row_no:27, name:'工程物资', bold:0, subject_codes:'1605', display_order:27 },
  { report_type:'balance', section:'asset', row_no:28, name:'长期待摊费用', bold:0, subject_codes:'1801', display_order:28 },
  { report_type:'balance', section:'asset', row_no:29, name:'非流动资产合计', is_total:1, bold:1, display_order:29 },
  { report_type:'balance', section:'asset', row_no:30, name:'资产总计', is_total:1, bold:1, display_order:30 },
  { report_type:'balance', section:'liability', row_no:31, name:'流动负债：', is_header:1, bold:1, display_order:31 },
  { report_type:'balance', section:'liability', row_no:32, name:'短期借款', bold:0, subject_codes:'2001', display_order:32 },
  { report_type:'balance', section:'liability', row_no:33, name:'应付票据', bold:0, subject_codes:'2201', display_order:33 },
  { report_type:'balance', section:'liability', row_no:34, name:'应付账款', bold:0, subject_codes:'2202', display_order:34 },
  { report_type:'balance', section:'liability', row_no:35, name:'预收账款', bold:0, subject_codes:'2203', display_order:35 },
  { report_type:'balance', section:'liability', row_no:36, name:'应付职工薪酬', bold:0, subject_codes:'2211', display_order:36 },
  { report_type:'balance', section:'liability', row_no:37, name:'应交税费', bold:0, subject_codes:'2221', display_order:37 },
  { report_type:'balance', section:'liability', row_no:38, name:'应付利息', bold:0, subject_codes:'2231', display_order:38 },
  { report_type:'balance', section:'liability', row_no:39, name:'应付股利', bold:0, subject_codes:'2232', display_order:39 },
  { report_type:'balance', section:'liability', row_no:40, name:'其他应付款', bold:0, subject_codes:'2241', display_order:40 },
  { report_type:'balance', section:'liability', row_no:41, name:'流动负债合计', is_total:1, bold:1, display_order:41 },
  { report_type:'balance', section:'liability', row_no:42, name:'长期借款', bold:0, subject_codes:'2501', display_order:42 },
  { report_type:'balance', section:'liability', row_no:43, name:'长期应付款', bold:0, subject_codes:'2701', display_order:43 },
  { report_type:'balance', section:'liability', row_no:44, name:'递延收益', bold:0, subject_codes:'2401', display_order:44 },
  { report_type:'balance', section:'liability', row_no:46, name:'非流动负债合计', is_total:1, bold:1, display_order:46 },
  { report_type:'balance', section:'liability', row_no:47, name:'负债合计', is_total:1, bold:1, display_order:47 },
  { report_type:'balance', section:'equity', row_no:48, name:'所有者权益：', is_header:1, bold:1, display_order:48 },
  { report_type:'balance', section:'equity', row_no:49, name:'实收资本（或股本）', bold:0, subject_codes:'4001', display_order:49 },
  { report_type:'balance', section:'equity', row_no:50, name:'资本公积', bold:0, subject_codes:'4002', display_order:50 },
  { report_type:'balance', section:'equity', row_no:51, name:'盈余公积', bold:0, subject_codes:'4101', display_order:51 },
  { report_type:'balance', section:'equity', row_no:52, name:'未分配利润', bold:0, subject_codes:'4104', display_order:52 },
  { report_type:'balance', section:'equity', row_no:53, name:'所有者权益合计', is_total:1, bold:1, display_order:53 },
  { report_type:'balance', section:'equity', row_no:54, name:'负债和所有者权益总计', is_total:1, bold:1, display_order:99 },
];

/**
 * 按类型过滤模板行
 * @param {'profit'|'balance'} type
 * @returns {Array}
 */
function getTemplatesByType(type) {
  return REPORT_TEMPLATES.filter(t => t.report_type === type);
}

module.exports = { REPORT_TEMPLATES, getTemplatesByType };
