/**
 * useQuickAddSubject.ts — 快速新增科目逻辑组合式函数
 *
 * 职责：从凭证编辑界面快速新增二级科目的完整流程
 *      包括：选择父科目 → 填写名称 → 提交到后端 → 刷新科目列表
 * 使用场景：科目下拉面板底部"新增科目"按钮
 */
import { computed, ref, type Ref } from 'vue';
import { ElMessage } from 'element-plus';
import type { FinanceApi, FinanceSubject } from '../api';
import { catLabel } from '../utils/subjects';

/**
 * 快速新增科目组合式函数
 * @param subjects             - 科目列表（响应式引用，新增后自动刷新）
 * @param api                  - 财务 API 实例
 * @param closeSubjectDropdown - 关闭科目下拉面板的回调
 */
export function useQuickAddSubject(
  subjects: Ref<FinanceSubject[]>,
  api: FinanceApi,
  closeSubjectDropdown: () => void,
) {
  /** 对话框是否打开 */
  const quickAddOpen = ref(false);
  /** 当前步骤：select(选择父科目) | fill(填写明细) */
  const quickAddStep = ref<'select' | 'fill'>('select');
  /** 选中的父科目 */
  const quickAddParent = ref<FinanceSubject | null>(null);
  /** 新科目名称 */
  const quickAddName = ref('');
  /** 保存中标志 */
  const quickAddSaving = ref(false);
  /** 一级科目搜索文本 */
  const quickAddSearch = ref('');

  /**
   * 一级科目下拉列表（按类别分组）
   * 用于快速新增时选择父科目
   */
  const level1ForDropdown = computed(() => {
    let list = subjects.value.filter(s => s.level === 1 && s.enabled !== 0);
    if (quickAddSearch.value.trim()) {
      const kw = quickAddSearch.value.trim().toLowerCase();
      list = list.filter(
        s => s.code.toLowerCase().includes(kw) || s.name.toLowerCase().includes(kw),
      );
    }
    const groups: Record<string, FinanceSubject[]> = {};
    const catOrder = ['asset', 'liability', 'equity', 'cost', 'income', 'expense'];
    for (const s of list) {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    }
    return catOrder
      .map(cat => ({
        cat,
        label: catLabel(cat),
        subjects: groups[cat] || [],
      }))
      .filter(g => g.subjects.length > 0);
  });

  /**
   * 从科目下拉面板底部点击"新增科目"按钮
   * 关闭下拉面板，打开快速新增对话框
   */
  function openQuickAddFromDropdown() {
    closeSubjectDropdown();
    quickAddStep.value = 'select';
    quickAddParent.value = null;
    quickAddName.value = '';
    quickAddSearch.value = '';
    quickAddOpen.value = true;
  }

  /** 选择父科目，进入填写名称步骤 */
  function selectQuickParent(s: FinanceSubject) {
    quickAddParent.value = s;
    quickAddName.value = '';
    quickAddStep.value = 'fill';
  }

  /** 返回父科目选择步骤 */
  function backToSelect() {
    quickAddStep.value = 'select';
    quickAddParent.value = null;
  }

  /**
   * 确认新增科目
   * 自动生成编码（父编码 + 2位序号），提交到后端后刷新列表
   */
  async function confirmQuickAdd() {
    if (!quickAddName.value.trim()) {
      ElMessage.warning('请输入科目名称');
      return;
    }
    if (!quickAddParent.value) return;
    const parent = quickAddParent.value;
    const siblings = subjects.value.filter(
      s => s.level === 2 && s.parent_code === parent.code,
    );
    const nextSeq = siblings.length + 1;
    const newCode = `${parent.code}${String(nextSeq).padStart(2, '0')}`;

    quickAddSaving.value = true;
    try {
      await api.createSubject({
        code: newCode,
        name: quickAddName.value.trim(),
        direction: parent.direction,
        category: parent.category,
        level: 2,
        parentCode: parent.code,
      } as any);
      ElMessage.success(`已在「${parent.name}」下新增「${quickAddName.value.trim()}」`);
      quickAddOpen.value = false;
      // 刷新科目列表
      const data = await api.bootstrap();
      subjects.value = data.subjects;
    } catch (e: any) {
      ElMessage.error(e.message || '创建失败');
    } finally {
      quickAddSaving.value = false;
    }
  }

  return {
    quickAddOpen,
    quickAddStep,
    quickAddParent,
    quickAddName,
    quickAddSaving,
    quickAddSearch,
    level1ForDropdown,
    openQuickAddFromDropdown,
    selectQuickParent,
    backToSelect,
    confirmQuickAdd,
  };
}
