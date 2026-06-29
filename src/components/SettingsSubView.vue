<script setup lang="ts">
// ponytail: SettingsSubView — 系统设置子视图（由 SettingsView 通过 provide/inject 注入状态）
import { inject } from 'vue';
import {
  Plus, Edit, Tickets, FolderOpened, Download, RefreshRight, Coin,
  View, Clock, Collection,
} from '@element-plus/icons-vue';
import ClosingView from '../views/ClosingView.vue';

const state = inject<any>('settingsState')!;
</script>

<template>
  <!-- ===== 账套管理 ===== -->
  <div v-if="state.activeMenu === 'accounts'" class="sp-accounts-page">
    <div class="sp-panel">
      <div class="sp-panel-header">
        <div class="sp-panel-title-line"></div><span>账套列表</span>
        <el-button size="small" type="primary" style="margin-left:auto" @click="state.handleCreateCompany"><el-icon><Plus /></el-icon>新增账套</el-button>
      </div>
      <div class="sp-panel-body">
        <div class="ck-list">
          <div v-for="row in state.companies" :key="row.id" class="ck-item" :class="row.id === state.company?.id ? 'ck-item--pass' : ''">
            <div class="ck-body">
              <div class="ck-name">
                <span :class="{ 'sp-current-name': row.id === state.company?.id }">{{ row.name }}</span>
                <el-tag v-if="row.id === state.company?.id" size="small" type="primary" effect="dark" style="margin-left:6px">当前</el-tag>
              </div>
              <div class="ck-detail">
                <span>期间 {{ row.period || '—' }}</span>
                <span v-if="row.contactPerson">· 联系人 {{ row.contactPerson }}</span>
                <span v-if="row.legalRepresentative">· 法人 {{ row.legalRepresentative }}</span>
                <span class="ck-detail-text">· {{ row.createdAt?.slice(0,10) || '' }}</span>
              </div>
            </div>
            <div class="ck-actions">
              <el-button size="small" text type="primary" @click="state.openEditCompany(row)">编辑</el-button>
              <el-button v-if="state.isAdmin" size="small" text type="danger" :disabled="row.id === state.company?.id" @click="state.openDeleteConfirm(row)">删除</el-button>
            </div>
          </div>
          <el-empty v-if="!state.companies.length" description="暂无账套数据" :image-size="80" />
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 凭证字 ===== -->
  <div v-else-if="state.activeMenu === 'voucherWords'" class="sp-panel">
    <div class="sp-panel-header">
      <div class="sp-panel-title-line"></div><span>凭证字列表</span>
      <span class="sp-panel-subtitle">全局凭证字号设置，当前账套所有凭证共用</span>
      <el-button size="small" type="primary" style="margin-left:auto" @click="state.openCreateVw"><el-icon><Plus /></el-icon>新增凭证字</el-button>
    </div>
    <div class="sp-panel-body">
      <div class="ck-list" v-loading="state.vwLoading">
        <div v-for="row in state.voucherWords" :key="row.id" class="ck-item" :class="row.is_default ? 'ck-item--pass' : ''">
          <div class="ck-body">
            <div class="ck-name vw-card-word">{{ row.word }}</div>
            <div class="ck-desc">打印标题：{{ row.print_title || '—' }}</div>
          </div>
          <div class="ck-actions">
            <el-radio :model-value="row.is_default" :value="1" size="small" @change="state.handleSetDefaultVw(row)" :disabled="row.is_default===1">
              {{ row.is_default===1 ? '默认' : '设为默认' }}
            </el-radio>
            <el-button size="small" text type="primary" @click="state.openEditVw(row)">编辑</el-button>
            <el-button size="small" text type="danger" @click="state.handleDeleteVw(row)">删除</el-button>
          </div>
        </div>
        <el-empty v-if="!state.voucherWords.length && !state.vwLoading" description="暂无凭证字" :image-size="80" />
      </div>
    </div>
  </div>

  <!-- ===== 辅助核算 ===== -->
  <div v-else-if="state.activeMenu === 'auxProjects'" class="sp-panel">
    <div class="sp-panel-header">
      <div class="sp-panel-title-line"></div><span>辅助核算类别</span>
      <span class="sp-panel-subtitle">管理辅助核算类别及其项目值，用于科目的辅助核算关联</span>
      <el-button size="small" type="primary" style="margin-left:auto" @click="state.openCreateAuxType"><el-icon><Plus /></el-icon>新增类别</el-button>
    </div>
    <div class="sp-panel-body" style="padding:12px 22px">
      <div class="aux-layout" v-loading="state.auxTypesLoading">
        <!-- 左侧：类别列表 -->
        <div class="aux-left">
          <div class="ck-list">
            <div
              v-for="t in state.auxTypes"
              :key="t.id"
              class="ck-item aux-type-item"
              :class="state.selectedAuxType?.id === t.id ? 'ck-item--pass' : ''"
              @click="state.selectAuxType(t)"
              style="cursor:pointer"
            >
              <div class="ck-body">
                <div class="ck-name">{{ t.name }}</div>
                <div class="ck-desc">编码：{{ t.code }}</div>
              </div>
              <div class="ck-actions" @click.stop style="gap:4px">
                <el-button size="small" text type="primary" @click="state.openEditAuxType(t)">编辑</el-button>
                <el-button size="small" text type="danger" @click="state.deleteAuxType(t)">删除</el-button>
              </div>
            </div>
            <el-empty v-if="!state.auxTypes.length && !state.auxTypesLoading" description="暂无辅助核算类别" :image-size="60" />
          </div>
        </div>
        <!-- 右侧：项目值列表 -->
        <div class="aux-right">
          <div v-if="state.selectedAuxType" class="aux-values-section">
            <div class="aux-values-header">
              <span class="aux-values-title">{{ state.selectedAuxType.name }} — 项目列表</span>
              <el-button size="small" type="primary" @click="state.openCreateAuxValue"><el-icon><Plus /></el-icon>新增项目</el-button>
            </div>
            <div class="ck-list" style="margin-top:8px">
              <div v-for="v in state.auxValues" :key="v.id" class="ck-item" :class="v.enabled ? '' : 'ck-item--warn'">
                <div class="ck-body">
                  <div class="ck-name">{{ v.name }}</div>
                  <div class="ck-desc">编码：{{ v.code }}</div>
                </div>
                <div class="ck-actions" style="gap:4px">
                  <el-button size="small" text type="primary" @click="state.openEditAuxValue(v)">编辑</el-button>
                  <el-button size="small" text type="danger" @click="state.deleteAuxValue(v)">删除</el-button>
                </div>
              </div>
              <el-empty v-if="!state.auxValues.length" description="暂无核算项目" :image-size="60" />
            </div>
          </div>
          <div v-else class="aux-placeholder">
            <el-icon :size="32"><Collection /></el-icon>
            <span>请从左侧选择一个辅助核算类别</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 期间管理（结账） ===== -->
  <div v-else-if="state.activeMenu === 'periods'" class="sp-panel">
    <div class="sp-panel-header">
      <div class="sp-panel-title-line"></div><span>全年会计期间</span>
    </div>
    <div class="sp-panel-body">
      <ClosingView />
    </div>
  </div>

  <!-- ===== 用户管理 ===== -->
  <div v-else-if="state.activeMenu === 'users'" class="sp-panel">
    <div class="sp-panel-header">
      <div class="sp-panel-title-line"></div><span>用户列表</span>
      <el-button size="small" type="primary" style="margin-left:auto" @click="state.openCreateUser"><el-icon><Plus /></el-icon>新增用户</el-button>
    </div>
    <div class="sp-panel-body">
      <div class="ck-list">
        <div v-for="row in state.users" :key="row.id" class="ck-item" :class="row.enabled ? '' : 'ck-item--warn'">
          <div class="ck-body">
            <div class="ck-name">
              {{ row.username }}
              <span v-if="row.alias" class="ck-desc">— {{ row.alias }}</span>
            </div>
            <div class="ck-detail">
              <el-tag size="small" :type="row.role==='admin'?'danger':row.role==='auditor'?'warning':'info'">
                {{ ({admin:'管理员',accountant:'会计',auditor:'审计员',viewer:'查看者'} as Record<string, string>)[row.role]||row.role }}
              </el-tag>
              <span class="ck-detail-text">{{ row.createdAt?.slice(0,10) || '' }}</span>
            </div>
          </div>
          <div class="ck-actions">
            <el-switch
              v-if="row.role!=='admin'"
              :model-value="row.enabled === 1"
              size="small"
              @change="state.handleToggleUser(row)"
            />
            <span v-else class="sp-disabled-hint" style="font-size:11px;color:var(--epp-ink-sub)">系统保留</span>
            <el-button size="small" text type="primary" @click="state.openEditUser(row)">编辑</el-button>
            <el-button size="small" text type="warning" @click="state.openResetPassword(row)">修改密码</el-button>
          </div>
        </div>
        <el-empty v-if="!state.users.length" description="暂无用户数据" :image-size="80" />
      </div>
    </div>
  </div>

  <!-- ===== 操作日志 ===== -->
  <div v-else-if="state.activeMenu === 'opLogs'" class="sp-panel">
    <div class="sp-panel-header">
      <div class="sp-panel-title-line" style="background:var(--epp-accent)"></div>
      <span>操作日志</span>
      <span class="sp-panel-subtitle">记录系统关键操作，最多保留 500 条</span>
    </div>
    <div class="sp-panel-body">
      <div class="oplog-filter">
        <div class="oplog-filter-left">
          <el-date-picker
            v-model="state.opLogDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            size="small"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width:260px"
            :clearable="true"
            @change="state.loadOpLogs"
          />
          <el-select v-model="state.opLogLimit" size="small" style="width:110px" @change="state.loadOpLogs">
            <el-option :value="30" label="最近30条" />
            <el-option :value="50" label="最近50条" />
            <el-option :value="100" label="最近100条" />
            <el-option :value="200" label="最近200条" />
          </el-select>
        </div>
        <div class="oplog-filter-right">
          <el-button size="small" @click="state.exportOpLogs"><el-icon><Download /></el-icon>导出Excel</el-button>
          <el-button size="small" text @click="state.resetOpLogFilter"><el-icon><RefreshRight /></el-icon>重置</el-button>
          <span class="oplog-count">共 {{ state.opLogs.length }} 条</span>
        </div>
      </div>

      <div class="oplog-list" v-loading="state.opLogsLoading">
        <div v-for="log in state.opLogs" :key="log.id" class="oplog-item">
          <div class="oplog-icon">
            <el-icon :size="18">
              <Clock v-if="log.action.includes('结账')" />
              <Edit v-else-if="log.action.includes('创建') || log.action.includes('添加')" />
              <View v-else-if="log.action.includes('审核')" />
              <Download v-else-if="log.action.includes('过账')" />
              <Tickets v-else />
            </el-icon>
          </div>
          <div class="oplog-body">
            <div class="oplog-line1">
              <el-tag :type="state.actionTagType(log.action)" size="small" effect="plain" disable-transitions>
                {{ state.actionLabel(log.action) }}
              </el-tag>
              <span class="oplog-target">{{ log.target }}</span>
            </div>
            <div class="oplog-line2">
              <span class="oplog-detail">{{ log.detail }}</span>
              <span class="oplog-sep">·</span>
              <span class="oplog-user">{{ log.username }}</span>
              <span class="oplog-sep">·</span>
              <span class="oplog-time">{{ log.createdAt.replace('T', ' ').substring(0, 19) }}</span>
            </div>
          </div>
        </div>
        <el-empty v-if="!state.opLogs.length && !state.opLogsLoading" description="暂无操作日志" :image-size="60" />
      </div>
    </div>
  </div>

  <!-- ===== 数据管理 ===== -->
  <div v-else-if="state.activeMenu === 'dataManage'" class="sp-data-grid">
    <div class="sp-panel sp-data-panel">
      <div class="sp-panel-header"><div class="sp-panel-title-line" style="background:var(--epp-gold)"></div><span>数据库信息</span><el-button size="small" text style="margin-left:auto" :loading="state.dbLoading" @click="state.loadDbInfo"><el-icon><RefreshRight /></el-icon>刷新</el-button></div>
      <div class="sp-panel-body" v-loading="state.dbLoading">
        <div class="db-info-grid">
          <div class="db-info-item"><span class="db-info-label">数据库路径</span><span class="db-info-value db-info-path">{{ (state.dbInfo?.dbPath || '—').replace(/\\/g,'\\') }}</span></div>
          <div class="db-info-item"><span class="db-info-label">文件大小</span><span class="db-info-value">{{ state.dbInfo ? state.formatFileSize(state.dbInfo.dbSize) : '—' }}</span></div>
          <div class="db-info-item"><span class="db-info-label">数据页数</span><span class="db-info-value">{{ state.dbInfo?.pageCount||'—' }}</span></div>
          <div class="db-info-item"><span class="db-info-label">空闲页数</span><span class="db-info-value">{{ state.dbInfo?.freelistCount||'—' }}</span></div>
        </div>
        <div v-if="state.dbInfo?.tableCounts&&Object.keys(state.dbInfo.tableCounts).length" class="db-table-stats">
          <div class="db-table-stats-title">各表记录数</div>
          <div class="db-table-stats-list"><span v-for="(cnt,name) in state.dbInfo.tableCounts" :key="name" class="db-table-stat-chip"><code>{{ name }}</code> {{ cnt }}</span></div>
        </div>
        <div v-if="!state.dbInfo" class="sp-empty-hint"><el-icon><Coin /></el-icon><span>点击右上角刷新按钮加载数据库信息</span></div>
      </div>
    </div>
    <div class="sp-panel sp-data-panel">
      <div class="sp-panel-header"><div class="sp-panel-title-line" style="background:#e6a23c"></div><span>数据库整理</span></div>
      <div class="sp-panel-body">
        <p class="sp-data-desc">数据库在长期使用后会产生碎片，导致文件增大、性能下降。执行整理可重组数据库结构、回收空间，提升查询效率。</p>
        <p class="sp-data-warn"><strong>提示：</strong>建议先备份数据库再执行整理，整理过程中请勿关闭程序。</p>
        <el-button type="warning" :loading="state.vacuuming" :icon="RefreshRight" @click="state.handleVacuum">{{ state.vacuuming?'正在整理...':'开始整理 (VACUUM)' }}</el-button>
      </div>
    </div>
    <div class="sp-panel sp-data-panel">
      <div class="sp-panel-header"><div class="sp-panel-title-line" style="background:#10b981"></div><span>备份与导出</span></div>
      <div class="sp-panel-body">
        <div class="db-actions">
          <div class="db-action-card">
            <div class="db-action-icon" style="background:rgba(16,185,129,0.1);color:#10b981"><el-icon :size="24"><FolderOpened /></el-icon></div>
            <div class="db-action-body"><div class="db-action-title">备份数据库</div><div class="db-action-desc">将整个 SQLite 数据库文件复制到指定位置，作为完整备份</div></div>
            <el-button type="primary" plain :loading="state.backingUp" @click="state.handleBackup">{{ state.backingUp?'备份中...':'备份' }}</el-button>
          </div>
          <div class="db-action-card">
            <div class="db-action-icon" style="background:rgba(99,102,241,0.1);color:#6366f1"><el-icon :size="24"><Download /></el-icon></div>
            <div class="db-action-body"><div class="db-action-title">导出数据 (JSON)</div><div class="db-action-desc">将所有表数据导出为 JSON 格式文件，可用于迁移或数据分析</div></div>
            <el-button type="primary" plain :loading="state.exporting" @click="state.handleExportJson">{{ state.exporting?'导出中...':'导出' }}</el-button>
          </div>
          <div class="db-action-card">
            <div class="db-action-icon" style="background:rgba(234,179,8,0.1);color:#eab308"><el-icon :size="24"><FolderOpened /></el-icon></div>
            <div class="db-action-body"><div class="db-action-title">全量导出备份</div><div class="db-action-desc">将数据库文件及所有附件完整打包导出，可用于完整迁移或灾难恢复</div></div>
            <el-button type="primary" plain :loading="state.exporting" @click="state.handleExportAll">{{ state.exporting?'导出中...':'导出' }}</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== 系统信息 ===== -->
  <div v-else-if="state.activeMenu === 'system'" class="sp-panel">
    <div class="sp-panel-header"><div class="sp-panel-title-line"></div><span>系统信息</span></div>
    <div class="sp-panel-body">
      <el-descriptions :column="1" border size="small" class="sp-desc">
        <el-descriptions-item label="应用名称">ERP 外账系统</el-descriptions-item>
        <el-descriptions-item label="版本号">v1.0.0</el-descriptions-item>
        <el-descriptions-item label="技术栈">Vue 3 + Element Plus + Electron + SQLite</el-descriptions-item>
        <el-descriptions-item label="运行环境">
          <el-tag size="small" type="success" effect="dark">Electron 桌面端</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="路由模式">Hash 模式 (适配 file:// 协议)</el-descriptions-item>
        <el-descriptions-item label="数据存储">SQLite 本地数据库 (Rabbit_ERP.db)</el-descriptions-item>
      </el-descriptions>
    </div>
  </div>
</template>

<style scoped>
/* ================================================================
   SettingsSubView — 子视图内容样式（从 SettingsView 迁移）
   设计方向：物理账簿质感 → 深墨蓝权威 / 烫金强调 / 账簿纸温润
   ================================================================ */

/* ---- 内容面板 — 账簿纸质感 ---- */
.sp-panel {
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 2px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.sp-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 22px;
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  border-bottom: 1px solid var(--epp-line);
  letter-spacing: 0.3px;
}

/* 面板标题左侧装饰线 — 账簿分隔线风格 */
.sp-panel-title-line {
  width: 3px;
  height: 17px;
  border-radius: 1px;
  background: var(--epp-gold);
  flex-shrink: 0;
}

.sp-panel-subtitle {
  font-size: 12px;
  font-weight: 400;
  color: var(--epp-ink-sub);
  letter-spacing: 0.5px;
}

.sp-panel-body {
  padding: 22px;
}

/* ---- el-descriptions — 账簿标签格 ---- */
.sp-desc :deep(.el-descriptions__label) {
  background: #f1f5f9;
  font-weight: 500;
  color: var(--epp-ink-sub);
  width: 120px;
  font-size: 13px;
}

.sp-desc :deep(.el-descriptions__content) {
  color: var(--epp-ink-text);
  font-size: 13px;
}

.sp-desc :deep(.el-descriptions__body) {
  border-color: var(--epp-line-light);
}

/* ---- 表格 — 账簿栏线条纹 ---- */
.sp-panel-body :deep(.el-table) {
  --el-table-border-color: var(--epp-line-light);
  --el-table-header-bg-color: #f1f5f9;
  --el-table-row-hover-bg-color: #f8fafc;
  --el-table-current-row-bg-color: #eef2ff;
}

.sp-panel-body :deep(.el-table th.el-table__cell) {
  background: #f1f5f9 !important;
  color: var(--epp-ink-sub) !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  letter-spacing: 0.4px;
  border-color: var(--epp-line-light) !important;
}

.sp-panel-body :deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: #f8fafc;
}

.sp-panel-body :deep(.el-table td.el-table__cell) {
  border-color: var(--epp-line-light);
  color: var(--epp-ink-text);
  font-size: 13px;
}

/* ---- Element Plus 深度覆盖 — 按钮 / 标签 ---- */
.sp-panel-body :deep(.el-button--primary),
.sp-basic-card :deep(.el-button--primary),
:deep(.el-button--primary) {
  --el-button-bg-color: var(--epp-success);
  --el-button-border-color: var(--epp-success);
  --el-button-hover-bg-color: #059669;
  --el-button-hover-border-color: #059669;
  --el-button-active-bg-color: #047857;
  --el-button-active-border-color: #047857;
  --el-button-disabled-bg-color: var(--el-disabled-bg-color);
  --el-button-disabled-border-color: var(--el-border-color-lighter);
  --el-button-disabled-text-color: var(--el-disabled-text-color);
}

.sp-panel :deep(.el-button--primary.is-plain),
.sp-basic-card :deep(.el-button--primary.is-plain) {
  --el-button-bg-color: rgba(8, 145, 178, 0.06);
  --el-button-border-color: var(--epp-accent);
  --el-button-text-color: var(--epp-accent);
  --el-button-hover-bg-color: rgba(8, 145, 178, 0.12);
  --el-button-hover-border-color: var(--epp-accent-light);
  --el-button-hover-text-color: var(--epp-accent);
}

:deep(.el-tag--primary) {
  --el-tag-bg-color: rgba(10, 30, 61, 0.08);
  --el-tag-border-color: rgba(10, 30, 61, 0.15);
  --el-tag-text-color: var(--epp-ink);
}

:deep(.el-tag--success) {
  --el-tag-bg-color: rgba(82, 196, 26, 0.08);
  --el-tag-text-color: #3a8c1a;
}

:deep(.el-input__inner) {
  border-radius: 2px;
}

:deep(.el-input__inner:focus) {
  border-color: var(--epp-gold);
}

:deep(.el-select .el-input__inner:focus) {
  border-color: var(--epp-gold);
}

/* ---- 杂项 ---- */
.sp-current-name {
  font-weight: 700;
  color: var(--epp-ink);
}

.sp-form-readonly {
  color: var(--epp-ink-text);
  font-weight: 600;
  font-size: 14px;
}

.sp-disabled-hint {
  color: var(--epp-ink-sub);
  font-size: 13px;
}

/* ---- 凭证字卡片 ---- */
.vw-card-word {
  font-size: 22px;
  font-weight: 700;
  color: var(--epp-ink);
  font-family: 'KaiTi', 'STKaiti', '楷体', serif;
  letter-spacing: 2px;
}

.form-hint-sm {
  font-size: 11px;
  color: #909399;
  margin-top: 4px;
}

/* ---- ck-* 通用检查项卡片样式 ---- */
.ck-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ck-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
  border: 1px solid var(--epp-line-light);
  border-radius: 6px;
  background: var(--epp-paper);
  transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
}

.ck-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 1px 4px rgba(10, 30, 61, 0.05);
}

.ck-item--pass {
  border-color: #a7f3d0;
  background: #f0fdf4;
}

.ck-item--fail {
  border-color: #fecaca;
  background: #fef2f2;
}

.ck-item--warn {
  border-color: #fde68a;
  background: #fffbeb;
}

.ck-body {
  flex: 1;
  min-width: 0;
}

.ck-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
}

.ck-desc {
  font-weight: 400;
  font-size: 12px;
  color: var(--epp-ink-sub);
}

.ck-detail {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--epp-ink-sub);
}

.ck-detail-text {
  color: var(--epp-ink-sub);
}

.ck-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* ---- 数据管理页 ---- */
.sp-data-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.db-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.db-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid var(--epp-line-light);
}

.db-info-label {
  font-size: 11px;
  color: var(--epp-ink-sub);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.db-info-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--epp-ink-text);
  word-break: break-all;
}

.db-info-path {
  font-size: 11px;
  font-family: 'Courier New', monospace;
}

.db-table-stats {
  margin-top: 8px;
  padding: 12px 14px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid var(--epp-line-light);
}

.db-table-stats-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--epp-ink-sub);
  margin-bottom: 8px;
}

.db-table-stats-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.db-table-stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 3px;
  font-size: 12px;
  color: var(--epp-ink-text);
}

.db-table-stat-chip code {
  font-size: 11px;
  color: var(--epp-ink-sub);
  background: none;
}

.sp-empty-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  font-size: 13px;
  color: #909399;
}

.sp-data-desc {
  font-size: 13px;
  color: var(--epp-ink-sub);
  line-height: 1.7;
  margin: 0 0 10px;
}

.sp-data-warn {
  font-size: 12px;
  color: #e6a23c;
  padding: 8px 12px;
  background: rgba(230, 162, 60, 0.06);
  border-radius: 4px;
  margin-bottom: 14px;
  line-height: 1.6;
}

.db-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.db-action-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid var(--epp-line-light);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.db-action-card:hover {
  border-color: var(--epp-line);
  box-shadow: 0 1px 6px rgba(0,0,0,0.04);
}

.db-action-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.db-action-body {
  flex: 1;
  min-width: 0;
}

.db-action-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
  margin-bottom: 4px;
}

.db-action-desc {
  font-size: 12px;
  color: var(--epp-ink-sub);
  line-height: 1.5;
}

/* ---- 基础信息 — 双列卡片布局 ---- */
.sp-basic-grid {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  align-items: start;
}

.sp-basic-card {
  background: var(--epp-paper);
  border: 1px solid var(--epp-line-light);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: box-shadow 0.25s, border-color 0.25s;
}

.sp-basic-card:hover {
  border-color: var(--epp-line);
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.06);
}

.sp-bc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--epp-line-light);
  background: linear-gradient(180deg, #fafbfc 0%, #f8fafc 100%);
}

.sp-bc-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sp-bc-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 145, 178, 0.1);
  color: var(--epp-accent);
}

.sp-bc-icon--user {
  background: rgba(99, 102, 241, 0.1);
  color: #6366f1;
}

.sp-bc-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--epp-ink-text);
  letter-spacing: 0.3px;
}

.sp-bc-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sp-bc-edit-btn {
  transition: all 0.2s;
}

.sp-bc-body {
  padding: 20px;
}

.sp-bc-body--edit {
  padding: 16px 20px 20px;
}

.sp-bc-body--user {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ---- Key-Value 信息展示 ---- */
.sp-kv-section {
  margin-bottom: 18px;
}

.sp-kv-section:last-child {
  margin-bottom: 0;
}

.sp-kv-section--compact {
  margin-bottom: 14px;
}

.sp-kv-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--epp-ink-sub);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px dashed var(--epp-line-light);
}

.sp-kv-row {
  display: flex;
  align-items: center;
  padding: 7px 0;
}

.sp-kv-label {
  width: 90px;
  min-width: 90px;
  font-size: 13px;
  color: var(--epp-ink-sub);
  letter-spacing: 0.3px;
}

.sp-kv-value {
  font-size: 13px;
  color: var(--epp-ink-text);
  word-break: break-all;
}

.sp-kv-value--strong {
  font-weight: 600;
  font-size: 14px;
}

.sp-kv-value--mono {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.sp-user-avatar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--epp-line-light);
}

.sp-user-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: #fff;
  font-size: 22px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 1px;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}

.sp-user-avatar-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sp-user-avatar-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--epp-ink-text);
}

.sp-user-actions {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--epp-line-light);
  display: flex;
  justify-content: center;
}

.sp-pwd-btn {
  width: 100%;
  justify-content: center;
  color: var(--epp-ink-sub);
  border-color: var(--epp-line);
  transition: all 0.2s;
}

.sp-pwd-btn:hover {
  color: var(--epp-accent);
  border-color: var(--epp-accent);
  background: rgba(8, 145, 178, 0.04);
}

.sp-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.sp-company-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.sp-company-form :deep(.el-form-item__label) {
  font-size: 12px;
  font-weight: 500;
  color: var(--epp-ink-sub);
  padding-bottom: 4px;
}

.sp-company-form :deep(.el-input__inner) {
  border-radius: 4px;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.sp-company-form :deep(.el-input__inner:focus) {
  border-color: var(--epp-accent);
  box-shadow: 0 0 0 1px rgba(8, 145, 178, 0.15);
}

/* ---- 操作日志面板 ---- */
.oplog-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 16px;
  padding: 10px 14px;
  background: #f8fafc;
  border-radius: 4px;
  border: 1px solid var(--epp-line-light);
  flex-wrap: wrap;
}
.oplog-filter-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.oplog-filter-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.oplog-count {
  font-size: 12px;
  color: var(--epp-ink-sub);
  font-weight: 500;
}

.oplog-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 500px;
  overflow-y: auto;
}
.oplog-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: background 0.15s, border-color 0.15s;
}
.oplog-item:hover {
  background: #f8fafc;
  border-color: var(--epp-line-light);
}
.oplog-icon {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--epp-ink-sub);
}
.oplog-body {
  flex: 1;
  min-width: 0;
}
.oplog-line1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.oplog-target {
  font-size: 13px;
  font-weight: 600;
  color: var(--epp-ink-text);
}
.oplog-line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--epp-ink-sub);
  flex-wrap: wrap;
}
.oplog-user {
  font-weight: 500;
}
.oplog-time {
  font-family: 'SF Mono', 'Consolas', monospace;
  font-size: 11px;
}
.oplog-sep {
  color: #cbd5e1;
}

/* ---- 辅助核算双栏布局 ---- */
.aux-layout {
  display: flex;
  gap: 16px;
  min-height: 280px;
}

.aux-left {
  width: 300px;
  min-width: 300px;
  flex-shrink: 0;
  border-right: 1px solid var(--epp-line-light);
  padding-right: 16px;
  overflow-y: auto;
}

.aux-type-item {
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.aux-type-item:hover {
  border-color: var(--epp-accent);
}

.aux-right {
  flex: 1;
  min-width: 0;
}

.aux-values-section {
  display: flex;
  flex-direction: column;
}

.aux-values-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--epp-line-light);
}

.aux-values-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--epp-ink-text);
}

.aux-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  min-height: 200px;
  color: var(--epp-ink-sub);
  font-size: 13px;
}

/* ---- 响应式 ---- */
@media (max-width: 780px) {
  .sp-basic-grid {
    grid-template-columns: 1fr;
  }
  .aux-layout {
    flex-direction: column;
  }
  .aux-left {
    width: 100%;
    min-width: unset;
    border-right: none;
    padding-right: 0;
    border-bottom: 1px solid var(--epp-line-light);
    padding-bottom: 12px;
    max-height: 200px;
  }
}
</style>
