/**
 * main.cjs — Electron 主进程入口
 *
 * 职责：创建无边框主窗口、系统托盘、IPC 通信桥接、窗口管理
 */
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const { FinanceDatabase } = require('./services/database/index.cjs');
const config = require('../app.config.cjs');

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const database = new FinanceDatabase(app);

// 全局异常捕获：防止进程崩溃，记录日志并尝试紧急备份后退出
process.on('uncaughtException', (err) => {
  console.error('[FATAL] 未捕获异常:', err);
  try { database.autoBackup(); } catch (_) { /* */ }
  try { database.close(); } catch (_) { /* */ }
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] 未处理的 Promise 拒绝:', reason);
});

let mainWindow = null;
let tray = null;

/** 获取应用图标（从配置文件读取候选路径，回退到内嵌图标） */
function createAppIcon(size) {
  const s = size || 64;
  const fs = require('node:fs');

  const candidates = config.trayIconCandidates.map(c =>
    path.join(__dirname, isDev ? c.dev : c.prod)
  );

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty() && img.getSize().width > 0) {
          return img.resize({ width: s, height: s });
        }
      }
    } catch (e) {
      console.error(`[createAppIcon] Error loading ${p}:`, e.message);
    }
  }

  // 回退：内嵌 PNG 蓝色方块
  const fallbackPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAGESURBVHgB7ZnPTsJAHMe/M4VIAgkJiRcPJl48ePDoyZMnz548eDZ59GDi0YNHfQO/gA/gA/gAPoAP4AP4AB48ePDgwQNEv/3N7jaFbrugRJP2lyxtZ2d2fvOfmWFGCCGEEEIIIYQQQv6AHe0p/NOfLcWD7AzcEiu1d9e7HhPsLdDWV48PZISlSckf1PI+ysVvOyWCNdNmGBXHHxjgh3eSfN1Xa/roMpHi+E2uVl/mdhgh5WquKfJs7PZPp7tQNdfBzNAzOfjObShwHoBtqH0uAGIlyQC8T7boB5CHYAzlA5hCjAT7YewAzy/l2UaZoxMCfBUFkApAchJQ54zL4AXe1T2YgWnKJ+LXU4C4cHQa1I7JODwMYpR9ehV8oNc+xAc6BQ8EH7i04aNw/xcWfCsI1iyZvwADFwOcAt02RPGhe9v8Cg73A1i1I1QEUMTho+z6A4mOoZHYGA3M4T1eF/BNDWDL7JkXjIjeB5Qy4wJJDTBvHdNqBi7Q1JUoGAC0Fx8B/Ry05jvLBOAKaPNd4A1pGuCYLhF3U+2kI34i6HqZkCJCCCHEe34AOcoTogDQSCoAAAAASUVORK5CYII=';
  const img = nativeImage.createFromDataURL(`data:image/png;base64,${fallbackPngBase64}`);
  return img.resize({ width: s, height: s });
}

/** 创建系统托盘 */
function createTray() {
  const icon = createAppIcon(32);
  try {
    tray = new Tray(icon);
    tray.setToolTip(`${config.title} - 正在运行`);
  } catch (e) {
    console.error('[Tray] Failed to create tray:', e.message);
    tray = null;
    return;
  }

  // 双击托盘图标显示主窗口
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // 右键菜单
  const contextMenu = Menu.buildFromTemplate([
    {
      label: `显示 ${config.title}`,
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: 'separator' },
    {
      label: '退出应用',
      click: () => {
        if (tray) {
          tray.removeAllListeners();
          tray.destroy();
          tray = null;
        }
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function createWindow() {
  const icon = createAppIcon(64);
  mainWindow = new BrowserWindow({
    width: config.window.width,
    height: config.window.height,
    minWidth: config.window.minWidth,
    minHeight: config.window.minHeight,
    title: config.title,
    icon,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // 最大化并显示窗口
  mainWindow.maximize();
  mainWindow.show();

  // 最小化到托盘 + 气泡提示
  mainWindow.on('minimize', () => {
    if (tray) {
      mainWindow.hide();
      tray.displayBalloon({
        title: config.title,
        content: '应用已最小化到系统托盘，双击图标可重新打开',
        iconType: 'info',
      });
    }
  });

  // 移除窗口菜单栏
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setMenu(null);

  // 子窗口配置（附件预览、打印等使用白色背景）
  mainWindow.webContents.setWindowOpenHandler((details) => {
    // 判断是否为打印窗口（Blob URL）
    const isPrintWindow = details.url.startsWith('blob:');

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: isPrintWindow ? 1050 : 900,
        height: isPrintWindow ? 750 : 700,
        frame: false,
        resizable: true,
        transparent: false,
        autoHideMenuBar: true,
        backgroundColor: isPrintWindow ? '#ffffff' : '#1a1a1a',
        parent: isPrintWindow ? mainWindow : undefined,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      },
    };
  });

  // 开发模式：注册 DevTools 快捷键
  if (isDev) {
    mainWindow.webContents.on('before-input-event', (_event, input) => {
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        mainWindow.webContents.toggleDevTools();
      }
      if (input.control && input.shift && input.key === 'J') {
        mainWindow.webContents.toggleDevTools();
      }
    });
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  database.initialize();
  registerIpc();
  createTray();    // 先创建托盘，确保窗口最小化时托盘已存在
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  // 退出前自动备份数据库到安装目录 bak/
  database.autoBackup();
  if (tray) {
    tray.removeAllListeners();
    tray.destroy();
    tray = null;
  }
  database.close();
});

// 最后一道防线：确保数据库连接被释放
app.on('will-quit', () => {
  database.close();
});

function registerIpc() {
  const wrap = (name, fn) => ipcMain.handle(`finance:${name}`, (_e, p) => { try { return fn(p); } catch (err) { console.error(`[IPC] finance:${name} error:`, err); return { __error: err.message }; } });

  /* 窗口控制 */
  ipcMain.handle('window:min', () => { BrowserWindow.getFocusedWindow()?.minimize(); });
  ipcMain.handle('window:max', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.handle('window:close', () => { BrowserWindow.getFocusedWindow()?.close(); });

  /* 凭证打印：隐藏渲染窗口，直接弹出系统打印对话框（自带预览） */
  ipcMain.handle('print-voucher', async (_e, { html }) => {
    return new Promise((resolve) => {
      const printWin = new BrowserWindow({
        width: 1150,
        height: 800,
        show: false,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: false,
        },
      });

      const dataUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(html);
      printWin.loadURL(dataUrl);

      printWin.webContents.on('did-finish-load', () => {
        // webContents.print() 直接弹出系统打印对话框（自带预览），不另开窗口
        printWin.webContents.print({}, (success, reason) => {
          resolve({ success, reason: reason || '' });
          printWin.close();
        });
      });
    });
  });

  /* 保存 PNG 到 程序根目录/导出凭据/ */
  ipcMain.handle('save-png', async (_e, { dataUrl, fileName }) => {
    try {
      const fs = require('node:fs');
      const appRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : path.join(__dirname, '..');
      const exportDir = path.join(appRoot, '导出凭据');
      const fullPath = path.join(exportDir, fileName);
      fs.mkdirSync(exportDir, { recursive: true });
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
      return { success: true, path: fullPath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  /* auth / company */
  wrap('login', (p) => {
    const user = database.loginUser(p || {});
    if (!user) return null;
    const companies = database.getCompanies();
    if (companies.length === 0) {
      const c = database.createCompany({ name: '默认公司' });
      database.switchCompany(c.id);
      return { userId: user.id, username: user.username, alias: user.alias, role: user.role, companyId: String(c.id), companyName: c.name };
    }
    const c = companies[0];
    database.switchCompany(c.id);
    return { userId: user.id, username: user.username, alias: user.alias, role: user.role, companyId: String(c.id), companyName: c.name };
  });
  wrap('getCompanies', () => database.getCompanies());
  wrap('createCompany', (p) => database.createCompany(p || {}));
  wrap('updateCompany', (p) => database.updateCompany(p || {}));
  wrap('switchCompany', (companyId) => database.switchCompany(companyId));
  wrap('deleteCompany', (companyId) => database.deleteCompany(companyId));

  /* user management */
  wrap('listUsers', () => database.listUsers());
  wrap('createUser', (p) => database.createUser(p || {}));
  wrap('updateUser', (p) => database.updateUser(p || {}));
  wrap('changePassword', (p) => database.changePassword(p || {}));
  wrap('resetPassword', (p) => database.resetPassword(p || {}));
  wrap('getUserProfile', (userId) => database.getUserProfile(userId));

  wrap('bootstrap', () => database.getBootstrapData());

  wrap('listSubjects', () => database.listSubjects());
  wrap('createSubject', (p) => database.createSubject(p));
  wrap('updateSubject', (p) => database.updateSubject(p));
  wrap('deleteSubject', (code) => database.deleteSubject(code));

  wrap('setOpeningBalance', (p) => database.setOpeningBalance(p));
  wrap('getOpeningBalances', (period) => database.getOpeningBalances(period));

  wrap('closePeriod', (period) => database.closePeriod(period));
  wrap('reopenPeriod', (period) => database.reopenPeriod(period));

  wrap('listVouchers', (f) => database.listVouchers(f || {}));
  wrap('getVoucher', (id) => database.getVoucher(id));
  wrap('createVoucher', (p) => database.createVoucher(p));
  wrap('updateVoucher', (p) => database.updateVoucher(p));
  wrap('deleteVoucher', (id) => database.deleteVoucher(id));

  wrap('auditVoucher', (id) => database.auditVoucher(id));
  wrap('unauditVoucher', (id) => database.unauditVoucher(id));
  wrap('postVoucher', (id) => database.postVoucher(id));
  wrap('unpostVoucher', (id) => database.unpostVoucher(id));

  wrap('reorderVoucherNos', (p) => database.reorderVoucherNos(p.voucherWord, p.period));
  wrap('reorderAllVoucherNos', (period) => database.reorderAllVoucherNos(period));
  wrap('renumberSubjects', () => database.renumberSubjects());
  wrap('getNextVoucherNo', (p) => database.getNextVoucherNo(p.voucherWord, p.period));

  /* 附件 */
  wrap('listAttachments', (voucherId) => database.listAttachments(voucherId));
  wrap('uploadAttachment', (p) => database.uploadAttachment(p.voucherId, p.file));
  wrap('deleteAttachment', (attachmentId) => database.deleteAttachment(attachmentId));
  wrap('getAttachmentPath', (attachmentId) => database.getAttachmentPath(attachmentId));
  wrap('readAttachmentFile', (attachmentId) => database.readAttachmentFile(attachmentId));

  wrap('getSubjectBalance', (f) => database.getSubjectBalance(f || {}));
  wrap('getDetailLedger', (f) => database.getDetailLedger(f || {}));
  wrap('getGeneralLedger', (f) => database.getGeneralLedger(f || {}));
  wrap('getTrialBalance', (period) => database.getTrialBalance(period));
  wrap('getProfitStatement', (period) => database.getProfitStatement(period));
  wrap('getBalanceSheet', (period) => database.getBalanceSheet(period));
  wrap('getCashFlowStatement', (period) => database.getCashFlowStatement(period));
  wrap('checkYearEndIntegrity', (period) => database.checkYearEndIntegrity(period));
  wrap('getEquityChangeStatement', (period) => database.getEquityChangeStatement(period));
  wrap('getTaxPayableDetail', (period) => database.getTaxPayableDetail(period));
  wrap('getExpenseSummary', (period) => database.getExpenseSummary(period));
  wrap('getReceivableAging', (period) => database.getReceivableAging(period));
  wrap('getPayableAging', (period) => database.getPayableAging(period));

  /* 固定资产 */
  wrap('listAssetCards', (f) => database.listAssetCards(f || {}));
  wrap('getAssetCard', (id) => database.getAssetCard(id));
  wrap('createAssetCard', (p) => database.createAssetCard(p));
  wrap('updateAssetCard', (p) => database.updateAssetCard(p.id, p));
  wrap('deleteAssetCard', (id) => database.deleteAssetCard(id));
  wrap('depreciateAsset', (p) => database.depreciateAsset(p.id, p.periods || 1));
  wrap('getAssetStats', () => database.getAssetStats());
  wrap('getDepreciationSummary', (period) => database.getDepreciationSummary(period));

  /* aux project types */
  wrap('listAuxProjectTypes', () => database.listAuxProjectTypes());
  wrap('createAuxProjectType', (p) => database.createAuxProjectType(p));
  wrap('updateAuxProjectType', (p) => database.updateAuxProjectType(p));
  wrap('deleteAuxProjectType', (id) => database.deleteAuxProjectType(id));

  /* aux project values */
  wrap('listAuxProjectValues', (typeId) => database.listAuxProjectValues(typeId));
  wrap('createAuxProjectValue', (p) => database.createAuxProjectValue(p));
  wrap('updateAuxProjectValue', (p) => database.updateAuxProjectValue(p));
  wrap('deleteAuxProjectValue', (id) => database.deleteAuxProjectValue(id));

  /* multi-column ledger */
  wrap('listMultiColumnSchemes', () => database.listMultiColumnSchemes());
  wrap('createMultiColumnScheme', (p) => database.createMultiColumnScheme(p));
  wrap('updateMultiColumnScheme', (p) => database.updateMultiColumnScheme(p));
  wrap('deleteMultiColumnScheme', (id) => database.deleteMultiColumnScheme(id));
  wrap('getMultiColumnLedger', (f) => database.getMultiColumnLedger(f || {}));

  /* quantity/amount ledger */
  wrap('getQuantityDetailLedger', (f) => database.getQuantityDetailLedger(f || {}));
  wrap('getQuantityGeneralLedger', (f) => database.getQuantityGeneralLedger(f || {}));

  /* aux project reports */
  wrap('getAuxProjectBalance', (f) => database.getAuxProjectBalance(f || {}));
  wrap('getAuxProjectDetail', (f) => database.getAuxProjectDetail(f || {}));
  wrap('getAuxProjectCombo', (f) => database.getAuxProjectCombo(f || {}));

  /* voucher words */
  wrap('listVoucherWords', () => database.listVoucherWords());
  wrap('createVoucherWord', (p) => database.createVoucherWord(p));
  wrap('updateVoucherWord', (p) => database.updateVoucherWord(p.id, p.payload));
  wrap('deleteVoucherWord', (id) => database.deleteVoucherWord(id));

  /* 数据管理 */
  wrap('getDatabaseInfo', () => database.getDatabaseInfo());
  wrap('vacuumDatabase', () => database.vacuum());
  wrap('exportAllData', () => database.exportAllData());

  /* 批量操作 */
  wrap('batchAuditVouchers', (ids) => database.batchAuditVouchers(ids));
  wrap('batchPostVouchers', (ids) => database.batchPostVouchers(ids));

  /* 操作日志 */
  wrap('getOperationLogs', (filter) => database.getOperationLogs(filter));

  /* 科目引用检查 */
  wrap('checkSubjectUsage', (code) => database.checkSubjectUsage(code));

  /* 凭证模板 */
  wrap('listVoucherTemplates', () => database.listVoucherTemplates());
  wrap('saveVoucherTemplate', (p) => database.saveVoucherTemplate(p));
  wrap('deleteVoucherTemplate', (id) => database.deleteVoucherTemplate(id));

  /* 摘要库 */
  wrap('listVoucherSummaries', () => database.listVoucherSummaries());
  wrap('createVoucherSummary', (p) => database.createVoucherSummary(p));
  wrap('deleteVoucherSummary', (id) => database.deleteVoucherSummary(id));

  ipcMain.handle('finance:backupDatabase', async () => {
    const { dialog } = require('electron');
    const mainWin = BrowserWindow.getFocusedWindow();
    if (!mainWin) return { canceled: true };
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const result = await dialog.showSaveDialog(mainWin, {
      title: '备份数据库',
      defaultPath: `ERP数据库备份_${ts}.db`,
      filters: [{ name: 'SQLite 数据库', extensions: ['db'] }],
    });
    if (result.canceled) return { canceled: true };
    try {
      return database.backupDatabase(result.filePath);
    } catch (e) {
      return { __error: e.message };
    }
  });

  ipcMain.handle('finance:exportDataJson', async () => {
    const { dialog } = require('electron');
    const mainWin = BrowserWindow.getFocusedWindow();
    if (!mainWin) return { canceled: true };
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const result = await dialog.showSaveDialog(mainWin, {
      title: '导出数据为 JSON',
      defaultPath: `ERP数据导出_${ts}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    });
    if (result.canceled) return { canceled: true };
    try {
      const data = database.exportAllData();
      require('node:fs').writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true, path: result.filePath };
    } catch (e) {
      return { __error: e.message };
    }
  });
}
