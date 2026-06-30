<script setup lang="ts">
// ponytail: 账簿查询主面板 (1.2.0 重构版)
import { onMounted, ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import type { FinanceSubject } from '../api';
import { buildTreeOrderedSubjects } from '../utils/subjects';

// 引入解耦后的子账簿面板组件
import SubjectBalanceLedger from '../components/ledger/SubjectBalanceLedger.vue';
import DetailLedger from '../components/ledger/DetailLedger.vue';
import GeneralLedger from '../components/ledger/GeneralLedger.vue';
import MultiColumnLedger from '../components/ledger/MultiColumnLedger.vue';
import QuantityLedger from '../components/ledger/QuantityLedger.vue';
import ProjectLedger from '../components/ledger/ProjectLedger.vue';

interface SubjectTreeNode extends FinanceSubject {
  children: SubjectTreeNode[];
}

const api = getFinanceApi();
const period = ref('2026-06');
const allSubjects = ref<FinanceSubject[]>([]);
const selectedSubjectCode = ref('');
const subjectExpandedKeys = ref<Set<string>>(new Set());

/* 账簿导航定义 */
type BookCategory = 'main' | 'aux';
interface BookItem {
  key: string;
  label: string;
}

const bookIcons: Record<string, string> = {
  detail:       `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
  general:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  balance:      `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
  multiColumn:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/></svg>`,
  qtyLedger:    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><circle cx="16" cy="16" r="2"/></svg>`,
  projectLedger: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><circle cx="10" cy="15" r="2"/></svg>`,
};

const bookGroups: Record<BookCategory, { title: string; items: BookItem[] }> = {
  main: {
    title: '主账簿',
    items: [
      { key: 'detail',       label: '明细账' },
      { key: 'general',      label: '总账' },
      { key: 'balance',      label: '科目余额与试算' },
      { key: 'multiColumn',  label: '多栏账' },
    ],
  },
  aux: {
    title: '辅助账簿',
    items: [
      { key: 'qtyLedger',     label: '数量金额账簿' },
      { key: 'projectLedger', label: '核算项目账簿' },
    ],
  },
};

const activeBook = ref('detail');
const allBookItems = computed(() => [
  ...bookGroups.main.items, ...bookGroups.aux.items,
]);

// 只有明细账、数量金额明细账才在左侧显示科目树进行单科目筛选
const showSubjectTree = computed(() => {
  return activeBook.value === 'detail' || activeBook.value === 'qtyLedger';
});

/* ========== 科目树相关逻辑 ========== */
const subjectTree = computed<SubjectTreeNode[]>(() => {
  const list = allSubjects.value;
  const map = new Map<string, SubjectTreeNode>();
  const tree: SubjectTreeNode[] = [];

  list.forEach(s => {
    map.set(s.code, { ...s, children: [] });
  });

  list.forEach(s => {
    const node = map.get(s.code)!;
    if (s.parent_code && map.has(s.parent_code)) {
      map.get(s.parent_code)!.children.push(node);
    } else if (s.level === 1) {
      tree.push(node);
    }
  });

  const sortNodes = (nodes: SubjectTreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    nodes.forEach(n => {
      if (n.children.length > 0) {
        sortNodes(n.children);
      }
    });
  };
  sortNodes(tree);

  return tree;
});

const subjectTreeQuery = ref('');

// 实时搜索匹配科目树（若子级匹配，父级级联保留）
const filteredSubjectTree = computed<SubjectTreeNode[]>(() => {
  if (!subjectTreeQuery.value.trim()) return subjectTree.value;

  const query = subjectTreeQuery.value.trim().toLowerCase();

  const filterNodes = (nodes: SubjectTreeNode[]): SubjectTreeNode[] => {
    return nodes
      .map(node => ({ ...node, children: filterNodes(node.children) }))
      .filter(node =>
        node.code.toLowerCase().includes(query) ||
        node.name.toLowerCase().includes(query) ||
        node.children.length > 0
      );
  };

  return filterNodes(subjectTree.value);
});

// 当搜索关键字变化时，自动展开被匹配到的科目父级节点，方便用户快速定位点击
watch(subjectTreeQuery, (newQuery) => {
  if (!newQuery) return;
  const query = newQuery.trim().toLowerCase();
  
  allSubjects.value.forEach(s => {
    if (s.parent_code && (s.code.toLowerCase().includes(query) || s.name.toLowerCase().includes(query))) {
      subjectExpandedKeys.value.add(s.parent_code);
      // 支持三级科目向上两代自动级联展开一级
      const parent = allSubjects.value.find(p => p.code === s.parent_code);
      if (parent && parent.parent_code) {
        subjectExpandedKeys.value.add(parent.parent_code);
      }
    }
  });
});

function handleSearchEnter() {
  const findFirstLeaf = (nodes: SubjectTreeNode[]): SubjectTreeNode | null => {
    for (const node of nodes) {
      if (!node.children || node.children.length === 0) {
        return node;
      }
      const childLeaf = findFirstLeaf(node.children);
      if (childLeaf) return childLeaf;
    }
    return null;
  };

  const firstLeaf = findFirstLeaf(filteredSubjectTree.value);
  if (firstLeaf) {
    selectSubject(firstLeaf.code);
  }
}

async function loadSubjects() {
  try {
    const list = await api.listSubjects();
    allSubjects.value = list.filter(s => s.enabled);
    if (!selectedSubjectCode.value && allSubjects.value.length > 0) {
      // 默认选中第一个明细科目
      const leaf = allSubjects.value.find(s => !allSubjects.value.some(other => other.parent_code === s.code));
      if (leaf) selectedSubjectCode.value = leaf.code;
    }
  } catch (e: any) {
    ElMessage.error(e.message || '加载科目失败');
  }
}

function selectSubject(code: string) {
  selectedSubjectCode.value = code;
}

function toggleExpand(code: string) {
  if (subjectExpandedKeys.value.has(code)) {
    subjectExpandedKeys.value.delete(code);
  } else {
    subjectExpandedKeys.value.add(code);
  }
}

function selectBook(key: string) {
  activeBook.value = key;
}

watch(activeBook, () => {
  // 切换账簿时，重置科目树选择或执行相关初始化
});

onMounted(() => {
  loadSubjects();
});
</script>

<template>
  <div class="ledger-view">
    <!-- 顶部单行横向 Tab -->
    <div class="bt-tab-row">
      <button
        v-for="item in allBookItems"
        :key="item.key"
        :class="['bt-tab', { active: activeBook === item.key }]"
        @click="selectBook(item.key)"
      >
        <span class="bt-icon" v-html="bookIcons[item.key]"></span>
        {{ item.label }}
      </button>
    </div>

    <div class="ledger-layout">
      <!-- 左侧：科目树（仅在明细账等单科目查询时显示） -->
      <div v-if="showSubjectTree" class="ledger-sidebar">
        <div class="sidebar-title">科目导航</div>
        <div class="sidebar-search">
          <el-input
            v-model="subjectTreeQuery"
            placeholder="输入编码/名称过滤科目"
            size="small"
            clearable
            :prefix-icon="Search"
            @keyup.enter="handleSearchEnter"
          />
        </div>
        <div class="subject-tree-wrapper">
          <div class="subject-tree-list">
            <!-- 递归科目树渲染 -->
            <template v-for="node in filteredSubjectTree" :key="node.code">
              <div
                :class="['tree-node', { leaf: !node.children || node.children.length === 0, active: selectedSubjectCode === node.code }]"
                :style="{ paddingLeft: (node.level - 1) * 12 + 'px' }"
                @click="selectSubject(node.code)"
              >
                <span
                  v-if="node.children && node.children.length > 0"
                  class="expand-icon"
                  @click.stop="toggleExpand(node.code)"
                >
                  {{ subjectExpandedKeys.has(node.code) ? '▼' : '▶' }}
                </span>
                <span v-else class="expand-placeholder"></span>
                <span class="node-code">{{ node.code }}</span>
                <span class="node-name" :title="node.name">{{ node.name }}</span>
              </div>
              <!-- 子级渲染 -->
              <div v-if="node.children && node.children.length > 0 && subjectExpandedKeys.has(node.code)" class="tree-children">
                <template v-for="subNode in node.children" :key="subNode.code">
                  <div
                    :class="['tree-node', { leaf: !subNode.children || subNode.children.length === 0, active: selectedSubjectCode === subNode.code }]"
                    :style="{ paddingLeft: (subNode.level - 1) * 12 + 'px' }"
                    @click="selectSubject(subNode.code)"
                  >
                    <span
                      v-if="subNode.children && subNode.children.length > 0"
                      class="expand-icon"
                      @click.stop="toggleExpand(subNode.code)"
                    >
                      {{ subjectExpandedKeys.has(subNode.code) ? '▼' : '▶' }}
                    </span>
                    <span v-else class="expand-placeholder"></span>
                    <span class="node-code">{{ subNode.code }}</span>
                    <span class="node-name" :title="subNode.name">{{ subNode.name }}</span>
                  </div>
                  <!-- 三级渲染 -->
                  <div v-if="subNode.children && subNode.children.length > 0 && subjectExpandedKeys.has(subNode.code)" class="tree-children">
                    <div
                      v-for="subSubNode in subNode.children"
                      :key="subSubNode.code"
                      :class="['tree-node', 'leaf', { active: selectedSubjectCode === subSubNode.code }]"
                      :style="{ paddingLeft: (subSubNode.level - 1) * 12 + 'px' }"
                      @click="selectSubject(subSubNode.code)"
                    >
                      <span class="expand-placeholder"></span>
                      <span class="node-code">{{ subSubNode.code }}</span>
                      <span class="node-name" :title="subSubNode.name">{{ subSubNode.name }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 右侧：数据与面板区域 -->
      <div class="ledger-content">
        <!-- 明细账 -->
        <DetailLedger
          v-if="activeBook === 'detail'"
          :period="period"
          :selectedSubjectCode="selectedSubjectCode"
          :allSubjects="allSubjects"
        />

        <!-- 总账 -->
        <GeneralLedger
          v-else-if="activeBook === 'general'"
          :period="period"
          :allSubjects="allSubjects"
        />

        <!-- 科目余额与试算 -->
        <SubjectBalanceLedger
          v-else-if="activeBook === 'balance'"
          :period="period"
          :allSubjects="allSubjects"
        />

        <!-- 多栏账 -->
        <MultiColumnLedger
          v-else-if="activeBook === 'multiColumn'"
          :period="period"
          :allSubjects="allSubjects"
        />

        <!-- 数量金额账簿 -->
        <QuantityLedger
          v-else-if="activeBook === 'qtyLedger'"
          :period="period"
          :selectedSubjectCode="selectedSubjectCode"
          :allSubjects="allSubjects"
        />

        <!-- 核算项目账簿 -->
        <ProjectLedger
          v-else-if="activeBook === 'projectLedger'"
          :period="period"
          :allSubjects="allSubjects"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ledger-view {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 50px);
  padding: 16px;
  background-color: var(--el-bg-color-page);
  box-sizing: border-box;
}

/* 顶部 Tab 样式 */
.bt-tab-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--el-border-color-light);
  padding-bottom: 8px;
  flex-shrink: 0;
}
.bt-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid var(--epp-line);
  background-color: var(--epp-paper);
  color: var(--epp-ink-sub);
  border-radius: 6px;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.bt-tab:hover {
  border-color: var(--epp-gold);
  color: var(--epp-ink);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(184, 148, 62, 0.12);
}
.bt-tab.active {
  background: linear-gradient(135deg, var(--epp-ink) 0%, var(--epp-ink-light) 100%);
  border-color: var(--epp-ink);
  color: var(--epp-ledger);
  box-shadow: 0 4px 12px rgba(10, 30, 61, 0.2);
}
.bt-tab.active:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(10, 30, 61, 0.25);
}

/* 布局 */
.ledger-layout {
  display: flex;
  flex: 1;
  gap: 16px;
  overflow: hidden;
  height: calc(100% - 60px);
}

/* 侧边栏科目树 */
.ledger-sidebar {
  width: 230px;
  background-color: var(--epp-paper);
  border: 1px solid var(--epp-line);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.3s ease;
}
.sidebar-title {
  padding: 14px 16px;
  font-size: 13px;
  font-weight: 700;
  color: var(--epp-ink);
  border-bottom: 1px solid var(--epp-line-light);
  background-color: var(--epp-ledger);
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  letter-spacing: 0.5px;
}
.sidebar-search {
  padding: 8px 12px;
  background-color: var(--epp-paper);
  border-bottom: 1px solid var(--epp-line-light);
}
.subject-tree-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}
.tree-node {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--epp-ink-sub);
  cursor: pointer;
  user-select: none;
  border-left: 3px solid transparent;
  transition: all 0.2s ease;
}
.tree-node:hover {
  background-color: var(--epp-ledger);
  color: var(--epp-ink);
}
.tree-node.active {
  background-color: rgba(184, 148, 62, 0.08);
  border-left-color: var(--epp-gold);
  color: var(--epp-ink);
  font-weight: 700;
}
.expand-icon {
  width: 18px;
  font-size: 10px;
  color: var(--epp-ink-sub);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s ease;
}
.tree-node.active .expand-icon {
  color: var(--epp-gold);
}
.expand-placeholder {
  width: 18px;
}
.node-code {
  font-family: 'Consolas', 'Fira Code', monospace;
  font-weight: 600;
  margin-right: 8px;
  color: var(--epp-ink-sub);
}
.tree-node.active .node-code {
  color: var(--epp-gold);
}
.node-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 主数据区域 */
.ledger-content {
  flex: 1;
  background-color: var(--epp-paper);
  border: 1px solid var(--epp-line);
  border-radius: 8px;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* PRO MAX：主面板固定尺寸，表格自带溢出滚动 */
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
}
</style>
