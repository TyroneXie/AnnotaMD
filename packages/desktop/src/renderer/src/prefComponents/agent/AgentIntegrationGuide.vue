<template>
  <section class="pref-agent-guide" data-testid="agent-manual-integration-guide">
    <header class="pref-agent-guide-header">
      <div>
        <h5>{{ t('preferences.agent.aiWorkspace.integrationTitle') }}</h5>
        <p>{{ t('preferences.agent.aiWorkspace.integrationDescription') }}</p>
      </div>
      <span>{{ t('preferences.agent.aiWorkspace.manualSetup') }}</span>
    </header>

    <div class="pref-agent-consult-note">
      <el-icon><ChatLineSquare /></el-icon>
      <p>{{ t('preferences.agent.aiWorkspace.commentAgentLink') }}</p>
    </div>

    <div class="pref-agent-guide-grid">
      <article>
        <div class="pref-agent-guide-title">
          <span class="pref-agent-guide-icon"><Connection /></span>
          <div>
            <strong>{{ t('preferences.agent.aiWorkspace.mcpGuideTitle') }}</strong>
            <small>{{ t('preferences.agent.aiWorkspace.mcpGuideDescription') }}</small>
          </div>
        </div>
        <ol>
          <li>{{ t('preferences.agent.aiWorkspace.mcpGuideStepOpen') }}</li>
          <li>{{ t('preferences.agent.aiWorkspace.mcpGuideStepPaste') }}</li>
          <li>{{ t('preferences.agent.aiWorkspace.mcpGuideStepRestart') }}</li>
        </ol>
        <button
          type="button"
          :disabled="loading"
          data-testid="copy-agent-mcp-config"
          @click="copyMcpConfig"
        >
          <el-icon><Check v-if="copied === 'mcp'" /><CopyDocument v-else /></el-icon>
          {{ copied === 'mcp'
            ? t('preferences.agent.aiWorkspace.copied')
            : t('preferences.agent.aiWorkspace.copyMcpConfig') }}
        </button>
      </article>

      <article>
        <div class="pref-agent-guide-title">
          <span class="pref-agent-guide-icon"><Files /></span>
          <div>
            <strong>{{ t('preferences.agent.aiWorkspace.skillGuideTitle') }}</strong>
            <small>{{ t('preferences.agent.aiWorkspace.skillGuideDescription') }}</small>
          </div>
        </div>
        <ol>
          <li>{{ t('preferences.agent.aiWorkspace.skillGuideStepCreate') }}</li>
          <li>{{ t('preferences.agent.aiWorkspace.skillGuideStepPaste') }}</li>
          <li>{{ t('preferences.agent.aiWorkspace.skillGuideStepEnable') }}</li>
        </ol>
        <button
          type="button"
          :disabled="loading"
          data-testid="copy-agent-skill-content"
          @click="copySkillContent"
        >
          <el-icon><Check v-if="copied === 'skill'" /><CopyDocument v-else /></el-icon>
          {{ copied === 'skill'
            ? t('preferences.agent.aiWorkspace.copied')
            : t('preferences.agent.aiWorkspace.copySkillContent') }}
        </button>
      </article>
    </div>

    <p v-if="error" class="pref-agent-guide-error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { ChatLineSquare, Check, Connection, CopyDocument, Files } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { AnnotaMDExternalAgentGuide } from '@shared/types/mcpClients'

const { t } = useI18n()
const guide = ref<AnnotaMDExternalAgentGuide | null>(null)
const loading = ref(false)
const copied = ref<'mcp' | 'skill' | ''>('')
const error = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined

const loadGuide = async(): Promise<AnnotaMDExternalAgentGuide> => {
  if (guide.value) return guide.value
  loading.value = true
  error.value = ''
  try {
    guide.value = await window.electron.ipcRenderer.invoke('annotamd::mcp-clients::manual-guide')
    return guide.value
  } finally {
    loading.value = false
  }
}

const markCopied = (kind: 'mcp' | 'skill'): void => {
  copied.value = kind
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = '' }, 1600)
}

const copyValue = async(kind: 'mcp' | 'skill'): Promise<void> => {
  try {
    const setup = await loadGuide()
    window.electron.clipboard.writeText(kind === 'mcp' ? setup.manualConfig : setup.skillContent)
    markCopied(kind)
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  }
}

const copyMcpConfig = (): Promise<void> => copyValue('mcp')
const copySkillContent = (): Promise<void> => copyValue('skill')

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<style scoped>
.pref-agent-guide { display: grid; gap: 18px; padding-top: 24px; border-top: 1px solid var(--editorColor10); }
.pref-agent-guide-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.pref-agent-guide-header h5 { margin: 0; color: var(--editorColor); font-size: 16px; font-weight: 700; }
.pref-agent-guide-header p { max-width: 680px; margin: 5px 0 0; color: var(--editorColor60); font-size: 12px; line-height: 1.55; }
.pref-agent-guide-header > span { flex: none; padding: 4px 8px; color: #16794a; border: 1px solid color-mix(in srgb, var(--highlightThemeColor) 30%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--highlightThemeColor) 7%, transparent); font-size: 11px; }
.pref-agent-consult-note { display: flex; align-items: center; gap: 9px; padding: 0 0 17px; color: var(--editorColor70); border-bottom: 1px solid var(--editorColor10); }
.pref-agent-consult-note .el-icon { width: 18px; height: 18px; flex: none; }
.pref-agent-consult-note p { margin: 0; font-size: 12px; line-height: 1.5; }
.pref-agent-guide-grid { display: grid; }
.pref-agent-guide-grid article { display: grid; min-width: 0; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px 24px; padding: 18px 0; border-bottom: 1px solid var(--editorColor10); }
.pref-agent-guide-title { display: flex; min-width: 0; align-items: flex-start; gap: 10px; }
.pref-agent-guide-icon { display: grid; width: 30px; height: 30px; flex: none; place-items: center; color: var(--editorColor); border-radius: 7px; background: var(--editorColor06); }
.pref-agent-guide-icon :deep(svg) { width: 16px; height: 16px; }
.pref-agent-guide-title > div { display: grid; min-width: 0; gap: 3px; }
.pref-agent-guide-title strong { color: var(--editorColor); font-size: 14px; font-weight: 650; }
.pref-agent-guide-title small { color: var(--editorColor60); font-size: 11px; line-height: 1.45; }
.pref-agent-guide ol { display: grid; grid-column: 1; gap: 4px; margin: 0 0 0 40px; padding-left: 16px; color: var(--editorColor60); font-size: 11px; line-height: 1.45; }
.pref-agent-guide article > button { display: inline-flex; min-width: 106px; min-height: 30px; grid-column: 2; grid-row: 1 / span 2; align-items: center; justify-content: center; gap: 6px; padding: 0 11px; color: #fff; border: 1px solid var(--highlightThemeColor); border-radius: 7px; background: var(--highlightThemeColor); font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
.pref-agent-guide article > button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--highlightThemeColor) 88%, #000); background: color-mix(in srgb, var(--highlightThemeColor) 88%, #000); }
.pref-agent-guide article > button:focus-visible { outline: 2px solid var(--highlightThemeColor); outline-offset: 2px; }
.pref-agent-guide article > button:disabled { cursor: progress; opacity: .55; }
.pref-agent-guide-error { margin: 0; color: #b42318; font-size: 10px; }
@media (max-width: 760px) {
  .pref-agent-guide-header { align-items: flex-start; flex-direction: column; gap: 8px; }
  .pref-agent-guide-grid article { grid-template-columns: 1fr; }
  .pref-agent-guide article > button { width: fit-content; grid-column: 1; grid-row: auto; margin-left: 40px; }
}
</style>
