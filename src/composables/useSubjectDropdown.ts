/**
 * useSubjectDropdown.ts — 科目下拉选择面板逻辑组合式函数
 *
 * 职责：科目下拉面板的显示/隐藏、搜索过滤、行选择、树形科目排序、外部点击关闭
 * 使用场景：凭证表格中点击"会计科目"单元格时弹出科目选择面板
 */
import { computed, nextTick, ref, watch, type Ref, type ComputedRef } from 'vue';
import type { FinanceSubject } from '../api';
import { catLabel, buildTreeOrderedSubjects, subjectDisplayName } from '../utils/subjects';

/** 凭证分录行（引用 VoucherRow 接口） */
interface VoucherRowForSubject {
  key: number;
  subjectCode: string;
  subjectName: string;
}

/**
 * 科目下拉面板组合式函数
 * @param subjects         - 所有科目列表（响应式引用）
 * @param canEdit          - 是否可编辑状态（计算属性）
 */
export function useSubjectDropdown(
  subjects: Ref<FinanceSubject[]>,
  canEdit: ComputedRef<boolean>,
) {
  /* ---- 树形排序科目 ---- */
  const treeOrderedSubjects = computed(() => buildTreeOrderedSubjects(subjects.value));

  /* ---- 下拉面板状态 ---- */
  /** 当前展开面板对应的行 key（0 表示关闭） */
  const subjectDropdownKey = ref(0);
  /** 当前展开面板所在的行数据 */
  const subjectDropdownRow = ref<VoucherRowForSubject | null>(null);
  /** 下拉面板的定位坐标 */
  const subjectDropdownRect = ref({ top: 0, left: 0, width: 0 });
  /** 搜索过滤文本 */
  const subjectFilter = ref('');

  /**
   * 切换科目下拉面板的展开/收起
   * @param key   分录行 key
   * @param row   当前行数据
   * @param event 鼠标点击事件（用于定位面板）
   */
  function toggleSubjectDropdown(
    key: number,
    row: VoucherRowForSubject,
    event?: MouseEvent,
  ) {
    if (!canEdit.value) return;
    if (subjectDropdownKey.value === key) {
      closeSubjectDropdown();
      return;
    }
    subjectFilter.value = '';
    subjectDropdownKey.value = key;
    subjectDropdownRow.value = row;
    if (event) {
      const target = event.currentTarget as HTMLElement;
      const rect = target.getBoundingClientRect();
      subjectDropdownRect.value = {
        top: rect.bottom,
        left: rect.left,
        width: rect.width,
      };
    }
    // Teleport + v-if 渲染需要等待 DOM 挂载后聚焦
    setTimeout(() => {
      const el = document.querySelector('.subject-search-input') as HTMLInputElement | null;
      el?.focus();
    }, 0);
  }

  /** 关闭科目下拉面板 */
  function closeSubjectDropdown() {
    subjectDropdownKey.value = 0;
    subjectDropdownRow.value = null;
    subjectFilter.value = '';
  }

  /** 将选中的科目填充到对应行 */
  function selectSubjectForRow(row: VoucherRowForSubject, s: FinanceSubject) {
    row.subjectCode = s.code;
    row.subjectName = s.name;
    closeSubjectDropdown();
  }

  /**
   * 按科目类别过滤 + 搜索
   * 支持编码、名称、完整显示名三级搜索
   */
  function filteredSubjectsByCat(cat: string) {
    let list = treeOrderedSubjects.value.filter(x => x.category === cat && x.enabled !== 0);
    if (subjectFilter.value) {
      const kw = subjectFilter.value.toLowerCase();
      list = list.filter(s => {
        const display = subjectDisplayName(s, subjects.value);
        return (
          s.name.toLowerCase().includes(kw) ||
          s.code.toLowerCase().includes(kw) ||
          display.toLowerCase().includes(kw)
        );
      });
    }
    return list;
  }

  /**
   * 获取指定行的科目显示名（含父科目信息）
   * 用于模板中显示已选中科目的完整名称
   */
  function rowSubjectDisplay(row: VoucherRowForSubject): string {
    if (!row.subjectCode) return '';
    const s = subjects.value.find(x => x.code === row.subjectCode);
    return s ? subjectDisplayName(s, subjects.value) : row.subjectName;
  }

  /** 点击下拉面板外部区域时关闭面板 */
  function onSubjectDocClick(e: MouseEvent) {
    if (subjectDropdownKey.value === 0) return;
    const target = e.target as HTMLElement;
    if (
      !target.closest('.td-subject') &&
      !target.closest('.subject-dropdown') &&
      !target.closest('.quick-add-subject-dlg')
    ) {
      closeSubjectDropdown();
    }
  }

  // 监听面板状态，动态添加/移除 document 点击事件
  watch(subjectDropdownKey, (val) => {
    if (val > 0) {
      nextTick(() => document.addEventListener('click', onSubjectDocClick));
    } else {
      document.removeEventListener('click', onSubjectDocClick);
    }
  });

  return {
    treeOrderedSubjects,
    subjectDropdownKey,
    subjectDropdownRow,
    subjectDropdownRect,
    subjectFilter,
    toggleSubjectDropdown,
    closeSubjectDropdown,
    selectSubjectForRow,
    filteredSubjectsByCat,
    rowSubjectDisplay,
    /** 工具函数：科目类别中文标签、科目完整显示名（供模板使用） */
    catLabel,
    subjectDisplayName,
  };
}
