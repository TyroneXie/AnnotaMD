<template>
  <header class="annotamd-agent-header">
    <div class="annotamd-agent-title">
      <span class="annotamd-agent-title-dot" :class="`is-${status}`" aria-hidden="true" />
      <strong :title="title">{{ title }}</strong>
    </div>
    <div class="annotamd-agent-actions">
      <el-tooltip :content="t('annotamd.agentWorkspace.newSession')" placement="bottom" :show-after="150">
        <span class="annotamd-agent-tooltip-anchor">
          <button
            type="button"
            class="annotamd-agent-icon-button"
            data-testid="ai-new-session"
            :aria-label="t('annotamd.agentWorkspace.newSession')"
            :disabled="newDisabled"
            @click="emit('new')"
          >
            <el-icon><Plus /></el-icon>
          </button>
        </span>
      </el-tooltip>
      <AgentConversationHistory
        :new-disabled="newDisabled"
        @new="emit('new')"
        @select="emit('select-conversation', $event)"
        @delete="emit('delete-conversation', $event)"
        @stop="emit('stop-conversation', $event)"
      />
      <el-tooltip :content="t('annotamd.agentWorkspace.deleteConversation')" placement="bottom" :show-after="150">
        <span class="annotamd-agent-tooltip-anchor">
          <button
            type="button"
            class="annotamd-agent-icon-button"
            data-testid="ai-delete-current"
            :aria-label="t('annotamd.agentWorkspace.deleteConversation')"
            :disabled="deleteDisabled"
            @click="emit('delete-current')"
          >
            <el-icon><Delete /></el-icon>
          </button>
        </span>
      </el-tooltip>
      <el-tooltip :content="t('annotamd.agentWorkspace.close')" placement="bottom" :show-after="150">
        <span class="annotamd-agent-tooltip-anchor">
          <button
            type="button"
            class="annotamd-agent-icon-button"
            data-testid="ai-close"
            :aria-label="t('annotamd.agentWorkspace.close')"
            @click="emit('close')"
          >
            <el-icon><Close /></el-icon>
          </button>
        </span>
      </el-tooltip>
    </div>
  </header>
</template>

<script setup lang="ts">
import {
  Close,
  Delete,
  Plus
} from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import AgentConversationHistory from './AgentConversationHistory.vue'

defineProps<{
  title: string
  status: string
  newDisabled: boolean
  deleteDisabled: boolean
}>()

const emit = defineEmits<{
  new: []
  'select-conversation': [id: string]
  'delete-conversation': [id: string]
  'stop-conversation': [id: string]
  'delete-current': []
  close: []
}>()
const { t } = useI18n()
</script>

<style scoped>
.annotamd-agent-header { position: relative; z-index: 1; display: flex; flex: 0 0 var(--annotamd-editor-tab-height, 28px); align-items: center; justify-content: space-between; gap: 12px; box-sizing: border-box; height: var(--annotamd-editor-tab-height, 28px); min-height: var(--annotamd-editor-tab-height, 28px); padding: 0 12px; background: var(--annotamd-surface-soft); box-shadow: 0 0 9px 2px rgb(0 0 0 / 10%); }
.annotamd-agent-title, .annotamd-agent-actions { display: inline-flex; min-width: 0; align-items: center; }
.annotamd-agent-title { gap: 6px; }
.annotamd-agent-title-dot { width: 7px; height: 7px; flex: none; border-radius: 50%; background: #94a3b8; }
.annotamd-agent-title-dot.is-ready { background: #22c55e; }
.annotamd-agent-title-dot.is-running { background: var(--annotamd-blue); box-shadow: 0 0 0 3px color-mix(in srgb, var(--annotamd-blue) 18%, transparent); }
.annotamd-agent-title-dot.is-error, .annotamd-agent-title-dot.is-incompatible { background: #ef4444; }
.annotamd-agent-title strong { max-width: 160px; overflow: hidden; color: var(--annotamd-ink); font-size: 14px; font-weight: 650; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-actions { gap: 4px; }
.annotamd-agent-tooltip-anchor { display: inline-flex; }
.annotamd-agent-icon-button { display: grid; width: 26px; height: 26px; padding: 0; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 7px; background: transparent; cursor: pointer; }
.annotamd-agent-icon-button:hover:not(:disabled) { color: var(--annotamd-text); background: var(--annotamd-fill-soft); }
.annotamd-agent-icon-button:disabled { opacity: .35; cursor: not-allowed; }
.annotamd-agent-icon-button:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 1px; }
.annotamd-agent-icon-button :deep(svg) { width: 15px; height: 15px; }
</style>
