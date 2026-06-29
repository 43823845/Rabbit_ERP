<script setup lang="ts">
/**
 * AssetView.vue — 固定资产卡片管理
 *
 * 职责：固定资产的增删改查、折旧计算与计提
 */
import { onMounted, ref, computed, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Refresh, Coin } from '@element-plus/icons-vue';
import { getFinanceApi } from '../api';
import type { AssetCard, AssetCardPayload, AssetStats } from '../api';

const api = getFinanceApi();
const loading = ref(false);
const assets = ref<AssetCard[]>([]);
const stats = ref<AssetStats>({ totalOriginal: 0, totalDep: 0, totalNet: 0, cnt: 0 });
const filterStatus = ref('');
const filterCategory = ref('');

/* 弹窗状态 */
const dialogOpen = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const editingId = ref(0);

const categories = ['房屋建筑', '机器设备', '运输工具', '电子设备', '办公设备', '家具器具', '其他'];

const form = reactive<AssetCardPayload & { assetName: string; originalValue: number }>({
  assetCode: '', assetName: '', category: '办公设备', buyDate: '',
  originalValue: 0, residualRate: 0.05, usefulLifeYears: 5,
  status: '在用', department: '', remark: '',
});

const previewMonthlyDep = computed(() => {
  const months = form.usefulLifeYears * 12;
  if (months <= 0) return 0;
  return Math.round((form.originalValue * (1 - form.residualRate) / months) * 100) / 100;
});

async function loadData() {
  loading.value = true;
  try {
    const filter: any = {};
    if (filterStatus.value) filter.status = filterStatus.value;
    if (filterCategory.value) filter.category = filterCategory.value;
    assets.value = await api.listAssetCards(filter);
    stats.value = await api.getAssetStats();
  } catch (e: any) {
    ElMessage.error(e.message || '加载失败');
  } finally { loading.value = false; }
}

function openCreate() {
  dialogMode.value = 'create';
  editingId.value = 0;
  form.assetCode = '';
  form.assetName = '';
  form.category = '办公设备';
  form.buyDate = new Date().toISOString().slice(0, 10);
  form.originalValue = 0;
  form.residualRate = 0.05;
  form.usefulLifeYears = 5;
  form.status = '在用';
  form.department = '';
  form.remark = '';
  dialogOpen.value = true;
}

function openEdit(row: AssetCard) {
  dialogMode.value = 'edit';
  editingId.value = row.id;
  form.assetCode = row.asset_code;
  form.assetName = row.asset_name;
  form.category = row.category;
  form.buyDate = row.buy_date;
  form.originalValue = row.original_value;
  form.residualRate = row.residual_rate;
  form.usefulLifeYears = row.useful_life_years;
  form.status = row.status;
  form.department = row.department;
  form.remark = row.remark;
  dialogOpen.value = true;
}

async function handleSave() {
  if (!form.assetName.trim()) { ElMessage.warning('请输入资产名称'); return; }
  if (form.originalValue <= 0) { ElMessage.warning('原值必须大于零'); return; }
  if (form.usefulLifeYears < 1) { ElMessage.warning('使用年限至少1年'); return; }
  try {
    if (dialogMode.value === 'create') {
      await api.createAssetCard({ ...form });
      ElMessage.success('固定资产卡片已创建');
    } else {
      await api.updateAssetCard(editingId.value, { ...form });
      ElMessage.success('固定资产卡片已更新');
    }
    dialogOpen.value = false;
    await loadData();
  } catch (e: any) { ElMessage.error(e.message || '保存失败'); }
}

async function handleDelete(row: AssetCard) {
  try {
    await ElMessageBox.confirm(`确定删除固定资产「${row.asset_name}」？`, '确认删除', {
      type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    await api.deleteAssetCard(row.id);
    ElMessage.success('已删除');
    await loadData();
  } catch { /* 取消 */ }
}

async function handleDepreciate(row: AssetCard) {
  try {
    await ElMessageBox.confirm(
      `为「${row.asset_name}」计提 1 期折旧（${row.monthly_depreciation.toFixed(2)}）？累计折旧将由 ${row.accumulated_depreciation.toFixed(2)} 增加至 ${(row.accumulated_depreciation + row.monthly_depreciation).toFixed(2)}。`,
      '计提折旧', { confirmButtonText: '确定计提', cancelButtonText: '取消', type: 'warning' }
    );
    const result = await api.depreciateAsset(row.id, 1);
    ElMessage.success(`已计提 ${result.addedDepreciation.toFixed(2)}，累计 ${result.accumulatedDepreciation.toFixed(2)}，净值 ${result.netValue.toFixed(2)}`);
    await loadData();
  } catch { /* 取消 */ }
}

function formatMoney(v: number): string {
  return v ? v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function statusTag(status: string) {
  const map: Record<string, string> = { '在用': 'success', '已提足折旧': 'info', '报废': 'danger', '已处置': 'warning' };
  return map[status] || 'info';
}

onMounted(loadData);
</script>

<template>
  <div class="ast-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <div>
        <h2 class="ph-title">固定资产</h2>
        <p class="ph-desc">管理固定资产卡片，支持直线法折旧计算与计提</p>
      </div>
      <div class="ph-actions">
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon>新增卡片</el-button>
        <el-button :loading="loading" @click="loadData"><el-icon><Refresh /></el-icon></el-button>
      </div>
    </div>

    <!-- 汇总卡片 -->
    <div class="ast-summary">
      <div class="ast-summary-card">
        <span class="ast-summary-label">资产总数</span>
        <span class="ast-summary-value">{{ stats.cnt }} 项</span>
      </div>
      <div class="ast-summary-card">
        <span class="ast-summary-label">原值合计</span>
        <span class="ast-summary-value">¥{{ formatMoney(stats.totalOriginal) }}</span>
      </div>
      <div class="ast-summary-card">
        <span class="ast-summary-label">累计折旧</span>
        <span class="ast-summary-value">¥{{ formatMoney(stats.totalDep) }}</span>
      </div>
      <div class="ast-summary-card">
        <span class="ast-summary-label">净值合计</span>
        <span class="ast-summary-value ast-summary-net">¥{{ formatMoney(stats.totalNet) }}</span>
      </div>
    </div>

    <!-- 过滤栏 -->
    <div class="ast-filter">
      <el-select v-model="filterStatus" size="small" style="width:130px" clearable placeholder="全部状态" @change="loadData">
        <el-option label="在用" value="在用" />
        <el-option label="已提足折旧" value="已提足折旧" />
        <el-option label="报废" value="报废" />
        <el-option label="已处置" value="已处置" />
      </el-select>
      <el-select v-model="filterCategory" size="small" style="width:130px;margin-left:8px" clearable placeholder="全部类别" @change="loadData">
        <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
      </el-select>
    </div>

    <!-- 数据表格 -->
    <div class="panel" v-loading="loading">
      <el-table :data="assets" border stripe size="small" :max-height="450" style="width:100%">
        <el-table-column prop="asset_code" label="资产编码" width="100" />
        <el-table-column prop="asset_name" label="资产名称" min-width="130" show-overflow-tooltip />
        <el-table-column prop="category" label="类别" width="90" />
        <el-table-column prop="buy_date" label="购入日期" width="105" align="center" />
        <el-table-column label="原值" width="110" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.original_value) }}</template>
        </el-table-column>
        <el-table-column label="月折旧额" width="100" align="right">
          <template #default="{ row }">{{ formatMoney(row.monthly_depreciation) }}</template>
        </el-table-column>
        <el-table-column label="累计折旧" width="110" align="right">
          <template #default="{ row }">¥{{ formatMoney(row.accumulated_depreciation) }}</template>
        </el-table-column>
        <el-table-column label="净值" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ 'ast-net-warn': row.net_value <= 0 }">¥{{ formatMoney(row.net_value) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="department" label="使用部门" width="100" />
        <el-table-column label="状态" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="statusTag(row.status)" size="small">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link type="primary" @click="openEdit(row)"><el-icon><Edit /></el-icon></el-button>
            <el-button v-if="row.status === '在用'" size="small" link type="success" @click="handleDepreciate(row)" title="计提折旧"><el-icon><Coin /></el-icon></el-button>
            <el-popconfirm title="确定删除？" @confirm="handleDelete(row)">
              <template #reference>
                <el-button size="small" link type="danger"><el-icon><Delete /></el-icon></el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && assets.length === 0" description="暂无固定资产卡片" :image-size="80" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="dialogOpen" :title="dialogMode === 'create' ? '新增固定资产' : '编辑固定资产'" width="520px" top="6vh" :close-on-click-modal="false" destroy-on-close>
      <el-form label-width="90px" size="small">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="资产编码"><el-input v-model="form.assetCode" placeholder="可选" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="资产名称" required><el-input v-model="form.assetName" placeholder="如 ThinkPad X1" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="类别"><el-select v-model="form.category" style="width:100%"><el-option v-for="c in categories" :key="c" :label="c" :value="c" /></el-select></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="购入日期"><el-date-picker v-model="form.buyDate" type="date" style="width:100%" format="YYYY-MM-DD" value-format="YYYY-MM-DD" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="原值" required><el-input-number v-model="form.originalValue" :min="0" :step="1000" style="width:100%" controls-position="right" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="残值率"><el-input-number v-model="form.residualRate" :min="0" :max="0.5" :step="0.01" :precision="2" style="width:100%" controls-position="right" /></el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="使用年限"><el-input-number v-model="form.usefulLifeYears" :min="1" :max="100" :step="1" style="width:100%" controls-position="right" /></el-form-item>
          </el-col>
        </el-row>
        <div class="ast-dep-preview">
          月折旧额 = {{ form.originalValue.toFixed(2) }} × (1 - {{ form.residualRate }}) ÷ ({{ form.usefulLifeYears }} × 12) = <strong>¥{{ formatMoney(previewMonthlyDep) }}</strong>
        </div>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="使用部门"><el-input v-model="form.department" placeholder="如 财务部" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态"><el-select v-model="form.status" style="width:100%" :disabled="dialogMode === 'create'"><el-option label="在用" value="在用" /><el-option label="已提足折旧" value="已提足折旧" /><el-option label="报废" value="报废" /><el-option label="已处置" value="已处置" /></el-select></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogOpen = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ast-page { display: flex; flex-direction: column; gap: 16px; }

.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.ph-title { margin: 0; font-size: 20px; font-weight: 700; color: var(--epp-ink-text); }
.ph-desc { margin: 4px 0 0; font-size: 13px; color: var(--epp-ink-sub); }
.ph-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

/* 汇总卡片 */
.ast-summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.ast-summary-card {
  background: var(--epp-paper); border: 1px solid var(--epp-line-light);
  border-radius: 4px; padding: 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.ast-summary-label { font-size: 12px; color: var(--epp-ink-sub); }
.ast-summary-value { font-size: 18px; font-weight: 700; color: var(--epp-ink-text); }
.ast-summary-net { color: var(--epp-gold); }

.ast-filter { display: flex; align-items: center; }

.panel {
  background: var(--epp-paper); border-radius: 2px;
  border: 1px solid var(--epp-line-light);
  overflow: hidden;
}

.ast-dep-preview {
  padding: 8px 12px; margin: 0 0 16px 0;
  background: #f8fafc; border: 1px solid var(--epp-line-light);
  border-radius: 4px; font-size: 13px; color: var(--epp-ink-sub);
}
.ast-dep-preview strong { color: var(--epp-accent); }

.ast-net-warn { color: var(--epp-danger); font-weight: 600; }
</style>
