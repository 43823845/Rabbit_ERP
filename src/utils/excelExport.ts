// ponytail: Excel 导出工具 — 基于 exceljs 生成 .xlsx 文件
import ExcelJS from 'exceljs';

/**
 * 通用 Excel 导出：从列定义 + 行数据生成 .xlsx 并触发下载
 */
export async function downloadExcel(
  columns: { header: string; key: string; width?: number }[],
  rows: Record<string, any>[],
  fileName: string,
  sheetName: string = 'Sheet1',
) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  // 设置列
  sheet.columns = columns.map(c => ({
    header: c.header,
    key: c.key,
    width: c.width || 18,
  }));

  // 写入数据
  rows.forEach(row => sheet.addRow(row));

  // 表头样式
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 12, color: { argb: 'FF303133' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF5F7FA' },
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.border = {
    top: { style: 'thin', color: { argb: 'FFC0C4CC' } },
    bottom: { style: 'thin', color: { argb: 'FFC0C4CC' } },
  };

  // 数据行样式
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    row.alignment = { vertical: 'middle' };
  }

  // 生成 buffer
  const buffer = await workbook.xlsx.writeBuffer();

  // 触发下载
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  downloadBlob(blob, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`);
}

/**
 * 通用 Blob 下载（浏览器环境）
 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 通过 Electron 保存文件（弹出保存对话框）
 */
export async function saveFileViaElectron(buffer: ArrayBuffer, defaultName: string, filters?: { name: string; extensions: string[] }[]) {
  // 将 ArrayBuffer 转为 base64
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const result = await (window as any).electronAPI.invoke('save-file-dialog', {
    dataUrl: `data:application/octet-stream;base64,${base64}`,
    defaultName,
    filters: filters || [{ name: 'Excel 文件', extensions: ['xlsx'] }],
  });

  return result;
}
