<script setup lang="ts">
/**
 * SubjectFormModal.vue — 会计科目新增/编辑弹窗
 *
 * 职责：科目基本信息表单、辅助核算配置、父科目选择（树形级联）
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getFinanceApi } from '../api';
import type { FinanceSubject } from '../api';
import { catLabel } from '../utils/subjects';

const api = getFinanceApi();

const props = defineProps<{
  open: boolean;
  subject: FinanceSubject | null;
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'saved'): void;
}>();

const isEdit = computed(() => !!props.subject);
const saving = ref(false);
const allSubjects = ref<FinanceSubject[]>([]);

const form = reactive({
  code: '',
  name: '',
  direction: 'debit' as string,
  category: 'asset' as string,
  level: 1,
  parentCode: '' as string,
  enabled: 1,
  auxType: '' as string,
  isCash: 0,
});

/* 可选父科目：仅一级科目，且同类别 */
const parentOptions = computed(() => {
  return allSubjects.value.filter(s =>
    s.level === 1 &&
    s.category === form.category &&
    s.code !== form.code
  );
});

/* 当前选中的父科目信息 */
const selectedParent = computed(() => {
  if (!form.parentCode) return null;
  return allSubjects.value.find(s => s.code === form.parentCode) || null;
});

function resetForm() {
  // 检查是否有预填父科目（新增子科目场景）
  const prefill = window.__prefillParent;

  if (props.subject) {
    // 编辑模式
    const s = props.subject;
    form.code = s.code;
    form.name = s.name;
    form.direction = s.direction;
    form.category = s.category;
    form.level = s.level;
    form.parentCode = s.parent_code || '';
    form.enabled = s.enabled ?? 1;
    form.auxType = s.auxType || '';
    form.isCash = s.isCash ?? 0;
  } else if (prefill) {
    // 新增子科目：继承父科目信息
    form.code = '';
    form.name = '';
    form.direction = prefill.direction;
    form.category = prefill.category;
    form.level = 2;
    form.parentCode = prefill.code;
    form.enabled = 1;
    form.auxType = '';
    form.isCash = 0;
  } else {
    // 全新创建
    form.code = '';
    form.name = '';
    form.direction = 'debit';
    form.category = 'asset';
    form.level = 1;
    form.parentCode = '';
    form.enabled = 1;
    form.auxType = '';
    form.isCash = 0;
  }
}

watch(() => props.open, (val) => {
  if (val) {
    loadParents().then(() => resetForm());
  } else {
    window.__prefillParent = undefined;
  }
});

/* 选择父科目后自动设置级别和方向 */
function onParentChange(code: string) {
  if (code) {
    form.level = 2;
    const parent = allSubjects.value.find(s => s.code === code);
    if (parent) {
      form.direction = parent.direction;
      form.category = parent.category;
    }
  } else {
    form.level = 1;
  }
}

async function loadParents() {
  try {
    allSubjects.value = await api.listSubjects();
  } catch { /* ignore */ }
}

async function handleSubmit() {
  if (!form.name.trim()) { ElMessage.warning('请输入科目名称'); return; }

  saving.value = true;
  try {
    if (isEdit.value) {
      // 编辑：无变更则跳过
      if (props.subject) {
        const unchanged =
          form.code === props.subject.code &&
          form.name.trim() === props.subject.name &&
          form.direction === props.subject.direction &&
          form.category === props.subject.category &&
          form.level === props.subject.level &&
          (form.parentCode || '') === (props.subject.parent_code || '') &&
          form.enabled === props.subject.enabled &&
          form.auxType === (props.subject.auxType || '') &&
          form.isCash === (props.subject.isCash ?? 0);
        if (unchanged) {
          ElMessage.info('没有变更需要保存');
          emit('saved');
          return;
        }
      }
      const payload: Record<string, unknown> = {
        code: form.code,
        name: form.name.trim(),
        direction: form.direction,
        category: form.category,
        level: form.level,
        parentCode: form.parentCode || '',
        enabled: form.enabled,
        auxType: form.auxType,
        isCash: form.isCash,
      };
      await api.updateSubject(payload as any);
      ElMessage.success('科目已更新');
    } else {
      // 新增
      // 二级科目自动生成编码：父编码 + 当前子科目序号
      let newCode = form.code.trim();
      if (!newCode && form.parentCode) {
        const siblings = allSubjects.value.filter(
          s => s.level === 2 && s.parent_code === form.parentCode
        );
        const nextSeq = siblings.length + 1;
        newCode = `${form.parentCode}${String(nextSeq).padStart(2, '0')}`;
      }
      if (!newCode) { ElMessage.warning('请输入科目编码'); return; }

      const payload: Record<string, unknown> = {
        code: newCode,
        name: form.name.trim(),
        direction: form.direction,
        category: form.category,
        level: form.level,
        parentCode: form.parentCode || '',
        auxType: form.auxType,
        isCash: form.isCash,
      };
      await api.createSubject(payload as any);
      ElMessage.success('科目已创建');
    }
    emit('saved');
  } catch (e: any) {
    ElMessage.error(e.message || '操作失败');
  } finally {
    saving.value = false;
  }
}

/* 对话框标题 */
const dialogTitle = computed(() => {
  if (isEdit.value) return '编辑科目';
  if (form.parentCode) return `新增明细科目 - ${selectedParent.value?.name || ''}`;
  return '新增科目';
});

/** 类别标签颜色映射 */
const catTagMap: Record<string, string> = {
  asset: 'info', liability: 'warning', equity: 'success',
  cost: '', income: 'primary', expense: 'danger',
};
function catTag(c: string) { return catTagMap[c] || 'info'; }
</script>

<template>
  <el-dialog
    :model-value="open"
    @update:model-value="emit('update:open', $event)"
    :title="dialogTitle"
    width="560px"
    :destroy-on-close="false"
    :close-on-click-modal="false"
  >
    <!-- ===== 父科目信息卡片（新增子科目时显示） ===== -->
    <div v-if="form.parentCode && !isEdit" class="parent-card">
      <div class="parent-card-header">
        <span class="parent-card-prefix">父科目</span>
        <span class="parent-card-code">{{ form.parentCode }}</span>
        <span class="parent-card-name">{{ selectedParent?.name || '' }}</span>
        <el-tag :type="catTag(form.category)" size="small" class="parent-card-cat">{{ catLabel(form.category) }}</el-tag>
      </div>
      <div class="parent-card-props">
        <span class="prop-item">
          <span class="prop-label">余额方向</span>
          <span class="prop-value dir-tag-sm" :class="form.direction === 'debit' ? 'dir-debit' : 'dir-credit'">{{ form.direction === 'debit' ? '借' : '贷' }}</span>
        </span>
        <span class="prop-sep">|</span>
        <span class="prop-item">
          <span class="prop-label">级别</span>
          <span class="prop-value">2级</span>
        </span>
      </div>
    </div>

    <el-form :model="form" label-width="90px" size="small" class="subject-form">
      <!-- ===== 新建一级科目：父科目 + 类别 + 方向 ===== -->
      <template v-if="!form.parentCode || isEdit">
        <!-- 父科目 -->
        <el-form-item label="父科目" v-if="!isEdit">
          <el-select
            v-model="form.parentCode"
            style="width:100%"
            clearable
            placeholder="无（作为一级科目）"
            @change="onParentChange"
          >
            <el-option
              v-for="p in parentOptions"
              :key="p.code"
              :value="p.code"
              :label="`${p.code} ${p.name}`"
            />
          </el-select>
        </el-form-item>

        <!-- 类别 + 余额方向（同行） -->
        <el-form-item label="科目类别" v-if="!isEdit">
          <div class="inline-group">
            <el-select
              v-model="form.category"
              style="flex:1"
              :disabled="!!form.parentCode"
              @change="form.parentCode = ''"
            >
              <el-option value="asset" label="资产类" />
              <el-option value="liability" label="负债类" />
              <el-option value="equity" label="权益类" />
              <el-option value="cost" label="成本类" />
              <el-option value="income" label="收入类" />
              <el-option value="expense" label="费用类" />
            </el-select>
            <span class="inline-sep">余额</span>
            <el-select
              v-model="form.direction"
              style="width:110px"
              :disabled="!!form.parentCode"
            >
              <el-option value="debit" label="借方" />
              <el-option value="credit" label="贷方" />
            </el-select>
          </div>
        </el-form-item>

        <!-- 编辑模式：类别 + 方向分别显示 -->
        <template v-if="isEdit">
          <el-form-item label="科目类别">
            <el-select v-model="form.category" style="width:100%" disabled>
              <el-option value="asset" label="资产类" />
              <el-option value="liability" label="负债类" />
              <el-option value="equity" label="权益类" />
              <el-option value="cost" label="成本类" />
              <el-option value="income" label="收入类" />
              <el-option value="expense" label="费用类" />
            </el-select>
          </el-form-item>
          <el-form-item label="余额方向">
            <el-select v-model="form.direction" style="width:100%">
              <el-option value="debit" label="借方" />
              <el-option value="credit" label="贷方" />
            </el-select>
          </el-form-item>
        </template>

        <!-- 级别 -->
        <el-form-item label="级别" v-if="!isEdit">
          <el-input-number
            v-model="form.level"
            :min="1"
            :max="5"
            style="width:100%"
            controls-position="right"
            :disabled="!!form.parentCode"
          />
        </el-form-item>
      </template>

      <!-- ===== 编码（新增子科目时显示自动生成提示） ===== -->
      <el-form-item label="科目编码">
        <el-input
          v-model="form.code"
          :placeholder="form.parentCode && !isEdit ? `自动生成（如 ${form.parentCode}01）` : '如 100201'"
          :disabled="isEdit || (!!form.parentCode && !isEdit)"
          maxlength="20"
          class="code-input"
        />
        <div v-if="form.parentCode && !isEdit" class="form-hint">
          <span class="hint-icon">ℹ</span> 编码将自动分配，格式：{{ form.parentCode }} + 序号
        </div>
      </el-form-item>

      <!-- ===== 科目名称（核心输入） ===== -->
      <el-form-item label="科目名称" class="name-row">
        <el-input
          v-model="form.name"
          placeholder="请输入科目名称，如 建行高新支行"
          maxlength="50"
          size="default"
        >
          <template #prefix>
            <span class="name-prefix-tag" v-if="form.parentCode && !isEdit">{{ form.parentCode }}</span>
          </template>
        </el-input>
      </el-form-item>

      <!-- ===== 属性面板：卡片式分组 ===== -->
      <div class="props-section">
        <div class="props-section-title">科目属性</div>
        <div class="props-grid">
          <!-- 辅助核算 -->
          <div class="prop-field">
            <label class="prop-field-label">辅助核算</label>
            <el-select v-model="form.auxType" size="small" style="width:100%" clearable placeholder="无">
              <el-option value="" label="无" />
              <el-option value="customer" label="客户" />
              <el-option value="supplier" label="供应商" />
              <el-option value="department" label="部门" />
              <el-option value="employee" label="职员" />
              <el-option value="inventory" label="存货" />
              <el-option value="project" label="项目" />
            </el-select>
          </div>

          <!-- 现金科目 -->
          <div class="prop-field">
            <label class="prop-field-label">现金科目</label>
            <div class="cash-switch-row">
              <el-switch
                v-model="form.isCash"
                :active-value="1"
                :inactive-value="0"
                size="small"
                :active-text="form.isCash ? '是' : ''"
                :inactive-text="form.isCash ? '' : '否'"
              />
              <span class="cash-hint">标记后可用于现金流量表分析</span>
            </div>
          </div>

          <!-- 启用状态（仅编辑时） -->
          <div class="prop-field" v-if="isEdit">
            <label class="prop-field-label">启用状态</label>
            <el-switch
              v-model="form.enabled"
              :active-value="1"
              :inactive-value="0"
              size="small"
              active-text="启用"
              inactive-text="停用"
            />
          </div>
        </div>
      </div>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button size="small" @click="emit('update:open', false)">取消</el-button>
        <el-button size="small" type="primary" @click="handleSubmit" :loading="saving" :disabled="!form.name.trim()">
          {{ isEdit ? '保存修改' : (form.parentCode ? '创建明细科目' : '创建科目') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* ================================================================
   SubjectFormModal — 会计科目表单弹窗
   ================================================================ */

/* ---- 主体表单 ---- */
.subject-form {
  padding: 4px 0;
}

.subject-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.subject-form :deep(.el-form-item__label) {
  font-weight: 500;
  font-size: 13px;
  color: var(--epp-ink-text);
}

/* ---- 父科目信息卡片（新增子科目时显示） ---- */
.parent-card {
  background: linear-gradient(135deg, #f0f5fa 0%, #eef3f8 100%);
  border: 1px solid #d4dde8;
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 18px;
}

.parent-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.parent-card-prefix {
  font-size: 11px;
  color: #909399;
  background: #fff;
  padding: 1px 8px;
  border-radius: 3px;
  border: 1px solid #d4dde8;
  text-transform: uppercase;
}

.parent-card-code {
  font-size: 15px;
  font-weight: 700;
  color: var(--epp-ink);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
}

.parent-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--epp-ink-text);
}

.parent-card-cat {
  margin-left: auto;
}

.parent-card-props {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding-left: 4px;
}

.prop-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prop-label {
  color: #909399;
}

.prop-value {
  color: var(--epp-ink-text);
  font-weight: 600;
}

.prop-sep {
  color: #d4dde8;
}

/* 方向小标签 */
.dir-tag-sm {
  display: inline-block;
  padding: 0 6px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
}

.dir-tag-sm.dir-debit {
  background: #fdf6ec;
  color: #b88230;
}

.dir-tag-sm.dir-credit {
  background: #eef9f2;
  color: #3a8e5c;
}

/* ---- 内联编组（类别+方向同行） ---- */
.inline-group {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.inline-sep {
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ---- 编码 ---- */
.code-input :deep(.el-input__wrapper) {
  font-variant-numeric: tabular-nums;
}

.form-hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #909399;
  margin-top: 5px;
}

.hint-icon {
  font-size: 12px;
  color: #b0b7c4;
}

/* ---- 科目名称行 ---- */
.name-row {
  margin-bottom: 20px !important;
}

.name-row :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--epp-accent) inset;
  background: #fafcff;
}

.name-row :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--epp-accent) inset;
}

.name-row :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--epp-accent) inset;
}

.name-prefix-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--epp-ink);
  font-variant-numeric: tabular-nums;
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  background: transparent;
  border-right: 1px solid var(--epp-line-light);
  height: 100%;
  letter-spacing: 0.5px;
}

/* ---- 属性分组面板 ---- */
.props-section {
  background: #fafbfc;
  border: 1px solid var(--epp-line-light);
  border-radius: 8px;
  padding: 14px 16px;
}

.props-section-title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.props-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.prop-field {
  display: flex;
  align-items: center;
  gap: 12px;
}

.prop-field-label {
  font-size: 13px;
  color: var(--epp-ink-sub);
  font-weight: 500;
  white-space: nowrap;
  min-width: 64px;
}

/* ---- 现金科目开关 ---- */
.cash-switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cash-hint {
  font-size: 11px;
  color: #b0b7c4;
}

/* ---- 底部按钮 ---- */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ---- 弹窗整体微调 ---- */
:deep(.el-dialog__header) {
  padding: 18px 24px 14px;
  border-bottom: 1px solid var(--epp-line-light);
  margin-bottom: 0;
}

:deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--epp-ink);
}

:deep(.el-dialog__body) {
  padding: 20px 24px 12px;
}

:deep(.el-dialog__footer) {
  padding: 12px 24px 18px;
  border-top: 1px solid var(--epp-line-light);
}
</style>
