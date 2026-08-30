<template>
  <article
    class="annotamd-agent-change-set"
    :class="`is-${changeSet.status}`"
    data-testid="ai-change-set-card"
  >
    <header class="annotamd-agent-change-set-header">
      <div>
        <strong>{{ t('annotamd.agentWorkspace.changeSet.title') }}</strong>
        <code :title="changeSet.filePath || changeSet.documentUri">{{ fileName }}</code>
      </div>
      <div class="annotamd-agent-change-set-summary">
        <span class="is-addition">+{{ changeSet.additions }}</span>
        <span class="is-deletion">-{{ changeSet.deletions }}</span>
        <span>{{ statusLabel }}</span>
      </div>
    </header>

    <div v-if="diffLines.length" class="annotamd-agent-line-diff" data-testid="ai-change-set-diff">
      <div
        v-for="(line, index) in diffLines"
        :key="`${line.kind}:${line.beforeLine ?? ''}:${line.afterLine ?? ''}:${index}`"
        :class="`is-${line.kind}`"
      >
        <span>{{ line.beforeLine ?? '' }}</span>
        <span>{{ line.afterLine ?? '' }}</span>
        <code><i>{{ linePrefix(line.kind) }}</i>{{ line.text }}</code>
      </div>
    </div>

    <p v-else class="annotamd-agent-change-set-empty">
      {{ t('annotamd.agentWorkspace.changeSet.noDiff') }}
    </p>

    <p v-if="changeSet.status === 'conflicted'" class="annotamd-agent-change-set-conflict" role="alert">
      {{ changeSet.message || t('annotamd.agentWorkspace.changeSet.conflictedDescription') }}
    </p>
    <p v-if="error" class="annotamd-agent-change-set-error" role="alert">{{ error }}</p>

    <div
      v-if="changeSet.status === 'applied-unreviewed'"
      class="annotamd-agent-change-set-actions"
    >
      <button
        type="button"
        data-testid="ai-change-set-rollback"
        :disabled="resolving"
        @click="emit('rollback')"
      >
        {{ t('annotamd.agentWorkspace.changeSet.rollback') }}
      </button>
      <button
        type="button"
        class="is-keep"
        data-testid="ai-change-set-keep"
        :disabled="resolving"
        @click="emit('keep')"
      >
        {{ t('annotamd.agentWorkspace.changeSet.keep') }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiChangeSet } from '@shared/types/aiWorkspace'
import type { AgentDocumentLineDiffKind } from '@shared/types/agentDocumentTransactions'

const props = defineProps<{
  changeSet: AiChangeSet
  resolving?: boolean
  error?: string
}>()
const emit = defineEmits<{ keep: []; rollback: [] }>()
const { t } = useI18n()

const diffLines = computed(() => props.changeSet.transaction?.diff.lines ?? [])
const fileName = computed(() => {
  const source = props.changeSet.filePath || props.changeSet.documentUri
  return source.split(/[\\/]/).filter(Boolean).at(-1) ?? source
})
const statusLabel = computed(() => (
  t(`annotamd.agentWorkspace.changeSet.status.${props.changeSet.status}`)
))
const linePrefix = (kind: AgentDocumentLineDiffKind): string => {
  if (kind === 'addition') return '+'
  if (kind === 'deletion') return '-'
  return ' '
}
</script>

<style scoped>
.annotamd-agent-change-set { display: grid; gap: 9px; padding: 10px; border: 1px solid color-mix(in srgb, var(--annotamd-blue) 28%, var(--annotamd-border)); border-radius: 9px; background: var(--annotamd-surface); }
.annotamd-agent-change-set.is-conflicted { border-color: color-mix(in srgb, #ef4444 50%, var(--annotamd-border)); }
.annotamd-agent-change-set-header, .annotamd-agent-change-set-summary, .annotamd-agent-change-set-actions { display: flex; align-items: center; }
.annotamd-agent-change-set-header { min-width: 0; justify-content: space-between; gap: 8px; }
.annotamd-agent-change-set-header > div:first-child { display: grid; min-width: 0; gap: 2px; }
.annotamd-agent-change-set-header strong { font-size: 11px; }
.annotamd-agent-change-set-header code { max-width: 180px; overflow: hidden; color: var(--annotamd-muted); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-change-set-summary { flex: none; gap: 6px; color: var(--annotamd-muted); font-size: 9px; }
.is-addition { color: #16a34a; }.is-deletion { color: #dc2626; }
.annotamd-agent-line-diff { max-height: 260px; overflow: auto; border: 1px solid var(--annotamd-border-soft); border-radius: 6px; background: var(--annotamd-surface-soft); font: 10px/1.55 "SFMono-Regular", Consolas, monospace; }
.annotamd-agent-line-diff > div { display: grid; min-width: max-content; grid-template-columns: 34px 34px minmax(280px, 1fr); }
.annotamd-agent-line-diff > div > span { padding: 1px 5px; color: var(--annotamd-muted); border-right: 1px solid var(--annotamd-border-soft); text-align: right; user-select: none; }
.annotamd-agent-line-diff code { padding: 1px 7px; color: var(--annotamd-text); white-space: pre-wrap; }
.annotamd-agent-line-diff code i { display: inline-block; width: 13px; font-style: normal; user-select: none; }
.annotamd-agent-line-diff .is-addition { background: color-mix(in srgb, #22c55e 11%, transparent); }
.annotamd-agent-line-diff .is-deletion { background: color-mix(in srgb, #ef4444 10%, transparent); }
.annotamd-agent-change-set-empty { margin: 0; color: var(--annotamd-muted); font-size: 10px; }
.annotamd-agent-change-set-conflict, .annotamd-agent-change-set-error { margin: 0; color: #dc2626; font-size: 10px; line-height: 1.5; }
.annotamd-agent-change-set-actions { justify-content: flex-end; gap: 6px; }
.annotamd-agent-change-set-actions button { min-height: 27px; padding: 0 9px; color: var(--annotamd-text); border: 1px solid var(--annotamd-border); border-radius: 5px; background: var(--annotamd-surface); font-size: 10px; cursor: pointer; }
.annotamd-agent-change-set-actions button.is-keep { color: #fff; border-color: var(--annotamd-blue); background: var(--annotamd-blue); }
.annotamd-agent-change-set-actions button:disabled { opacity: .45; cursor: not-allowed; }
</style>
