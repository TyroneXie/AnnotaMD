<template>
  <footer class="annotamd-agent-composer">
    <div class="annotamd-agent-compose-box">
      <div v-if="selectionText" class="annotamd-agent-selection" data-testid="ai-selection-context">
        <span>{{ t('annotamd.agentWorkspace.selectionContext') }}</span>
        <strong :title="selectionText">{{ selectionText }}</strong>
        <button
          type="button"
          :title="t('annotamd.agentWorkspace.clearSelection')"
          :aria-label="t('annotamd.agentWorkspace.clearSelection')"
          @click="emit('clearSelection')"
        >
          <el-icon><Close /></el-icon>
        </button>
      </div>
      <div v-if="attachments.length" class="annotamd-agent-attachments" data-testid="ai-attachments">
        <span v-for="(attachment, index) in attachments" :key="`${attachment.name}-${index}`">
          <el-icon><Picture v-if="attachment.kind === 'image'" /><Document v-else /></el-icon>
          <strong :title="attachment.name">{{ attachment.name }}</strong>
          <button
            type="button"
            :title="t('annotamd.agentWorkspace.removeAttachment')"
            :aria-label="t('annotamd.agentWorkspace.removeAttachment')"
            @click="removeAttachment(index)"
          >
            <el-icon><Close /></el-icon>
          </button>
        </span>
      </div>
      <p v-if="attachmentError" class="annotamd-agent-attachment-error" role="alert">
        {{ attachmentError }}
      </p>
      <textarea
        :value="modelValue"
        data-testid="ai-composer"
        rows="3"
        :placeholder="t('annotamd.agentWorkspace.placeholder')"
        :disabled="inputDisabled"
        @input="onInput"
        @compositionstart="composing = true"
        @compositionend="composing = false"
        @keydown="onKeydown"
      />
      <div class="annotamd-agent-compose-toolbar">
        <input
          ref="fileInput"
          class="annotamd-agent-file-input"
          data-testid="ai-attachment-input"
          type="file"
          multiple
          accept="image/png,image/jpeg,image/gif,image/webp,.txt,.text,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.xml,.log"
          @change="onFilesSelected"
        >
        <button
          type="button"
          class="annotamd-agent-attach-action"
          data-testid="ai-add-attachment"
          :title="t('annotamd.agentWorkspace.attachmentHint')"
          :aria-label="t('annotamd.agentWorkspace.addAttachment')"
          :disabled="inputDisabled || running"
          @click="fileInput?.click()"
        >
          <el-icon><Plus /></el-icon>
        </button>
        <span class="is-spacer" />
        <AgentPermissionSelector
          :provider="provider"
          :visible="activePopup === 'permission'"
          @update:visible="setPopupVisible('permission', $event)"
        />
        <AgentModelSelector
          :runtime-model="runtimeModel"
          :visible="activePopup === 'model'"
          @update:visible="setPopupVisible('model', $event)"
        />
        <button
          v-if="running"
          type="button"
          class="annotamd-agent-primary-action is-stop"
          data-testid="ai-stop"
          :title="t('annotamd.agentWorkspace.stop')"
          @click="emit('stop')"
        >
          <el-icon><VideoPause /></el-icon>
        </button>
        <button
          v-else
          type="button"
          class="annotamd-agent-primary-action"
          data-testid="ai-send"
          :title="t('annotamd.agentWorkspace.send')"
          :disabled="sendDisabled || !modelValue.trim()"
          @click="emit('send')"
        >
          <el-icon><Top /></el-icon>
        </button>
      </div>
    </div>
    <div class="annotamd-agent-context">
      <span>{{ t('annotamd.agentWorkspace.workspace') }}</span>
      <code :title="workspacePath || undefined">
        {{ workspaceLabel }}
      </code>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { Close, Document, Picture, Plus, Top, VideoPause } from '@element-plus/icons-vue'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiAttachment, AiProviderId } from '@shared/types/aiWorkspace'
import AgentModelSelector from './AgentModelSelector.vue'
import AgentPermissionSelector from './AgentPermissionSelector.vue'

const props = defineProps<{
  modelValue: string
  workspacePath: string
  runtimeModel?: string
  running: boolean
  inputDisabled: boolean
  sendDisabled: boolean
  provider?: AiProviderId
  selectionText?: string
  attachments: AiAttachment[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:attachments': [value: AiAttachment[]]
  clearSelection: []
  send: []
  stop: []
}>()
const { t } = useI18n()
const composing = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const attachmentError = ref('')
const activePopup = ref<'model' | 'permission' | null>(null)
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'log'
])
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_TEXT_FILES = 8
const MAX_TEXT_CHARACTERS = 12_000
const MAX_TOTAL_TEXT_CHARACTERS = 32_000
const setPopupVisible = (
  popup: Exclude<typeof activePopup.value, null>,
  visible: boolean
): void => {
  if (visible) activePopup.value = popup
  else if (activePopup.value === popup) activePopup.value = null
}
const workspaceLabel = computed(() => {
  if (!props.workspacePath) return t('annotamd.agentWorkspace.noWorkspace')
  const parts = props.workspacePath.split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/') || props.workspacePath
})
const onInput = (event: Event): void => {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? ''
const readImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onerror = () => reject(reader.error ?? new Error('Could not read image.'))
  reader.onload = () => {
    const value = typeof reader.result === 'string' ? reader.result : ''
    const comma = value.indexOf(',')
    if (comma < 0) reject(new Error('Could not read image.'))
    else resolve(value.slice(comma + 1))
  }
  reader.readAsDataURL(file)
})
const removeAttachment = (index: number): void => {
  attachmentError.value = ''
  emit('update:attachments', props.attachments.filter((_item, itemIndex) => itemIndex !== index))
}
const onFilesSelected = async(event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  attachmentError.value = ''
  const next = [...props.attachments]
  try {
    for (const file of files) {
      if (IMAGE_TYPES.has(file.type)) {
        if (props.provider !== 'codex') {
          throw new Error(t('annotamd.agentWorkspace.imageAttachmentCodexOnly'))
        }
        const images = next.filter(item => item.kind === 'image')
        if (images.length >= MAX_IMAGES) throw new Error(t('annotamd.agentWorkspace.imageAttachmentLimit'))
        if (file.size > MAX_IMAGE_BYTES) throw new Error(t('annotamd.agentWorkspace.imageAttachmentTooLarge'))
        const total = images.reduce((sum, item) => sum + item.sizeBytes, 0) + file.size
        if (total > MAX_TOTAL_IMAGE_BYTES) {
          throw new Error(t('annotamd.agentWorkspace.imageAttachmentTotalLimit'))
        }
        next.push({
          kind: 'image',
          name: file.name,
          mediaType: file.type as Extract<AiAttachment, { kind: 'image' }>['mediaType'],
          data: await readImage(file),
          sizeBytes: file.size
        })
        continue
      }

      if (!TEXT_EXTENSIONS.has(extensionOf(file.name))) {
        throw new Error(t('annotamd.agentWorkspace.unsupportedAttachment'))
      }
      const texts = next.filter(item => item.kind === 'text')
      if (texts.length >= MAX_TEXT_FILES) throw new Error(t('annotamd.agentWorkspace.textAttachmentLimit'))
      const source = await file.text()
      const content = source.slice(0, MAX_TEXT_CHARACTERS)
      const total = texts.reduce((sum, item) => sum + item.content.length, 0) + content.length
      if (total > MAX_TOTAL_TEXT_CHARACTERS) {
        throw new Error(t('annotamd.agentWorkspace.textAttachmentTotalLimit'))
      }
      next.push({
        kind: 'text',
        name: file.name,
        content,
        truncated: source.length > content.length
      })
    }
    emit('update:attachments', next)
  } catch (error) {
    attachmentError.value = error instanceof Error
      ? error.message
      : t('annotamd.agentWorkspace.attachmentReadFailed')
  }
}
const onKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return
  if (composing.value || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  emit('send')
}
</script>

<style scoped>
.annotamd-agent-composer { display: grid; flex: none; gap: 7px; padding: 10px 11px; border-top: 1px solid var(--annotamd-border-soft); background: var(--annotamd-surface); }
.annotamd-agent-compose-box { overflow: hidden; border: 1px solid var(--annotamd-border); border-radius: 8px; background: var(--annotamd-surface); box-shadow: 0 1px 3px color-mix(in srgb, #000 4%, transparent); }
.annotamd-agent-compose-box:focus-within { border-color: color-mix(in srgb, var(--annotamd-blue) 55%, var(--annotamd-border)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--annotamd-blue) 12%, transparent); }
.annotamd-agent-selection { display: grid; grid-template-columns: auto minmax(0, 1fr) 22px; align-items: center; gap: 6px; margin: 8px 8px 0; padding: 5px 6px 5px 8px; color: var(--annotamd-blue); border-left: 3px solid var(--annotamd-blue); border-radius: 4px; background: color-mix(in srgb, var(--annotamd-blue) 8%, var(--annotamd-surface)); font-size: 10px; }
.annotamd-agent-selection strong { overflow: hidden; color: var(--annotamd-text); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-selection button, .annotamd-agent-attachments button { display: grid; width: 22px; height: 22px; padding: 0; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
.annotamd-agent-selection button:hover, .annotamd-agent-attachments button:hover { color: var(--annotamd-text); background: var(--annotamd-fill-soft); }
.annotamd-agent-selection svg, .annotamd-agent-attachments button svg { width: 12px; height: 12px; }
.annotamd-agent-attachments { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 8px 0; }
.annotamd-agent-attachments > span { display: flex; min-width: 0; max-width: 100%; align-items: center; gap: 5px; padding: 3px 3px 3px 7px; color: var(--annotamd-muted); border: 1px solid var(--annotamd-border); border-radius: 6px; background: var(--annotamd-surface-soft); font-size: 10px; }
.annotamd-agent-attachments > span > svg { width: 13px; height: 13px; flex: none; }
.annotamd-agent-attachments strong { overflow: hidden; max-width: 150px; color: var(--annotamd-text); font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-attachment-error { margin: 6px 9px 0; color: #b42318; font-size: 10px; line-height: 1.4; }
.annotamd-agent-compose-box textarea { box-sizing: border-box; width: 100%; min-height: 72px; padding: 10px 11px 6px; resize: none; color: var(--annotamd-text); border: 0; outline: none; background: transparent; font: inherit; font-size: 12px; line-height: 1.55; }
.annotamd-agent-compose-box textarea::placeholder { color: var(--annotamd-muted); }
.annotamd-agent-compose-toolbar { display: grid; min-width: 0; grid-template-columns: 30px minmax(4px, 1fr) minmax(92px, .9fr) minmax(86px, 1.1fr) 30px; align-items: center; gap: 5px; padding: 4px 6px 6px; }
.annotamd-agent-file-input { display: none; }
.annotamd-agent-attach-action { display: grid; width: 30px; height: 30px; padding: 0; place-items: center; color: var(--annotamd-text); border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.annotamd-agent-attach-action:hover { background: var(--annotamd-fill-soft); }
.annotamd-agent-attach-action:disabled { opacity: .35; cursor: not-allowed; }
.annotamd-agent-attach-action svg { width: 16px; height: 16px; }
.annotamd-agent-compose-toolbar :deep(.annotamd-agent-model-trigger) { width: 100%; max-width: none; justify-content: flex-start; }
.annotamd-agent-compose-toolbar :deep(.annotamd-agent-model-label) { flex: 1; text-align: left; }
.annotamd-agent-primary-action { display: grid; width: 30px; height: 30px; flex: none; padding: 0; place-items: center; color: #fff; border: 0; border-radius: 50%; background: var(--annotamd-blue); cursor: pointer; }
.annotamd-agent-primary-action.is-stop { background: #ef4444; }
.annotamd-agent-primary-action:disabled { opacity: .35; cursor: not-allowed; }
.annotamd-agent-primary-action:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 2px; }
.annotamd-agent-primary-action :deep(svg) { width: 14px; height: 14px; }
.annotamd-agent-context { display: flex; min-width: 0; align-items: center; gap: 6px; padding: 0 2px; color: var(--annotamd-muted); font-size: 10px; }
.annotamd-agent-context code { overflow: hidden; flex: 1; font: inherit; text-overflow: ellipsis; white-space: nowrap; }
</style>
