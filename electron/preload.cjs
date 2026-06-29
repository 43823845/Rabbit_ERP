/**
 * preload.cjs — Electron 预加载脚本
 *
 * 职责：通过 contextBridge 安全暴露 Electron API 给渲染进程
 *       - electronAPI: 通用 IPC 调用接口
 *       - 窗口控制: 最小化/最大化/关闭
 */
const { contextBridge, ipcRenderer } = require('electron');

// 通用 Electron API（ElectronFinanceApi 类使用）
contextBridge.exposeInMainWorld('electronAPI', {
  invoke(channel, ...args) {
    return ipcRenderer.invoke(channel, ...args);
  },
  /** 窗口控制 */
  windowMin: () => ipcRenderer.invoke('window:min'),
  windowMax: () => ipcRenderer.invoke('window:max'),
  windowClose: () => ipcRenderer.invoke('window:close'),
});

// 直接代理 API（简化调用，单个参数传递）
const api = {};
const channels = [
  'login', 'getCompanies', 'createCompany', 'updateCompany', 'switchCompany',
  'bootstrap',
  'listSubjects', 'createSubject', 'updateSubject', 'deleteSubject',
  'setOpeningBalance', 'getOpeningBalances',
  'closePeriod', 'reopenPeriod',
  'listVouchers', 'getVoucher', 'createVoucher', 'updateVoucher', 'deleteVoucher',
  'auditVoucher', 'unauditVoucher', 'postVoucher', 'unpostVoucher',
  'reorderVoucherNos', 'getNextVoucherNo',
  'getSubjectBalance', 'getDetailLedger', 'getGeneralLedger',
  'getTrialBalance', 'getProfitStatement', 'getBalanceSheet',
  /* 附件 */
  'listAttachments', 'uploadAttachment', 'deleteAttachment', 'getAttachmentPath', 'readAttachmentFile',
  /* 用户 */
  'listUsers', 'createUser', 'updateUser', 'changePassword', 'getUserProfile',
  'renumberSubjects', 'reorderAllVoucherNos',
  'deleteCompany',
  /* 辅助核算 */
  'listAuxProjectTypes', 'createAuxProjectType', 'updateAuxProjectType', 'deleteAuxProjectType',
  'listAuxProjectValues', 'createAuxProjectValue', 'updateAuxProjectValue', 'deleteAuxProjectValue',
  /* 数量金额账簿 & 多栏账 & 辅助核算报表 */
  'getQuantityDetailLedger', 'getQuantityGeneralLedger',
  'listMultiColumnSchemes', 'createMultiColumnScheme', 'updateMultiColumnScheme', 'deleteMultiColumnScheme',
  'getMultiColumnLedger',
  'getAuxProjectBalance', 'getAuxProjectDetail',
  /* 凭证字 */
  'listVoucherWords', 'createVoucherWord', 'updateVoucherWord', 'deleteVoucherWord',
  /* 数据管理 */
  'getDatabaseInfo', 'vacuumDatabase', 'backupDatabase', 'exportAllData', 'exportDataJson',
  /* 固定资产 */
  'listAssetCards', 'getAssetCard', 'createAssetCard', 'updateAssetCard', 'deleteAssetCard',
  'depreciateAsset', 'getAssetStats',
  /* 现金流量表 & 年末结转 */
  'getCashFlowStatement', 'checkYearEndIntegrity',
  /* 批量操作 */
  'batchAuditVouchers', 'batchPostVouchers',
  /* 操作日志 */
  'getOperationLogs',
  /* 科目引用检查 */
  'checkSubjectUsage',
  /* 凭证模板 */
  'listVoucherTemplates', 'saveVoucherTemplate', 'deleteVoucherTemplate',
  /* 摘要库 */
  'listVoucherSummaries', 'createVoucherSummary', 'deleteVoucherSummary',
];

channels.forEach((name) => {
  api[name] = (...args) => ipcRenderer.invoke(`finance:${name}`, ...args);
});

contextBridge.exposeInMainWorld('financeApi', api);
