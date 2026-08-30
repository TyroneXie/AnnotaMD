<template>
  <article class="annotamd-agent-approval" data-testid="ai-approval-card">
    <header>
      <span><el-icon><Lock /></el-icon></span>
      <div>
        <small>{{ t('annotamd.agentWorkspace.approvalRequested') }}</small>
        <strong>{{ approval.title }}</strong>
      </div>
    </header>
    <p v-if="approval.detail">{{ approval.detail }}</p>
    <pre v-if="approval.command"><code>{{ approval.command }}</code></pre>
    <ul v-if="approval.paths?.length">
      <li v-for="path in approval.paths" :key="path"><code>{{ path }}</code></li>
    </ul>
    <footer>
      <button
        v-if="approval.options.includes('deny')"
        type="button"
        class="is-secondary"
        data-testid="ai-approval-deny"
        @click="emit('resolve', 'deny')"
      >
        {{ t('annotamd.agentWorkspace.approvalDeny') }}
      </button>
      <span />
      <button
        v-if="approval.options.includes('allow-session')"
        type="button"
        class="is-secondary"
        data-testid="ai-approval-allow-session"
        @click="emit('resolve', 'allow-session')"
      >
        {{ t('annotamd.agentWorkspace.approvalAllowSession') }}
      </button>
      <button
        v-if="approval.options.includes('allow-once')"
        type="button"
        class="is-primary"
        data-testid="ai-approval-allow-once"
        @click="emit('resolve', 'allow-once')"
      >
        {{ t('annotamd.agentWorkspace.approvalAllowOnce') }}
      </button>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { Lock } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type {
  AiApprovalDecision,
  AiApprovalRequest
} from '@shared/types/aiWorkspace'

defineProps<{ approval: AiApprovalRequest }>()
const emit = defineEmits<{ resolve: [decision: AiApprovalDecision] }>()
const { t } = useI18n()
</script>

<style scoped>
.annotamd-agent-approval { display: grid; gap: 8px; margin: 4px 0; padding: 11px; color: var(--annotamd-text); border: 1px solid color-mix(in srgb, #f79009 48%, var(--annotamd-border)); border-radius: 8px; background: color-mix(in srgb, #f79009 5%, var(--annotamd-surface)); }
.annotamd-agent-approval header { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 8px; }
.annotamd-agent-approval header > span { display: grid; width: 28px; height: 28px; place-items: center; color: #b54708; border-radius: 7px; background: color-mix(in srgb, #f79009 12%, transparent); }
.annotamd-agent-approval header svg { width: 15px; height: 15px; }
.annotamd-agent-approval header div { display: grid; gap: 1px; }
.annotamd-agent-approval small { color: #b54708; font-size: 10px; }
.annotamd-agent-approval strong { font-size: 12px; line-height: 1.35; }
.annotamd-agent-approval p { margin: 0; color: var(--annotamd-muted); font-size: 11px; line-height: 1.5; }
.annotamd-agent-approval pre, .annotamd-agent-approval ul { overflow: auto; margin: 0; padding: 8px; border-radius: 6px; background: var(--annotamd-fill-soft); font-size: 10px; line-height: 1.45; }
.annotamd-agent-approval ul { padding-left: 25px; }
.annotamd-agent-approval footer { display: grid; grid-template-columns: auto 1fr auto auto; gap: 6px; }
.annotamd-agent-approval footer button { height: 28px; padding: 0 9px; border: 1px solid var(--annotamd-border); border-radius: 6px; background: var(--annotamd-surface); cursor: pointer; font: inherit; font-size: 10px; }
.annotamd-agent-approval footer button.is-primary { color: #fff; border-color: var(--annotamd-green); background: var(--annotamd-green); }
.annotamd-agent-approval footer button:hover { filter: brightness(.97); }
</style>
