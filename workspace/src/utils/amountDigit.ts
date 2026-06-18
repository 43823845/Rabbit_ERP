/**
 * 金额网格数字展示工具
 *
 * 用于记账凭证表格中的金额分栏展示，将金额拆分为
 * 亿 | 千 | 百 | 十 | 万 | 千 | 百 | 十 | 元 | 角 | 分
 * 每一位独立显示在一个单元格中
 */

/** 金额分栏单位（从左到右共11位） */
export const DIGIT_UNITS = ['亿', '千', '百', '十', '万', '千', '百', '十', '元', '角', '分'];

/**
 * 单笔分录最大金额（11位分栏限制：亿→分）
 * 超过此值将导致分栏展示溢出和程序错误
 */
export const MAX_AMOUNT = 999_999_999.99;

/**
 * 获取分节线的 CSS 类名
 * 蓝色线分隔"万"位，红色线分隔"元"位
 * @param idx - 位置索引 (0-10)
 * @returns CSS 类名字符串，无分节线返回空字符串
 */
export function digitLineClass(idx: number): string {
  if (idx === 2 || idx === 5) return 'line-blue'; // 万位分节线
  if (idx === 8) return 'line-red';               // 元位分节线
  return '';
}

/**
 * 将金额按分栏展示格式转换为数字数组
 * 前导零显示为空字符串，后续零正常显示
 * @param amount - 金额数值
 * @returns 11位字符串数组，从左到右对应亿→分
 */
export function toDigitDisplay(amount: number): string[] {
  // 防御 NaN / Infinity / 非法数值导致渲染崩溃
  if (amount == null || isNaN(amount) || !isFinite(amount)) {
    amount = 0;
  }
  const arr = Math.round(Math.abs(amount) * 100)
    .toString()
    .padStart(11, '0')
    .split('');

  let seen = false;
  return arr.map((d) => {
    if (d !== '0') seen = true;
    return seen ? d : '';
  });
}
