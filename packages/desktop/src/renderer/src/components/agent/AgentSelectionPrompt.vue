<template>
  <Teleport to="body">
    <section
      ref="panel"
      class="agent-selection-prompt"
      :style="position"
      role="dialog"
      :aria-label="t('title')"
    >
      <div class="selection-context">
        <blockquote :title="context.selectedText">{{ context.selectedText }}</blockquote>
        <button
          type="button"
          class="icon-button close-button"
          :aria-label="tCommon('dialog.close')"
          @click="emit('close')"
        >
          <Close />
        </button>
      </div>
      <form v-if="!applied" @submit.prevent="submit">
        <textarea
          ref="input"
          v-model="instruction"
          :readonly="running"
          :placeholder="t('placeholder')"
          :aria-label="t('placeholder')"
          rows="2"
          @keydown.enter="onEnter"
        />
        <div class="prompt-actions">
          <span v-if="running" role="status">{{ t('running') }}</span>
          <button v-if="running" type="button" @click="cancel">{{ tCommon('common.cancel') }}</button>
          <button
            v-else
            type="submit"
            class="primary-action icon-button"
            :aria-label="t('send')"
            :title="t('send')"
            :disabled="!instruction.trim()"
          >
            <ArrowUp />
          </button>
        </div>
      </form>
      <p v-if="error" role="alert" class="prompt-error">{{ error }}</p>
      <div v-if="result" class="prompt-result" aria-live="polite">
        <span>{{ t('reply') }}</span>
        <div class="result-text">{{ result.text }}</div>
        <span v-if="applied" class="result-status">
          <Check />
          {{ t('applied') }}
        </span>
        <div v-else-if="result.kind === 'replacement'" class="result-text">
          {{ result.replacementMarkdown || t('remove') }}
        </div>
      </div>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, type CSSProperties } from 'vue'
import { ArrowUp, Check, Close } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useAiSettingsStore } from '@/store/aiSettings'
import type { AiSelectionContext, AiSelectionResult } from '@shared/types/aiSelection'
import en from '../../../../../static/locales/en.json'
import zhCN from '../../../../../static/locales/zh-CN.json'

const props = defineProps<{
  range: Range
  context: AiSelectionContext
  applyReplacement: (replacement: string) => boolean
}>()
const emit = defineEmits<{ close: [] }>()
const { t: tCommon } = useI18n({ useScope: 'global' })
// Bundle the prompt's copy with the component so it also works with a cached locale.
const { t } = useI18n({
  useScope: 'local',
  messages: { en: en.annotamd.agentSelection, 'zh-CN': zhCN.annotamd.agentSelection }
})
const settings = useAiSettingsStore()
const panel = ref<HTMLElement>()
const input = ref<HTMLTextAreaElement>()
const instruction = ref('')
const running = ref(false)
const applied = ref(false)
const error = ref('')
const result = shallowRef<AiSelectionResult>()
const position = shallowRef<CSSProperties>({ visibility: 'hidden' })
const highlightName = 'annotamd-agent-selection'
const anchorElement = props.range.startContainer.parentElement?.closest('.mu-content')
let editedAnchor: Range | undefined
let requestId: string | undefined
let resizeObserver: ResizeObserver | undefined

const place = (): void => {
  if (!panel.value) return
  const editor = anchorElement?.closest('.editor-component')
  const anchorRect = (editedAnchor ?? props.range).getBoundingClientRect()
  const range = applied.value && !anchorRect.height && anchorElement
    ? anchorElement.getBoundingClientRect()
    : anchorRect
  const viewport = editor?.getBoundingClientRect()
  if (!viewport || !range.height || range.bottom <= Math.max(viewport.top, 0) ||
    range.top >= Math.min(viewport.bottom, window.innerHeight)) {
    position.value = { visibility: 'hidden' }
    return
  }

  const margin = 12
  const gap = 10
  const { offsetWidth: width, offsetHeight: height } = panel.value
  const left = (range.left + range.right - width) / 2
  const above = range.top - gap - height
  const top = above >= margin ? above : range.bottom + gap
  position.value = {
    left: `${Math.max(margin, Math.min(left, window.innerWidth - width - margin))}px`,
    top: `${Math.max(margin, Math.min(top, window.innerHeight - height - margin))}px`
  }
}

const stop = (): void => {
  if (!requestId) return
  const stopped = requestId
  requestId = undefined
  running.value = false
  void window.electron.ipcRenderer.invoke('annotamd::ai::selection:stop', stopped).catch(() => {})
}

const cancel = (): void => {
  stop()
  input.value?.focus({ preventScroll: true })
}

const submit = async (): Promise<void> => {
  const prompt = instruction.value.trim()
  if (!prompt || running.value) return
  const id = window.crypto.randomUUID()
  requestId = id
  running.value = true
  error.value = ''
  result.value = undefined
  try {
    await settings.initialize()
    if (requestId !== id) return
    const response = await window.electron.ipcRenderer.invoke('annotamd::ai::selection:run', {
      requestId: id,
      instruction: prompt,
      context: { ...props.context },
      modelId: settings.selectedAgentModel
    })
    if (requestId !== id) return
    result.value = response
    if (response.kind === 'replacement') {
      applied.value = props.applyReplacement(response.replacementMarkdown)
      if (applied.value) {
        CSS.highlights?.delete(highlightName)
        const selection = document.getSelection()
        if (selection?.rangeCount) editedAnchor = selection.getRangeAt(0).cloneRange()
        place()
      } else {
        error.value = t('stale')
      }
    }
  } catch (reason) {
    if (requestId === id) {
      error.value = (reason instanceof Error ? reason.message : String(reason))
        .replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
    }
  } finally {
    if (requestId === id) {
      requestId = undefined
      running.value = false
    }
  }
}

const onEnter = (event: KeyboardEvent): void => {
  if (event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  void submit()
}

const onEscape = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

const closeOutside = (event: PointerEvent): void => {
  if (event.target instanceof Node && !panel.value?.contains(event.target)) emit('close')
}

onMounted(() => {
  CSS.highlights?.set(highlightName, new Highlight(props.range))
  place()
  void nextTick(() => input.value?.focus({ preventScroll: true }))
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
  document.addEventListener('pointerdown', closeOutside, true)
  document.addEventListener('keydown', onEscape, true)
  if (panel.value) {
    resizeObserver = new ResizeObserver(place)
    resizeObserver.observe(panel.value)
  }
})

onBeforeUnmount(() => {
  stop()
  CSS.highlights?.delete(highlightName)
  resizeObserver?.disconnect()
  window.removeEventListener('scroll', place, true)
  window.removeEventListener('resize', place)
  document.removeEventListener('pointerdown', closeOutside, true)
  document.removeEventListener('keydown', onEscape, true)
})
</script>

<style scoped>
:global(::highlight(annotamd-agent-selection)) {
  background-color: color-mix(in srgb, var(--highlightThemeColor, #4688d7) 25%, transparent);
}

.agent-selection-prompt {
  position: fixed;
  z-index: 1000;
  display: grid;
  gap: 8px;
  box-sizing: border-box;
  width: min(390px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  overflow: auto;
  padding: 11px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 12px;
  background: var(--floatBgColor, var(--editorBgColor));
  box-shadow: 0 8px 30px rgb(0 0 0 / 16%);
  color: var(--editorColor);
  font-size: 13px;
  line-height: 1.45;
  text-align: start;
}

.selection-context, .prompt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

blockquote {
  flex: 1;
  min-width: 0;
  margin: 0;
  padding: 2px 8px;
  overflow: hidden;
  border-inline-start: 2px solid var(--highlightThemeColor, #4688d7);
  color: color-mix(in srgb, currentColor 72%, transparent);
  text-overflow: ellipsis;
  white-space: nowrap;
}

form {
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  background: var(--editorBgColor);
}

form:focus-within {
  border-color: var(--highlightThemeColor, #4688d7);
}

textarea {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  max-height: 150px;
  padding: 3px 4px;
  field-sizing: content;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

button {
  display: inline-grid;
  place-items: center;
  min-height: 27px;
  padding: 3px 9px;
  border: 0;
  border-radius: 6px;
  background: color-mix(in srgb, currentColor 7%, transparent);
  color: inherit;
  cursor: pointer;
  font: inherit;
}

button:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
button:focus-visible { outline: 2px solid var(--highlightThemeColor, #4688d7); }
button:disabled { opacity: .4; cursor: default; }
.icon-button { flex-shrink: 0; width: 27px; padding: 0; }
.icon-button svg { width: 15px; height: 15px; }
.close-button { background: transparent; }
.prompt-actions { justify-content: flex-end; }
.prompt-actions span { margin-inline-end: auto; padding-inline-start: 4px; }
.primary-action {
  --action-color: color-mix(in srgb, var(--highlightThemeColor, #2467bf) 72%, black);
  background: var(--action-color);
  color: white;
}
.primary-action:hover { background: color-mix(in srgb, var(--action-color) 90%, black); }
.prompt-error { margin: 0; overflow-wrap: anywhere; color: var(--el-color-danger); }

.prompt-result {
  display: grid;
  gap: 6px;
  padding: 8px 3px 0;
  border-top: 1px solid var(--floatBorderColor);
}

.prompt-result > span { font-weight: 600; }
.prompt-result .result-status {
  display: flex;
  align-items: center;
  gap: 5px;
  color: color-mix(in srgb, currentColor 72%, transparent);
  font-size: 12px;
  font-weight: 400;
}

.result-status svg { width: 14px; height: 14px; color: var(--highlightThemeColor); }

.result-text {
  max-height: min(32vh, 240px);
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
