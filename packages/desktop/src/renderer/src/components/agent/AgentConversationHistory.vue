<template>
  <el-tooltip :content="t('annotamd.agentWorkspace.history')" placement="bottom" :show-after="150">
    <span class="annotamd-agent-history-reference">
      <el-popover
        v-model:visible="visible"
        placement="bottom-end"
        :width="300"
        popper-class="annotamd-agent-history-popover"
        trigger="click"
      >
        <template #reference>
          <button
            type="button"
            class="annotamd-agent-history-toggle"
            :class="{ 'is-open': visible }"
            data-testid="ai-history-toggle"
            :aria-label="t('annotamd.agentWorkspace.history')"
          >
            <el-icon><Clock /></el-icon>
          </button>
        </template>
        <div class="annotamd-agent-history">
          <header>
            <strong>{{ t('annotamd.agentWorkspace.history') }}</strong>
            <button type="button" :disabled="newDisabled" @click="startNew">
              <el-icon><Plus /></el-icon>
            </button>
          </header>
          <el-input
            v-model="query"
            size="small"
            clearable
            :prefix-icon="Search"
            :placeholder="t('annotamd.agentWorkspace.searchHistory')"
          />
          <p v-if="filtered.length === 0" class="is-empty">
            {{ t('annotamd.agentWorkspace.noHistory') }}
          </p>
          <p v-if="conversations.error" class="is-error" role="alert">{{ conversations.error }}</p>
          <div v-else class="annotamd-agent-history-list">
            <div
              v-for="conversation in filtered"
              :key="conversation.id"
              class="annotamd-agent-history-row"
              :class="{ 'is-active': conversation.id === conversations.activeId }"
            >
              <div
                v-if="editingId === conversation.id"
                class="annotamd-agent-history-edit"
                @click.stop
              >
                <el-input
                  v-model="editingTitle"
                  size="small"
                  maxlength="120"
                  autofocus
                  :placeholder="t('annotamd.agentWorkspace.conversationTitlePlaceholder')"
                  @keyup.enter="commitRename(conversation.id)"
                  @keyup.esc="cancelRename"
                  @blur="commitRename(conversation.id)"
                />
              </div>
              <button
                v-else
                type="button"
                class="annotamd-agent-history-select"
                @click="select(conversation.id)"
              >
                <span>
                  <strong>{{ conversation.title }}</strong>
                  <small>{{ conversationAgentName(conversation) }} · {{ formatTime(conversation.updatedAt) }}</small>
                </span>
                <i :class="`is-${conversation.status}`" />
              </button>
              <button
                v-if="editingId !== conversation.id"
                type="button"
                class="annotamd-agent-history-rename"
                :title="t('annotamd.agentWorkspace.renameConversation')"
                @click.stop="startRename(conversation.id, conversation.title)"
              >
                <el-icon><EditPen /></el-icon>
              </button>
              <button
                v-if="conversation.status === 'running'"
                type="button"
                class="annotamd-agent-history-stop"
                :title="t('annotamd.agentWorkspace.stop')"
                @click="stop(conversation.id)"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                type="button"
                class="annotamd-agent-history-delete"
                :title="t('annotamd.agentWorkspace.deleteConversation')"
                @click="remove(conversation.id)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </div>
        </div>
      </el-popover>
    </span>
  </el-tooltip>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Clock, Delete, EditPen, Plus, Search, VideoPause } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { AiConversation } from '@shared/types/aiWorkspace'
import { aiProviderOption } from '@shared/types/aiProviderPresets'
import { useAgentConversationsStore } from '@/store/agentConversations'
import { useAiSettingsStore } from '@/store/aiSettings'

const emit = defineEmits<{
  new: []
  select: [id: string]
  delete: [id: string]
  stop: [id: string]
}>()
defineProps<{ newDisabled?: boolean }>()

const { t } = useI18n()
const conversations = useAgentConversationsStore()
const settings = useAiSettingsStore()
const visible = ref(false)
const query = ref('')
const editingId = ref('')
const editingTitle = ref('')
const filtered = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase()
  const agentConversations = conversations.items.filter(conversation => conversation.mode === 'agent')
  if (!normalized) return agentConversations
  return agentConversations.filter(conversation => (
    conversation.title.toLocaleLowerCase().includes(normalized)
  ))
})

const formatTime = (value: number): string => new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
}).format(value)

const conversationAgentName = (conversation: AiConversation): string => (
  settings.configs.find(config => config.id === conversation.configId)?.name ||
  (conversation.provider ? aiProviderOption(conversation.provider).label : '') ||
  t('annotamd.agentWorkspace.unknownAgent')
)

const startRename = (id: string, title: string): void => {
  editingId.value = id
  editingTitle.value = title
}

const cancelRename = (): void => {
  editingId.value = ''
  editingTitle.value = ''
}

const commitRename = async(id: string): Promise<void> => {
  if (editingId.value !== id) return
  const title = editingTitle.value.trim()
  editingId.value = ''
  editingTitle.value = ''
  if (!title) return
  await conversations.rename(id, title)
}

const select = (id: string): void => {
  visible.value = false
  emit('select', id)
}

const startNew = (): void => {
  visible.value = false
  emit('new')
}

const remove = (id: string): void => {
  emit('delete', id)
}

const stop = (id: string): void => {
  emit('stop', id)
}
</script>

<style scoped>
.annotamd-agent-history-toggle { display: grid; width: 26px; height: 26px; padding: 0; appearance: none; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 5px; background: transparent; cursor: pointer; }
.annotamd-agent-history-reference { display: inline-flex; }
.annotamd-agent-history-toggle:hover, .annotamd-agent-history-toggle.is-open { color: var(--annotamd-text); background: var(--annotamd-fill-soft); }
.annotamd-agent-history-toggle:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 1px; }
.annotamd-agent-history-toggle :deep(svg) { width: 15px; height: 15px; }
.annotamd-agent-history { display: grid; gap: 8px; }
.annotamd-agent-history header { display: flex; align-items: center; justify-content: space-between; }
.annotamd-agent-history header button { display: grid; width: 24px; height: 24px; padding: 0; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 5px; background: transparent; cursor: pointer; }
.annotamd-agent-history-list { display: grid; max-height: 280px; gap: 2px; overflow: auto; }
.annotamd-agent-history-row { display: flex; min-width: 0; align-items: center; gap: 3px; border-radius: 6px; }
.annotamd-agent-history-row:hover, .annotamd-agent-history-row.is-active { background: var(--annotamd-fill-soft); }
.annotamd-agent-history-select { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; padding: 7px 5px 7px 8px; color: var(--annotamd-text); border: 0; background: transparent; text-align: left; cursor: pointer; }
.annotamd-agent-history-select > span { display: grid; min-width: 0; flex: 1; gap: 2px; }
.annotamd-agent-history-row strong, .annotamd-agent-history-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-history-row strong { font-size: 12px; font-weight: 500; }
.annotamd-agent-history-row small { color: var(--annotamd-muted); font-size: 10px; }
.annotamd-agent-history-select > i { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--annotamd-muted); }
.annotamd-agent-history-select > i.is-running { background: var(--annotamd-blue); }
.annotamd-agent-history-select > i.is-failed { background: #ef4444; }
.annotamd-agent-history-row.is-active .annotamd-agent-history-select > i { background: var(--annotamd-green); }
.annotamd-agent-history-edit { min-width: 0; flex: 1; padding: 4px 3px 4px 6px; }
.annotamd-agent-history-edit :deep(.el-input__wrapper) { border-radius: 5px; }
.annotamd-agent-history-delete, .annotamd-agent-history-stop, .annotamd-agent-history-rename { display: grid; width: 26px; height: 26px; flex: none; padding: 0; place-items: center; color: var(--annotamd-muted); border: 0; border-radius: 5px; background: transparent; cursor: pointer; }
.annotamd-agent-history-rename:hover { color: var(--annotamd-text); background: var(--annotamd-surface); }
.annotamd-agent-history-delete:hover { color: #ef4444; }
.annotamd-agent-history-stop:hover { color: var(--annotamd-blue); }
.annotamd-agent-history button:focus-visible { outline: 2px solid var(--annotamd-blue); outline-offset: 1px; }
.is-empty { margin: 12px 0; color: var(--annotamd-muted); font-size: 12px; text-align: center; }
.is-error { margin: 4px 0 0; color: #b42318; font-size: 10px; line-height: 1.4; }
</style>
