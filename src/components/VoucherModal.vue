<script setup lang="ts">
// ponytail: 凭证弹窗 — UI渲染，逻辑由5个composable接管；ref/computed须析构到顶层供模板解包
import { computed, onMounted, watch } from 'vue';
import { getFinanceApi } from '../api';
import { useAuth } from '../auth';
import { DIGIT_UNITS, digitLineClass, toDigitDisplay } from '../utils/amountDigit';
import { formatFileSize } from '../utils/format';
import { useVoucherForm } from '../composables/useVoucherForm';
import { useAttachments } from '../composables/useAttachments';
import { useAmountEditing } from '../composables/useAmountEditing';
import { useSubjectDropdown } from '../composables/useSubjectDropdown';
import { useQuickAddSubject } from '../composables/useQuickAddSubject';

/* ---- 基础设施 ---- */
const auth = useAuth();
const api = getFinanceApi();

const props = defineProps<{
  open: boolean;
  voucher?: import('../api').FinanceVoucher | null;
  readonly?: boolean;
  voucherList?: import('../api').FinanceVoucher[];
}>();

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void;
  (e: 'saved', voucher: import('../api').FinanceVoucher): void;
  (e: 'deleted', id: number): void;
  (e: 'navigate', voucher: import('../api').FinanceVoucher): void;
  (e: 'switchToCreate'): void;
}>();

/* ---- 凭证表单核心逻辑（析构到顶层） ---- */
const {
  subjects, saving, isEdit, isReadonly,
  voucherWords,
  form, rows, debitTotal, creditTotal, balanced, canEdit,
  hoveredRowKey, hasPrev, hasNext, handlePrev, handleNext,
  initModal: _originalInitModal, businessTemplates,
  querySummaries, bookkeeperOptions, chineseUpperTotal,
  handleDelete, handleAudit, handleUnaudit,
  handleSave: _handleSave,
  onSummaryKeyup, insertRowAfter, deleteRow,
} = useVoucherForm(props, emit, api, auth);

/* ---- 附件管理（析构 ref/computed 到顶层，函数保留对象.xxx 调用） ---- */
const voucherId = computed(() => props.voucher?.id);
const _att = useAttachments(api, voucherId, canEdit);
const {
  savedAttachments, pendingFiles, uploading, readingFiles,
  allAttachments, previewMap, previewLoading, fileInput,
  triggerUpload, handleFiles, removeAttachment, uploadPendingAttachments,
  isImageFile, fileTypeEmoji, loadPreview, openPreview, loadAllPreviews,
} = _att;

/* ---- 金额内联编辑（析构 ref 到顶层，函数保留对象.xxx 调用） ---- */
const _amt = useAmountEditing(rows, canEdit);
const { editing: editingAmount } = _amt;
const { setEditingRef, onInlineKeydown, onInlineInput, startEdit, commitEdit, isEditing } = _amt;

/* ---- 科目下拉面板（析构 ref 到顶层，函数保留对象.xxx 调用） ---- */
const _subj = useSubjectDropdown(subjects, canEdit);
const { subjectDropdownKey, subjectDropdownRow, subjectDropdownRect, subjectFilter } = _subj;
const { toggleSubjectDropdown, closeSubjectDropdown, selectSubjectForRow,
  filteredSubjectsByCat, rowSubjectDisplay, catLabel, subjectDisplayName } = _subj;

/* ---- 快速新增科目（析构 ref/computed 到顶层，函数保留对象.xxx 调用） ---- */
const _qa = useQuickAddSubject(subjects, api, closeSubjectDropdown);
const {
  quickAddOpen, quickAddStep, quickAddParent, quickAddName,
  quickAddSaving, quickAddSearch, level1ForDropdown,
} = _qa;
const { openQuickAddFromDropdown, selectQuickParent, backToSelect, confirmQuickAdd } = _qa;

/* ---- 桥接：initModal 包装（含附件加载） ---- */
async function initModal() {
  await _originalInitModal();
  savedAttachments.value = [];
  pendingFiles.value = [];
  if (props.voucher?.attachments?.length) {
    savedAttachments.value = props.voucher.attachments;
    loadAllPreviews();
  }
}

watch(() => props.open, (val) => {
  if (val) { initModal(); } else { closeSubjectDropdown(); }
});
watch(() => props.voucher?.id, () => { if (props.open) initModal(); });
onMounted(() => { if (props.open) initModal(); });

/* ---- 桥接：保存时联动附件上传 ---- */
async function handleSave(continueCreate = false) {
  await _handleSave(continueCreate, uploadPendingAttachments, () => {
    savedAttachments.value = [];
    pendingFiles.value = [];
  });
}

</script>

<template>
  <el-dialog
    :model-value="open"
    @update:model-value="emit('update:open', $event)"
    width="1120px"
    :destroy-on-close="true"
    :show-close="false"
    :close-on-click-modal="false"
    draggable
    class="vch-dialog"
  >
    <div class="vch-wrap">
      <!-- 工具栏 -->
      <div class="vch-bar" v-if="!isReadonly">
        <div class="vch-bar-left">
          <el-button size="small" @click="handleSave(false)" :loading="saving" :disabled="readingFiles">保存</el-button>
          <el-button size="small" @click="handleSave(true)" :loading="saving" :disabled="readingFiles">保存并新增</el-button>
          <el-button v-if="isEdit && props.voucher?.status==='draft'" size="small" @click="handleAudit">审核</el-button>
          <el-button v-if="isEdit && props.voucher?.status==='audited'" size="small" @click="handleUnaudit">反审核</el-button>
          <el-dropdown trigger="click">
            <el-button size="small">业务凭证</el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="tpl in businessTemplates" :key="tpl.label" @click="tpl.apply()">
                  {{ tpl.label }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button v-if="isEdit && props.voucher?.status==='draft'" size="small" type="danger" @click="handleDelete">删除</el-button>
        </div>
        <div class="vch-bar-right">
          <el-button size="small" :disabled="!hasPrev" class="nav-l" @click="handlePrev">&lt;</el-button>
          <el-button size="small" :disabled="!hasNext" class="nav-r" @click="handleNext">&gt;</el-button>
          <el-button size="small" class="vch-close" @click="emit('update:open', false)">&times;</el-button>
        </div>
      </div>

      <!-- 查看模式工具栏 -->
      <div class="vch-bar" v-else>
        <div class="vch-bar-left">
          <span class="view-mode-label">凭证查看</span>
        </div>
        <div class="vch-bar-right">
          <el-button size="small" :disabled="!hasPrev" class="nav-l" @click="handlePrev">&lt;</el-button>
          <el-button size="small" :disabled="!hasNext" class="nav-r" @click="handleNext">&gt;</el-button>
          <el-button size="small" class="vch-close" @click="emit('update:open', false)">&times;</el-button>
        </div>
      </div>

      <!-- 凭证头部 -->
      <div class="vch-hdr">
        <div class="vch-hdr-item">
          <el-select v-model="form.voucherWord" size="small" style="width:80px" :disabled="!canEdit">
            <el-option v-for="vw in voucherWords" :key="vw.word" :value="vw.word" :label="vw.word" />
          </el-select>
          <el-input-number v-model="form.voucherNo" :min="1" size="small" style="width:80px" :disabled="!canEdit" controls-position="right" />
          <span class="vch-suffix">号</span>
        </div>
        <div class="vch-hdr-item">
          <span>日期</span>
          <el-date-picker v-model="form.voucherDate" type="datetime" size="small" style="width:185px" :disabled="!canEdit" value-format="YYYY-MM-DD HH:mm:ss" format="YYYY-MM-DD HH:mm:ss" />
        </div>
        <div class="vch-hdr-item" style="flex:1">
          <span>备注</span>
          <el-input v-model="form.remark" placeholder="请输入备注内容" size="small" :disabled="!canEdit" />
        </div>
        <!-- 附件上传 -->
        <div class="vch-hdr-item">
          <input ref="fileInput" type="file" multiple style="display:none" @change="handleFiles" />
          <el-popover placement="bottom" :width="320" trigger="click" v-if="allAttachments.length > 0">
            <template #reference>
              <el-button size="small" class="attach-btn">
                📎 附件 <span class="attach-badge">{{ allAttachments.length }}</span>
              </el-button>
            </template>
            <div class="attach-list">
              <div v-for="(a, i) in allAttachments" :key="i" class="attach-item">
                <span class="attach-name" :title="a.file_name">{{ a.file_name }}</span>
                <span class="attach-size">{{ formatFileSize(a.file_size) }}</span>
                <span class="attach-del" @click="removeAttachment(i)" v-if="canEdit" title="移除">×</span>
              </div>
              <div class="attach-add" v-if="canEdit" @click="triggerUpload">+ 继续添加</div>
            </div>
          </el-popover>
          <el-button v-else size="small" class="attach-btn" @click="triggerUpload" :disabled="!canEdit || uploading || readingFiles">
            📎 附件
          </el-button>
        </div>
      </div>

      <!-- 凭证表格 -->
      <div class="vch-tbl-outer">
        <div class="vch-tbl-scroll-y">
        <table class="vch-tbl">
          <colgroup>
            <col class="col-summary">
            <col class="col-account">
            <col class="col-amount-grid">
            <col class="col-amount-grid">
          </colgroup>
          <thead>
            <tr>
              <th class="col-summary">摘要</th>
              <th class="col-account">会计科目</th>
              <th class="col-amount-grid">
                <div class="am-title">借方金额</div>
                <div class="am-header">
                  <div v-for="(u,i) in DIGIT_UNITS" :key="'dhu'+i" class="am-unit" :class="digitLineClass(i)">{{ u }}</div>
                </div>
              </th>
              <th class="col-amount-grid">
                <div class="am-title">贷方金额</div>
                <div class="am-header">
                  <div v-for="(u,i) in DIGIT_UNITS" :key="'chu'+i" class="am-unit" :class="digitLineClass(i)">{{ u }}</div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key"
              :class="{ 'row-hover': hoveredRowKey === row.key }"
              @mouseenter="hoveredRowKey = row.key"
              @mouseleave="hoveredRowKey = null">
              <!-- 摘要 -->
              <td class="td-summary">
                <span v-if="canEdit" class="row-add-icon" @click.stop="insertRowAfter(row.key)" title="在下方插入一行">+</span>
                <el-autocomplete
                  v-if="!isReadonly"
                  v-model="row.summary"
                  :fetch-suggestions="querySummaries"
                  :disabled="!canEdit"
                  placeholder="输入或选择摘要"
                  :trigger-on-focus="true"
                  size="small"
                  class="cell-autocomplete"
                  popper-class="cell-popper"
                  @keyup="onSummaryKeyup(row.key)"
                />
                <span v-else class="cell-text">{{ row.summary }}</span>
              </td>
              <!-- 会计科目 -->
              <td class="td-subject" :class="{ 'td-subject--open': subjectDropdownKey === row.key }">
                <template v-if="!isReadonly">
                  <div class="cell-text-wrap" @click="toggleSubjectDropdown(row.key, row, $event)">
                    <span class="cell-text" :class="{ 'cell-text--placeholder': !row.subjectCode }">
                      {{ row.subjectCode ? rowSubjectDisplay(row) : '选择科目' }}
                    </span>
                  </div>
                </template>
                <span v-else class="cell-text">{{ row.subjectCode ? rowSubjectDisplay(row) : '' }}</span>
              </td>
              <!-- 科目下拉面板（Teleport 到 body 避免裁切） -->
              <Teleport to="body" v-if="subjectDropdownKey === row.key && subjectDropdownRow?.key === row.key">
                <div class="subject-dropdown" :style="{ top: subjectDropdownRect.top + 'px', left: subjectDropdownRect.left + 'px', minWidth: subjectDropdownRect.width + 'px' }" @click.stop>
                  <div class="subject-dropdown-search">
                    <input v-model="subjectFilter" placeholder="搜索科目（编码/名称）..." class="subject-search-input" />
                  </div>
                  <div class="subject-dropdown-list">
                    <template v-for="cat in ['asset','liability','equity','cost','income','expense']" :key="cat">
                      <div class="subject-cat-title" v-if="filteredSubjectsByCat(cat).length">{{ catLabel(cat) }}</div>
                      <div
                        v-for="s in filteredSubjectsByCat(cat)"
                        :key="s.code"
                        class="subject-option"
                        :class="{ 'subject-option--active': row.subjectName === s.name, 'subject-option--child': s.level > 1 }"
                        @click="selectSubjectForRow(row, s)"
                      >{{ subjectDisplayName(s) }}
                        <span class="subject-option-code">{{ s.code }}</span>
                      </div>
                    </template>
                    <div v-if="subjectFilter && !['asset','liability','equity','cost','income','expense'].some(c => filteredSubjectsByCat(c).length)" class="subject-option subject-option--empty">无匹配科目</div>
                  </div>
                  <div class="subject-dropdown-footer" @click="openQuickAddFromDropdown">
                    <span class="subject-dropdown-footer-icon">+</span> 新增科目
                  </div>
                </div>
              </Teleport>
              <!-- 借方金额 -->
              <td class="td-amount" @click="startEdit(row.key,'debit',row.debit)" v-if="!isEditing(row.key,'debit')">
                <div class="am-grid">
                  <div v-for="(d,i) in toDigitDisplay(row.debit)" :key="'d'+i"
                    class="am-val" :class="digitLineClass(i)">{{ d }}</div>
                </div>
              </td>
              <td class="td-amount editing" v-else>
                <input :ref="setEditingRef" :value="editingAmount.str" type="text" inputmode="decimal"
                  class="am-inp" @input="onInlineInput" @keydown="onInlineKeydown"
                  @keyup.enter="commitEdit" @blur="commitEdit" />
              </td>
              <!-- 贷方金额 -->
              <td class="td-amount" @click="startEdit(row.key,'credit',row.credit)" v-if="!isEditing(row.key,'credit')">
                <div class="am-grid">
                  <div v-for="(d,i) in toDigitDisplay(row.credit)" :key="'c'+i"
                    class="am-val" :class="digitLineClass(i)">{{ d }}</div>
                </div>
                <span v-if="canEdit && rows.length > 1" class="row-del-icon" @click.stop="deleteRow(row.key)" title="删除此行">×</span>
              </td>
              <td class="td-amount editing" v-else>
                <input :ref="setEditingRef" :value="editingAmount.str" type="text" inputmode="decimal"
                  class="am-inp" @input="onInlineInput" @keydown="onInlineKeydown"
                  @keyup.enter="commitEdit" @blur="commitEdit" />
              </td>
            </tr>
            <!-- 合计行 -->
            <tr class="total-row">
              <td class="td-summary" colspan="2">合计：{{ chineseUpperTotal.debit }}</td>
              <td class="td-amount">
                <div class="am-grid">
                  <div v-for="(d,i) in toDigitDisplay(debitTotal)" :key="'td'+i"
                    class="am-val" :class="digitLineClass(i)">{{ d }}</div>
                </div>
              </td>
              <td class="td-amount">
                <div class="am-grid">
                  <div v-for="(d,i) in toDigitDisplay(creditTotal)" :key="'tc'+i"
                    class="am-val" :class="digitLineClass(i)">{{ d }}</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- 附件预览 -->
      <div class="vch-attach-preview" v-if="allAttachments.length > 0">
        <div class="vch-attach-preview-title">📎 附件预览 ({{ allAttachments.length }})</div>
        <div class="vch-attach-preview-grid">
          <div v-for="(att, idx) in allAttachments" :key="att.id" class="vch-attach-card"
            @click="previewMap[att.id] && isImageFile(att.mime_type, att.file_name) && openPreview(previewMap[att.id])"
            @mouseenter="!previewMap[att.id] && loadPreview(att.id)"
            :class="{ 'vch-attach-card--pending': (att as any)._pending }">
            <!-- 图片缩略图 -->
            <div class="vch-attach-thumb" v-if="isImageFile(att.mime_type, att.file_name)">
              <img v-if="previewMap[att.id]" :src="previewMap[att.id]" class="vch-attach-thumb-img" />
              <div v-else class="vch-attach-thumb-loading">
                <span class="vch-attach-thumb-icon">{{ previewLoading[att.id] ? '⏳' : '🖼️' }}</span>
              </div>
            </div>
            <!-- 文件类型图标 -->
            <div class="vch-attach-thumb vch-attach-thumb--file" v-else>
              <span class="vch-attach-thumb-icon-file">{{ fileTypeEmoji(att.mime_type, att.file_name) }}</span>
            </div>
            <div class="vch-attach-card-name" :title="att.file_name">{{ att.file_name }}</div>
            <div class="vch-attach-card-size">{{ formatFileSize(att.file_size) }}</div>
            <span class="vch-attach-card-del" v-if="canEdit" @click.stop="removeAttachment(idx)" title="移除">×</span>
          </div>
        </div>
      </div>

      <!-- 底部 -->
      <div class="vch-footer">
        <div>制单人：<strong>{{ form.maker || '—' }}</strong></div>
        <div>
          记账人：
          <el-select v-if="canEdit" v-model="form.bookkeeper" size="small" style="width:120px" placeholder="选择记账人" filterable allow-create>
            <el-option v-for="u in bookkeeperOptions" :key="u" :value="u" :label="u" />
          </el-select>
          <strong v-else>{{ form.bookkeeper || '—' }}</strong>
        </div>
        <div class="vch-balance">
          借 <strong>{{ debitTotal.toFixed(2) }}</strong> &nbsp; 贷 <strong>{{ creditTotal.toFixed(2) }}</strong>
          <span v-if="balanced" class="bal-badge bal-ok">借贷平衡</span>
          <span v-else-if="debitTotal+creditTotal>0" class="bal-badge bal-err">借贷不平</span>
        </div>
      </div>
    </div>

    <!-- 快速新增科目对话框（Teleport 到 body 避免被 el-dialog 遮挡） -->
    <Teleport to="body">
      <div v-if="quickAddOpen" class="quick-add-subject-dlg-overlay" @click.self="quickAddOpen = false">
        <div class="quick-add-subject-dlg">
          <div class="quick-add-subject-dlg-header">
            <span>{{ quickAddStep === 'select' ? '新增科目 - 选择父科目' : `新增明细 - ${quickAddParent?.name || ''}` }}</span>
            <span class="quick-add-subject-dlg-close" @click="quickAddOpen = false">&times;</span>
          </div>
          <div class="quick-add-subject-dlg-body">
            <!-- 步骤1：选择一级科目 -->
            <div v-if="quickAddStep === 'select'">
              <div class="qa-search">
                <input v-model="quickAddSearch" placeholder="搜索一级科目..." class="qa-search-input" />
              </div>
              <div v-for="g in level1ForDropdown" :key="g.cat" class="qa-cat-group">
                <div class="qa-cat-title">{{ g.label }}</div>
                <div class="qa-cat-items">
                  <div
                    v-for="s in g.subjects"
                    :key="s.code"
                    class="qa-item"
                    @click="selectQuickParent(s)"
                  >
                    <span class="qa-item-code">{{ s.code }}</span>
                    <span class="qa-item-name">{{ s.name }}</span>
                    <span class="qa-item-hint" :style="{ color: s.direction === 'debit' ? '#e6a23c' : '#67c23a' }">
                      {{ s.direction === 'debit' ? '借' : '贷' }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="level1ForDropdown.length === 0 && quickAddSearch" class="qa-empty">无匹配科目</div>
            </div>

            <!-- 步骤2：填写明细名称 -->
            <div v-else>
              <div class="qa-back" @click="backToSelect">← 返回选择父科目</div>
              <div class="qa-parent-info">
                父科目：<strong>{{ quickAddParent?.code }} {{ quickAddParent?.name }}</strong>
                &nbsp;|&nbsp;
                <span :style="{ color: quickAddParent?.direction === 'debit' ? '#e6a23c' : '#67c23a' }">
                  {{ quickAddParent?.direction === 'debit' ? '借方' : '贷方' }}
                </span>
                &nbsp;|&nbsp; 编码将自动生成为 <strong>{{ quickAddParent?.code }}XX</strong>
              </div>
              <div style="margin-top:16px">
                <label style="font-size:13px;color:#606266;display:block;margin-bottom:6px">科目名称</label>
                <input v-model="quickAddName" placeholder="如：浦发银行、支付宝..." maxlength="30" class="qa-name-input" autofocus @keyup.enter="confirmQuickAdd" />
              </div>
            </div>
          </div>
          <div class="quick-add-subject-dlg-footer">
            <button class="qa-btn qa-btn-cancel" @click="quickAddOpen = false">取消</button>
            <button v-if="quickAddStep === 'fill'" class="qa-btn qa-btn-confirm" :disabled="quickAddSaving" @click="confirmQuickAdd">
              {{ quickAddSaving ? '保存中...' : '确认新增' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </el-dialog>
</template>

<style scoped>
/* ============ Element Plus 弹窗覆盖 ============ */
.vch-dialog :deep(.el-dialog__header) { padding: 0; border-bottom: none; min-height: 0; display: none; }
.vch-dialog :deep(.el-dialog__body) { padding: 16px 20px 20px; }
.vch-dialog :deep(.el-dialog) { border-radius: 0; box-shadow: none !important; }

/* ============ 容器 ============ */
.vch-wrap { font-size: 13px; color: #303133; }

/* ============ 工具栏 ============ */
.vch-bar { display:flex; justify-content:space-between; align-items:center; padding:4px 0; margin-bottom:14px; border-bottom:1px dashed #e4e7ed; }
.vch-bar-left { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.vch-bar-right { display:flex; align-items:center; gap:0; }
.nav-l { border-top-right-radius:0 !important; border-bottom-right-radius:0 !important; border-right:none !important; }
.nav-r { border-top-left-radius:0 !important; border-bottom-left-radius:0 !important; }
.vch-close { color:#909399; font-size:16px; }
.vch-close:hover { color:#f56c6c !important; border-color:#f56c6c !important; }
.view-mode-label { font-size: 14px; font-weight: 600; color: #1a1a2e; }

/* ============ 头部 ============ */
.vch-hdr { display:flex; gap:16px; align-items:center; margin-bottom:12px; font-size:13px; }
.vch-hdr-item { display:flex; align-items:center; gap:6px; white-space:nowrap; }
.vch-hdr-item .el-input { flex:1; }
.vch-suffix { color:#303133; font-size:13px; }

/* 附件按钮 */
.attach-btn { padding: 5px 12px !important; font-size: 13px !important; }
.attach-badge {
  display: inline-block;
  min-width: 18px; height: 18px;
  line-height: 18px;
  border-radius: 9px;
  background: #409eff; color: #fff;
  font-size: 11px; text-align: center;
  margin-left: 4px; padding: 0 5px;
}
/* 附件列表（popover 内） */
.attach-list { max-height: 240px; overflow-y: auto; }
.attach-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 8px; border-bottom: 1px solid #ebeef5;
  font-size: 13px;
}
.attach-item:last-child { border-bottom: none; }
.attach-name {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: #303133;
}
.attach-size { color: #909399; font-size: 12px; white-space: nowrap; }
.attach-del {
  color: #f56c6c; cursor: pointer; font-weight: 700; font-size: 16px;
  padding: 0 2px; line-height: 1;
}
.attach-del:hover { color: #e63946; }
.attach-add {
  padding: 8px; text-align: center; color: #409eff; cursor: pointer;
  font-size: 13px; border-top: 1px solid #ebeef5;
}
.attach-add:hover { background: #ecf5ff; }

/* ============ 附件预览区 ============ */
.vch-attach-preview {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafbfc;
}
.vch-attach-preview-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 10px;
}
.vch-attach-preview-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.vch-attach-card {
  width: 120px;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  padding: 6px;
  background: #fff;
  text-align: center;
  cursor: default;
  transition: box-shadow 0.15s;
  position: relative;
}
.vch-attach-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.1); }
.vch-attach-card--pending { opacity: 0.7; border-style: dashed; }

.vch-attach-thumb {
  width: 108px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
  background: #f5f7fa;
  margin-bottom: 4px;
}
.vch-attach-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  cursor: pointer;
}
.vch-attach-thumb-loading {
  font-size: 28px;
  color: #c0c4cc;
}
.vch-attach-thumb-icon { font-size: 28px; }
.vch-attach-thumb--file { background: #eef1f6; }
.vch-attach-thumb-icon-file { font-size: 32px; }

.vch-attach-card-name {
  font-size: 11px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}
.vch-attach-card-size {
  font-size: 10px;
  color: #c0c4cc;
  margin-top: 2px;
}
.vch-attach-card-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.12s, transform 0.12s;
}
.vch-attach-card:hover .vch-attach-card-del { opacity: 1; transform: scale(1.15); }
.vch-attach-card-del:hover { background: #e63946; }

/* ============ 表格 ============ */
.vch-tbl-outer { border:2px solid #b0b4c0; border-radius: 4px; }
/* 表头~60px + 7行×60px + 合计行~60px ≈ 548px，取整550px */
.vch-tbl-scroll-y { max-height: 550px; overflow-y: auto; overflow-x: hidden; }
.vch-tbl { width:100%; border-collapse:collapse; table-layout:fixed; }
.vch-tbl th, .vch-tbl td { border:1px solid #c0c4cc; text-align:center; vertical-align:middle; }
.vch-tbl thead th { background:#f5f7fa; font-weight:500; color:#303133; height:30px; padding:0; position: sticky; top: 0; z-index: 1; }
.vch-tbl tbody td { height:60px; padding:0; }

/* 列宽 */
.col-summary { width: 18%; }
.col-account { width: 26%; }
.col-amount-grid { width: 28%; padding: 0 !important; }

/* 摘要单元格 */
.td-summary { text-align:left !important; padding:0 !important; position: relative; }
/* 科目单元格 */
.td-subject { text-align:left !important; padding:0 !important; position: relative !important; }
.td-subject .cell-text-wrap { 
  display: flex; align-items: center; height: 60px; cursor: pointer; padding: 0 8px;
}
.td-subject .cell-text-wrap:hover { background-color: #f5f7fa; }
.td-subject--open .cell-text-wrap { background-color: #ecf5ff; }
.td-subject .cell-text { font-size: 13px; color: #303133; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
.td-subject .cell-text--placeholder { color: #c0c4cc; }

/* 科目下拉面板 — Teleport to body 使用 fixed */
.subject-dropdown {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #409eff;
  box-shadow: 0 4px 16px rgba(0,0,0,.15);
  border-radius: 0 0 4px 4px;
}
.subject-dropdown-search {
  padding: 6px 8px;
  border-bottom: 1px solid #ebeef5;
  background: #fafafa;
}
.subject-search-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  padding: 5px 10px;
  font-size: 13px;
  color: #303133;
}
.subject-search-input:focus {
  border-color: #409eff;
}
.subject-dropdown-list {
  max-height: 520px;
  overflow-y: auto;
}
.subject-cat-title {
  font-size: 12px;
  color: #909399;
  padding: 4px 12px;
  background: #fafafa;
  border-bottom: 1px solid #f0f0f0;
  line-height: 24px;
}
.subject-option {
  font-size: 13px;
  color: #303133;
  padding: 6px 12px;
  cursor: pointer;
  white-space: nowrap;
  line-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.subject-option:hover { background-color: #f5f7fa; color: #409eff; }
.subject-option--active { color: #409eff; font-weight: 500; }
.subject-option--child { padding-left: 28px; font-size: 12px; color: #606266; }
.subject-option-code { font-size: 11px; color: #c0c4cc; margin-left: auto; flex-shrink: 0; }
.subject-option--empty { color: #c0c4cc; cursor: default; }

.cell-autocomplete {
  width: 100%;
  height: 60px;
}

/* ============ 金额列 ============ */
/* 标题行 */
.am-title {
  height: 30px;
  line-height: 30px;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  text-align: center;
  background: #f0f2f5;
  padding: 0;
}

/* 表头单位行 - flex */
.am-header {
  display: flex;
  height: 30px;
  line-height: 30px;
  border-top: 1px solid #c0c4cc;
}
.am-unit {
  flex: 1;
  text-align: center;
  font-size: 11px;
  color: #717375;
  border-right: 1px solid #dcdfe6;
  box-sizing: border-box;
}
.am-unit:last-child { border-right: none; }

/* 表体金额行 - flex */
.am-grid {
  display: flex;
  height: 100%;
  width: 100%;
  cursor: pointer;
}
.am-val {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 15px;
  color: #2c3e50;
  border-right: 1px solid #e4e7ed;
  height: 100%;
  box-sizing: border-box;
}
.am-val:last-child { border-right: none; }
.total-row .am-val { font-weight: 700; }

/* 分节线 */
.am-unit.line-blue { border-right: 1px solid #409eff !important; }
.am-unit.line-red  { border-right: 1px solid #f56c6c !important; }
.am-val.line-blue  { border-right: 1px solid #409eff !important; }
.am-val.line-red   { border-right: 1px solid #f56c6c !important; }

.td-amount { cursor:pointer; padding: 0 !important; position: relative; box-sizing: border-box; }
.td-amount:hover { background:#ecf5ff; }
.td-amount.editing { padding:0 !important; }
.am-inp { width:100%; height:100%; border:2px solid #409eff; outline:none; text-align:right; padding:0 12px; font-size:16px; font-weight:600; color:#2c3e50; box-sizing:border-box; background:#fff; }

/* 行两端悬浮新增/删除按钮 — 在单元格内侧靠边 */
.row-add-icon,
.row-del-icon {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s, transform 0.12s;
  z-index: 2;
  padding: 0;
  line-height: 20px;
}
.row-add-icon { left: 6px; background: #67c23a; color: #fff; }
.row-del-icon { right: 6px; background: #f56c6c; color: #fff; }

.row-hover .row-add-icon,
.row-hover .row-del-icon {
  opacity: 1;
  pointer-events: auto;
}
.row-add-icon:hover { background: #5daf34; transform: translateY(-50%) scale(1.15); }
.row-del-icon:hover { background: #e63946; transform: translateY(-50%) scale(1.15); }

.total-row td { background:#fafafa; font-weight:600; }
.total-row .td-summary { text-align: left !important; padding-left: 15px !important; font-size: 14px; color: #303133; }

/* ============ 底部 ============ */
.vch-footer { display:flex; gap:40px; margin-top:16px; font-size:13px; color:#606266; flex-wrap:wrap; align-items: center; }
.vch-balance { display:flex; align-items:center; gap:12px; margin-left:auto; }
.vch-balance strong { color:#303133; }
.bal-badge {
  display:inline-block;
  padding:2px 10px;
  border-radius:3px;
  font-size:12px;
  font-weight:500;
  line-height:20px;
}
.bal-ok { background:#b7e4a0; color:#2d6d1a; border:1px solid #86c960; }
.bal-err { background:#f5c5c5; color:#a83131; border:1px solid #e88b8b; }
</style>

<!-- 下拉面板全局样式（非scoped） -->
<style>
/* ===== 摘要单元格 - 强制去掉组件外观，纯文本效果 ===== */
.vch-tbl .cell-autocomplete .el-input__wrapper {
  height: 60px !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  background: transparent !important;
  border: none !important;
  padding: 0 8px !important;
  cursor: default !important;
}
.vch-tbl .cell-autocomplete .el-input__inner {
  font-size: 13px !important;
  color: #303133 !important;
  cursor: default !important;
}
.vch-tbl .td-summary:hover > .cell-autocomplete {
  background-color: #f5f7fa !important;
}
.vch-tbl .td-summary > .cell-autocomplete.is-focus .el-input__wrapper {
  background-color: #ecf5ff !important;
}

/* 只读模式文本样式 */
.vch-tbl .cell-text { 
  display: flex; align-items: center; height: 100%; font-size: 13px; color: #303133;
  padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ===== 摘要下拉面板 ===== */
.cell-popper {
  max-height: 300px !important;
  overflow-y: auto !important;
  border-radius: 4px !important;
}
.cell-popper .el-autocomplete-suggestion li {
  font-size: 13px !important;
  padding: 6px 12px !important;
  color: #303133 !important;
}
.cell-popper .el-autocomplete-suggestion li:hover,
.cell-popper .el-autocomplete-suggestion li.is-highlighted {
  background-color: #f5f7fa !important;
  color: #409eff !important;
}

/* ===== 科目下拉底部新增按钮 ===== */
.subject-dropdown-footer {
  border-top: 1px solid #ebeef5;
  padding: 8px 12px;
  font-size: 13px;
  color: #409eff;
  cursor: pointer;
  text-align: center;
  background: #fafafa;
  line-height: 24px;
}
.subject-dropdown-footer:hover {
  background: #ecf5ff;
}
.subject-dropdown-footer-icon {
  display: inline-block;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  margin-right: 4px;
  vertical-align: -2px;
}

/* ===== 快速新增科目对话框（Teleport to body） ===== */
.quick-add-subject-dlg-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.45);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.quick-add-subject-dlg {
  width: 580px;
  max-height: 80vh;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.quick-add-subject-dlg-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid #ebeef5;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
.quick-add-subject-dlg-close {
  font-size: 20px;
  color: #909399;
  cursor: pointer;
  line-height: 1;
}
.quick-add-subject-dlg-close:hover {
  color: #f56c6c;
}
.quick-add-subject-dlg-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 200px;
}
.quick-add-subject-dlg-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #ebeef5;
  background: #fafafa;
}
.qa-btn {
  padding: 7px 18px;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  background: #fff;
  color: #606266;
  font-size: 13px;
  cursor: pointer;
  outline: none;
}
.qa-btn:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}
.qa-btn-confirm {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}
.qa-btn-confirm:hover {
  background: #66b1ff;
  border-color: #66b1ff;
  color: #fff;
}
.qa-btn-confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.qa-search { margin-bottom: 12px; }
.qa-search-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  padding: 7px 10px;
  font-size: 13px;
  color: #303133;
}
.qa-search-input:focus { border-color: #409eff; }

.qa-cat-group { margin-bottom: 10px; }
.qa-cat-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 6px;
  padding-left: 4px;
  font-weight: 600;
}
.qa-cat-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.qa-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
  background: #fff;
}
.qa-item:hover {
  border-color: #409eff;
  background: #ecf5ff;
}
.qa-item-code { color: #409eff; font-weight: 600; }
.qa-item-name { color: #303133; }
.qa-item-hint { font-size: 11px; }

.qa-empty {
  text-align: center;
  color: #c0c4cc;
  font-size: 13px;
  padding: 20px;
}

.qa-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #409eff;
  cursor: pointer;
  margin-bottom: 12px;
}
.qa-back:hover { text-decoration: underline; }

.qa-parent-info {
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 13px;
  color: #606266;
}
.qa-name-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  outline: none;
  padding: 7px 10px;
  font-size: 14px;
  color: #303133;
}
.qa-name-input:focus { border-color: #409eff; }
</style>
