/**
 * 中文大写金额转换工具
 *
 * 将数字金额转换为中文大写金额字符串（财务记账规范格式）
 * 示例：1234.56 → "壹仟贰佰叁拾肆元伍角陆分"
 */

/** 中文数字字符集 */
const CN_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];

/** 个十百千单位 */
const CN_RADICES = ['', '拾', '佰', '仟'];

/** 万亿大单位 */
const CN_BIG_UNITS = ['', '万', '亿'];

/**
 * 将数字金额转换为中文大写字符串
 * @param money - 金额数值（支持正数）
 * @returns 中文大写金额字符串，零值返回 "零元整"
 */
export function toChineseUpper(money: number): string {
  if (!money || money === 0) return '零元整';

  const s = Math.abs(money).toFixed(2);
  const [intStr, decStr] = s.split('.');

  let result = '';
  let zeroCount = 0;

  // 处理整数部分
  for (let i = 0; i < intStr.length; i++) {
    const pos = intStr.length - i - 1; // 从右向左的位序号
    const digit = +intStr[i];

    if (digit === 0) {
      zeroCount++;
    } else {
      if (zeroCount > 0) result += CN_DIGITS[0]; // 连续零合并为一个"零"
      zeroCount = 0;
      result += CN_DIGITS[digit] + CN_RADICES[pos % 4];
    }
    // 每4位加万/亿
    if (pos % 4 === 0 && zeroCount < 4) {
      result += CN_BIG_UNITS[Math.floor(pos / 4)];
    }
  }

  result += '元';

  // 处理小数部分（角、分）
  const jiao = +decStr[0];
  const fen = +decStr[1];

  if (jiao === 0 && fen === 0) {
    result += '整';
  } else if (jiao > 0 && fen === 0) {
    result += CN_DIGITS[jiao] + '角整';
  } else {
    if (jiao > 0) result += CN_DIGITS[jiao] + '角';
    if (fen > 0) result += CN_DIGITS[fen] + '分';
  }

  return result;
}
