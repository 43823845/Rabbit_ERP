/**
 * 通用格式化工具函数
 */

/**
 * 将字节数格式化为人类可读的文件大小
 * @param bytes - 字节数
 * @returns 格式化后的字符串，如 "1.5KB"、"3.2MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes == null || isNaN(bytes) || !isFinite(bytes)) return '—';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/**
 * 将 Date 对象格式化为 "YYYY-MM-DD HH:mm:ss" 字符串
 * @param d - 日期对象
 * @returns 格式化日期字符串
 */
export function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${s}`;
}
