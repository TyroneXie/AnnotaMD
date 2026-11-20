<template>
  <span class="annotamd-ai-provider-logo" :title="label">
    <el-icon v-if="provider === 'custom'"><Operation /></el-icon>
    <img
      v-else-if="iconUrl && !failed"
      :src="iconUrl"
      :alt="label"
      :class="{ 'is-dark-inverted': darkInverted }"
      @error="failed = true"
    >
    <span v-else>{{ fallbackText }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Operation } from '@element-plus/icons-vue'
import type { AiProviderId } from '@shared/types/aiWorkspace'
import { aiProviderOption } from '@shared/types/aiProviderPresets'
import alibabaCloudIcon from '@/assets/ai/alibabacloud.svg?url'
import anthropicIcon from '@/assets/ai/anthropic.svg?url'
import claudeIcon from '@/assets/ai/claude.svg?url'
import claudeCodeIcon from '@/assets/ai/claudecode.svg?url'
import codeBuddyIcon from '@/assets/ai/codebuddy.svg?url'
import codexIcon from '@/assets/ai/codex.svg?url'
import cursorIcon from '@/assets/ai/cursor.svg?url'
import deepSeekIcon from '@/assets/ai/deepseek.svg?url'
import geminiIcon from '@/assets/ai/googlegemini.svg?url'
import grokIcon from '@/assets/ai/grok.svg?url'
import kimiIcon from '@/assets/ai/kimi.svg?url'
import minimaxIcon from '@/assets/ai/minimax.svg?url'
import ollamaIcon from '@/assets/ai/ollama.svg?url'
import openAiIcon from '@/assets/ai/openai.svg?url'
import openCodeIcon from '@/assets/ai/opencode.svg?url'
import piIcon from '@/assets/ai/pi.svg?url'
import qwenIcon from '@/assets/ai/qwen.svg?url'
import zhipuIcon from '@/assets/ai/zhipu.svg?url'

const props = defineProps<{
  provider: string
  label: string
}>()

const failed = ref(false)
watch(() => props.provider, () => { failed.value = false })

const icons: Partial<Record<string, string>> = {
  alibabacloud: alibabaCloudIcon,
  anthropic: anthropicIcon,
  claude: claudeIcon,
  claudecode: claudeCodeIcon,
  codebuddy: codeBuddyIcon,
  codex: codexIcon,
  cursor: cursorIcon,
  deepseek: deepSeekIcon,
  googlegemini: geminiIcon,
  grok: grokIcon,
  kimi: kimiIcon,
  minimax: minimaxIcon,
  ollama: ollamaIcon,
  openai: openAiIcon,
  opencode: openCodeIcon,
  pi: piIcon,
  qwen: qwenIcon,
  zhipu: zhipuIcon
}

const iconUrl = computed(() => {
  const slug = aiProviderOption(props.provider as AiProviderId).iconSlug ?? props.provider
  return Object.hasOwn(icons, slug) ? icons[slug] : undefined
})
const fallbackText = computed(() => props.label.slice(0, 1).toUpperCase())
const darkInverted = computed(() => [
  'anthropic',
  'anthropic-compatible',
  'anthropic-messages',
  'openai',
  'openai-compatible',
  'kimi',
  'ollama',
  'opencode',
  'cursor-cli',
  'grok-cli'
].includes(props.provider))
</script>

<style scoped>
.annotamd-ai-provider-logo { display: inline-grid; width: 18px; height: 18px; flex: none; place-items: center; overflow: hidden; border-radius: 4px; color: var(--editorColor60); font-size: 9px; font-weight: 700; line-height: 1; }
.annotamd-ai-provider-logo :deep(.el-icon) { font-size: 16px; }
.annotamd-ai-provider-logo img, .annotamd-ai-provider-logo :deep(svg) { width: 16px; height: 16px; object-fit: contain; }
@media (prefers-color-scheme: dark) {
  .annotamd-ai-provider-logo img.is-dark-inverted { filter: invert(1); }
}
</style>
