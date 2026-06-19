// ponytail: 凭证打印 — Electron用webContents.print()，浏览器用隐藏iframe
import { voucherTableCss, buildVoucherExportHtml } from './voucherTemplate';
import type { FinanceVoucher } from '../api';

export async function handlePrintVoucher(voucher: FinanceVoucher): Promise<string | void> {
  const html = `<!DOCTYPE html>
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

  // Electron 环境：通过主进程 webContents.print() 直接调起系统打印对话框
  if (window.electronAPI) {
    try {
      const result: any = await window.electronAPI.invoke('print-voucher', { html });
      if (!result?.success) {
        return `打印失败: ${result?.reason || '未知错误'}`;
      }
      return; // 成功
    } catch (e: any) {
      return `打印异常: ${e?.message || e}`;
    }
  }

  // 浏览器环境：隐藏 iframe 加载 HTML，直接弹出系统打印对话框
  return new Promise<string | void>((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;border:none;visibility:hidden';
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    iframe.onload = () => {
      try {
        iframe.contentWindow?.print();
        resolve();
      } catch (e: any) {
        resolve(`打印异常: ${e?.message || e}`);
      } finally {
        // 打印对话框关闭后再清理 iframe
        setTimeout(() => {
          iframe.remove();
        }, 1000);
      }
    };

    iframe.onerror = () => {
      iframe.remove();
      resolve('打印页面加载失败');
    };
  });
}
