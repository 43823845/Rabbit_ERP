/**
 * 会计科目工具函数
 *
 * 提供科目排序、显示名称、类别标签等通用工具函数
 */
import type { FinanceSubject } from '../api';

/** 会计科目类别排序权重（数值越小越靠前） */
export const CATEGORY_ORDER: Record<string, number> = {
  asset: 1,
  liability: 2,
  equity: 3,
  cost: 4,
  income: 5,
  expense: 6,
};

/** 科目类别中文标签映射 */
const CAT_LABEL_MAP: Record<string, string> = {
  asset: '资产',
  liability: '负债',
  equity: '权益',
  cost: '成本',
  income: '收入',
  expense: '费用',
};

/**
 * 获取科目类别中文标签
 * @param cat - 类别英文标识
 * @returns 中文标签，未知类别返回原始值
 */
export function catLabel(cat: string): string {
  return CAT_LABEL_MAP[cat] || cat;
}

/**
 * 按树形结构排序科目列表
 * 输出顺序：类别 → 一级科目 → 其子科目，编码升序
 * @param subjects - 科目列表
 * @returns 按树形排序后的科目数组
 */
export function buildTreeOrderedSubjects(
  subjects: FinanceSubject[],
): FinanceSubject[] {
  // 按类别分组
  const groups: Record<string, FinanceSubject[]> = {};
  for (const s of subjects) {
    if (!groups[s.category]) groups[s.category] = [];
    groups[s.category].push(s);
  }

  const result: FinanceSubject[] = [];
  const orderedCats = Object.keys(groups).sort(
    (a, b) => (CATEGORY_ORDER[a] || 99) - (CATEGORY_ORDER[b] || 99),
  );

  for (const cat of orderedCats) {
    const items = groups[cat];
    const level1 = items.filter((s) => s.level === 1);
    const level2 = items.filter((s) => s.level === 2);

    // 一级按编码排序
    level1.sort((a, b) =>
      String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
    );

    // 构建 parent_code → children 映射
    const childrenMap: Record<string, FinanceSubject[]> = {};
    for (const s of level2) {
      const p = s.parent_code || '';
      if (!childrenMap[p]) childrenMap[p] = [];
      childrenMap[p].push(s);
    }

    // 按树序输出：一级科目 + 其子科目
    for (const parent of level1) {
      result.push(parent);
      const children = childrenMap[parent.code] || [];
      children.sort((a, b) =>
        String(a.code).localeCompare(String(b.code), undefined, { numeric: true }),
      );
      result.push(...children);
    }

    // 没有父科目的二级（兜底）
    for (const s of level2) {
      if (!result.includes(s)) result.push(s);
    }
  }

  return result;
}

/**
 * 获取科目的显示名称（二级科目显示为 "父名称-子名称"）
 * @param subject - 科目对象
 * @param allSubjects - 全部科目列表（用于查找父科目）
 * @returns 显示名称字符串
 */
export function subjectDisplayName(
  subject: FinanceSubject,
  allSubjects?: FinanceSubject[],
): string {
  if (subject.level === 2 && subject.parent_code && allSubjects) {
    const parent = allSubjects.find(
      (p) => p.code === subject.parent_code && p.category === subject.category,
    );
    return parent ? `${parent.name}-${subject.name}` : subject.name;
  }
  return subject.name;
}
