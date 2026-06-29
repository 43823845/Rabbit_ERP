// ponytail: 凭证打印 — Electron webContents.print()
import { voucherTableCss, buildVoucherExportHtml } from './voucherTemplate';
import type { FinanceVoucher } from '../api';

/**
 * 构建凭证打印/PDF 完整 HTML（复用模板）
 */
export function buildVoucherPrintHtml(voucher: FinanceVoucher): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>记账凭证</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:"Microsoft YaHei","微软雅黑",sans-serif;font-size:14px;color:#333;background:#f5f6f8;padding:16px}
    .paper-wrapper{max-width:1100px;margin:0 auto;background:#fff;padding:20px 16px;border-radius:4px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .hdr{text-align:center;margin-bottom:16px}
    .hdr h2{font-size:22px;font-weight:700;letter-spacing:6px;color:#222}

    /* === 凭证表格标准样式（来自 voucherTemplate） === */
    ${voucherTableCss}

    /* === 打印样式 === */
    @media print{
      body{background:#fff;padding:0}
      .paper-wrapper{box-shadow:none;border-radius:0;max-width:none;padding:16px 20px}
    }
  </style>
</head>
<body>
  <div class="paper-wrapper">
    <div class="hdr"><h2>记 账 凭 证</h2></div>
    ${buildVoucherExportHtml(voucher)}
  </div>
</body>
</html>`;
}

export async function handlePrintVoucher(voucher: FinanceVoucher): Promise<string | void> {
  const html = buildVoucherPrintHtml(voucher);

  try {
    const result: any = await window.electronAPI!.invoke('print-voucher', { html });
    if (!result?.success) return `打印失败: ${result?.reason || '未知错误'}`;
  } catch (e: any) {
    return `打印异常: ${e?.message || e}`;
  }
}
