/**
 * useAmountEditing.ts — 凭证金额内联编辑逻辑组合式函数
 *
 * 职责：表格金额单元格的点击→输入→格式化→提交流程
 * 使用场景：凭证表格中借方/贷方金额的编辑
 */
import { nextTick, reactive, type Ref, type ComputedRef } from 'vue';
import { ElMessage } from 'element-plus';
import { MAX_AMOUNT } from '../utils/amountDigit';

/** 凭证分录行数据结构 */
export interface VoucherRow {
  key: number;
  summary: string;
  subjectCode: string;
  subjectName: string;
  debit: number;
  credit: number;
}

/**
 * 金额内联编辑组合式函数
 * @param rows    - 分录行列表（响应式引用）
 * @param canEdit - 是否可编辑状态
 */
export function useAmountEditing(
  rows: Ref<VoucherRow[]>,
  canEdit: ComputedRef<boolean>,
) {
  /** 当前编辑状态：正在编辑哪一行、借方/贷方、输入内容 */
  const editing = reactive({
    rowKey: 0,
    side: 'debit' as 'debit' | 'credit',
    str: '',
    inputRef: null as HTMLInputElement | null,
  });

  /** 设置输入框 ref，用于自动聚焦 */
  function setEditingRef(el: any) {
    editing.inputRef = (el as HTMLInputElement) || null;
  }

  /**
   * 内联输入框按键处理
   * - 只允许：数字、小数点、退格、方向键、Enter、Tab、Ctrl/Cmd 组合键
   * - "=" 键：快速复制上一行的金额
   * - 其余全部拦截（中文、字母、特殊符号等）
   */
  function onInlineKeydown(e: KeyboardEvent) {
    // "=" 键：快速复制上一行金额
    if (e.key === '=') {
      e.preventDefault();
      const idx = rows.value.findIndex(r => r.key === editing.rowKey);
      if (idx > 0) {
        const prev = rows.value[idx - 1];
        const prevVal = prev.debit || prev.credit;
        editing.str = prevVal > 0
          ? String(prevVal).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
          : '';
      } else {
        editing.str = '';
      }
      return;
    }

    // 允许的控制键：编辑、导航、Enter、Tab
    if (
      e.key === 'Backspace' || e.key === 'Delete' ||
      e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
      e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
      e.key === 'Home' || e.key === 'End' ||
      e.key === 'Tab' || e.key === 'Enter'
    ) {
      return;
    }

    // 允许 Ctrl/Cmd 组合键（复制、粘贴、全选等）
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // 允许数字和小数点
    if (/^[\d.]$/.test(e.key)) {
      return;
    }

    // 其余全部拦截（中文、字母、特殊符号等）
    e.preventDefault();
  }

  /**
   * 内联输入处理：只允许数字和小数点，自动千分位格式化
   * 同时保持光标位置不变，限制金额上限防止11位分栏溢出
   */
  function onInlineInput(e: Event) {
    const inp = e.target as HTMLInputElement;
    const raw = inp.value;
    const cursor = inp.selectionStart || 0;

    // 清除非法字符（保留数字和小数点）
    let clean = raw.replace(/[^\d.]/g, '');
    const firstDot = clean.indexOf('.');
    if (firstDot >= 0) {
      clean = clean.slice(0, firstDot + 1) + clean.slice(firstDot + 1).replace(/\./g, '');
    }

    if (!clean) { editing.str = ''; return; }

    // 计算格式化前后的逗号差异，保持光标位置
    const oldCommas = (raw.slice(0, cursor).match(/,/g) || []).length;
    const dotIdx = clean.indexOf('.');
    const intPart = dotIdx >= 0 ? clean.slice(0, dotIdx) : clean;
    const decPart = dotIdx >= 0 ? clean.slice(dotIdx) : '';
    const fmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + decPart;

    // 金额上限校验：超过 MAX_AMOUNT 则阻止输入
    const numeric = parseFloat(clean);
    if (!isNaN(numeric) && numeric > MAX_AMOUNT) {
      // 回退：删除最后一个输入字符
      editing.str = editing.str.slice(0, -1);
      return;
    }

    editing.str = fmt;
    const newCommas = (fmt.slice(0, cursor).match(/,/g) || []).length;
    const newCursor = cursor + (newCommas - oldCommas);
    nextTick(() => {
      inp.setSelectionRange(
        Math.min(newCursor, fmt.length),
        Math.min(newCursor, fmt.length),
      );
    });
  }

  /**
   * 启动金额编辑模式
   * @param rowKey  分录行 key
   * @param side    借方 debit / 贷方 credit
   * @param current 当前金额值
   */
  function startEdit(rowKey: number, side: 'debit' | 'credit', current: number) {
    if (!canEdit.value) return;
    const row = rows.value.find(r => r.key === rowKey);
    if (!row) return;
    editing.rowKey = rowKey;
    editing.side = side;
    editing.str = current > 0
      ? String(current).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      : '';
    nextTick(() => { editing.inputRef?.focus(); editing.inputRef?.select(); });
  }

  /**
   * 提交金额编辑：解析输入值并更新到对应行
   * 借方和贷方互斥——输入借方金额时自动清空贷方
   * 金额上限 MAX_AMOUNT 保护，防止11位分栏溢出
   */
  function commitEdit() {
    const idx = rows.value.findIndex(r => r.key === editing.rowKey);
    if (idx < 0) return;
    const raw = editing.str.replace(/,/g, '').replace(/[^\d.]/g, '');
    let parsed = Math.round((parseFloat(raw) || 0) * 100) / 100;

    // 金额上限校验
    if (parsed > MAX_AMOUNT) {
      parsed = MAX_AMOUNT;
      ElMessage.warning(`金额超过上限，已被限制为 ¥${MAX_AMOUNT.toLocaleString()}`);
    }

    const opposite = editing.side === 'debit' ? 'credit' : 'debit';
    rows.value[idx] = parsed > 0
      ? { ...rows.value[idx], [editing.side]: parsed, [opposite]: 0 }
      : { ...rows.value[idx], [editing.side]: parsed };
    editing.str = '';
    editing.rowKey = 0;
  }

  /** 判断指定行列是否处于编辑中 */
  function isEditing(rowKey: number, side: string): boolean {
    return editing.rowKey === rowKey && editing.side === side;
  }

  return {
    editing,
    setEditingRef,
    onInlineKeydown,
    onInlineInput,
    startEdit,
    commitEdit,
    isEditing,
  };
}
