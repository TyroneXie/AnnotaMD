<template>
  <div class="mcp-client-setup">
    <div v-if="hasVisibleClients" class="mcp-client-list">
      <div
        v-for="client in visibleInspectedClients"
        :key="client.id"
        class="mcp-client-row"
        :class="{ configured: clientMcpReady(client) }"
      >
        <div class="mcp-client-identity">
          <span
            class="mcp-client-mark"
            :class="{ 'mcp-client-mark-chatgpt': client.id === 'codex' }"
          >
            <img
              v-if="!missingIcons[client.id]"
              :src="clientIcons[client.id]"
              alt=""
              @error="markIconMissing(client.id)"
            >
            <span v-else class="mcp-client-fallback" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
          </span>
          <span class="mcp-client-copy">
            <span class="mcp-client-name-row">
              <strong>{{ clientNames[client.id] }}</strong>
            </span>
            <small>
              <i class="mcp-client-state-dot" :class="clientStateClass(client.id)" />
              <span>{{ stateText(client) }}</span>
              <button
                v-if="configureErrors[client.id]"
                type="button"
                class="mcp-client-error-toggle"
                :aria-expanded="expandedErrorClientId === client.id"
                @click="toggleConfigureError(client.id)"
              >
                {{ t('preferences.agent.clientErrorReason') }}
              </button>
            </small>
          </span>
        </div>
        <div class="mcp-client-actions">
          <button
            v-if="addedClientIds.includes(client.id) && !clientMcpReady(client)"
            type="button"
            class="mcp-client-button"
            @click="removeAddedClient(client.id)"
          >
            {{ t('preferences.agent.clientCancel') }}
          </button>
          <button
            v-if="connectedClient(client.id) && client.mcpConfigured"
            type="button"
            class="mcp-client-button connected"
            disabled
          >
            {{ t('preferences.agent.connected') }}
          </button>
          <button
            v-else-if="initialInspectionPending"
            type="button"
            class="mcp-client-button"
            disabled
          >
            {{ detectingText() }}
          </button>
          <button
            v-else-if="client.mcpConfigured"
            type="button"
            class="mcp-client-button configured"
            disabled
          >
            {{ t('preferences.agent.clientConfigured') }}
          </button>
          <button
            v-else-if="!client.installed"
            type="button"
            class="mcp-client-button"
            disabled
          >
            {{ t('preferences.agent.clientNotInstalled') }}
          </button>
          <button
            v-else
            type="button"
            class="mcp-client-button primary"
            :disabled="busyClient === client.id"
            @click="configure(client.id)"
          >
            {{ busyClient === client.id
              ? t('preferences.agent.clientConfiguring')
              : t('preferences.agent.clientConfigure') }}
          </button>
        </div>
        <div
          v-if="configureErrors[client.id] && expandedErrorClientId === client.id"
          class="mcp-client-config-error"
          role="alert"
        >
          <p>{{ t('preferences.agent.clientConfigureFailureReason', {
            reason: conciseError(configureErrors[client.id])
          }) }}</p>
          <p>{{ t('preferences.agent.clientManualFallback', {
            client: clientNames[client.id],
            path: clientSkillPaths[client.id]
          }) }}</p>
        </div>
      </div>

      <div v-for="client in otherClients" :key="client.name" class="mcp-client-row configured">
        <div class="mcp-client-identity">
          <span class="mcp-client-mark">
            <img
              v-if="clientIcon(client.name) && !missingIcons[client.name]"
              :src="clientIcon(client.name)"
              alt=""
              @error="markIconMissing(client.name)"
            >
            <span v-else class="mcp-client-fallback" aria-hidden="true">
              <i /><i /><i /><i />
            </span>
          </span>
          <span class="mcp-client-copy">
            <strong>{{ displayClientName(client.name) }}</strong>
            <small>
              <i
                class="mcp-client-state-dot"
                :class="client.connected ? 'online' : 'offline'"
              />
              {{ connectionText(client) }}
            </small>
          </span>
        </div>
        <button
          type="button"
          class="mcp-client-button"
          :class="client.connected ? 'connected' : 'offline'"
          disabled
        >
          {{ client.connected
            ? t('preferences.agent.connected')
            : t('preferences.agent.notConnected') }}
        </button>
      </div>

      <div v-if="showAddClientCard" class="mcp-client-row mcp-add-client-card">
        <el-select
          v-model="pendingClientId"
          class="mcp-add-client-select"
          :placeholder="t('preferences.agent.clientSelectPlaceholder')"
          @change="confirmClientSelection"
        >
          <el-option
            v-for="clientId in availableClientIds"
            :key="clientId"
            :label="clientNames[clientId]"
            :value="clientId"
          />
          <el-option
            v-if="!showCustomSetup"
            :label="t('preferences.agent.customClientTitle')"
            value="custom"
          />
        </el-select>
        <button
          type="button"
          class="mcp-client-button"
          @click="cancelPendingClient"
        >
          {{ t('preferences.agent.clientCancel') }}
        </button>
      </div>

      <section v-if="showCustomSetup" class="mcp-custom-client">
        <div class="mcp-custom-client-heading">
          <button
            type="button"
            class="mcp-custom-client-toggle"
            :aria-expanded="customDetailsExpanded"
            @click="customDetailsExpanded = !customDetailsExpanded"
          >
            <span class="mcp-client-mark" aria-hidden="true">
              <svg class="mcp-custom-client-icon" viewBox="0 0 24 24">
                <path d="M8 4v4" />
                <path d="M16 4v4" />
                <path d="M6 8h12v2a6 6 0 0 1-12 0V8Z" />
                <path d="M12 16v4" />
              </svg>
            </span>
            <span class="mcp-custom-client-copy">
              <span class="mcp-custom-client-title">
                <strong>{{ t('preferences.agent.customClientTitle') }}</strong>
                <span class="mcp-custom-client-chevron" aria-hidden="true">›</span>
              </span>
              <small>{{ t('preferences.agent.customClientDescription') }}</small>
            </span>
          </button>
          <div class="mcp-client-actions">
            <button
              type="button"
              class="mcp-client-button"
              @click="cancelCustomSetup"
            >
              {{ t('preferences.agent.clientCancel') }}
            </button>
            <button
              type="button"
              class="mcp-client-button primary"
              :disabled="customConfigBusy"
              @click="copyCustomConfig"
            >
              {{ customConfigBusy
                ? t('preferences.agent.clientConfiguring')
                : customConfigCopied
                ? t('preferences.agent.clientCopied')
                : t('preferences.agent.customClientCopy') }}
            </button>
          </div>
        </div>
        <p
          v-if="customConfigError"
          class="mcp-client-config-error mcp-custom-client-error"
          role="alert"
        >
          {{ t('preferences.agent.customClientSetupFailed', {
            reason: conciseError(customConfigError)
          }) }}
          {{ t('preferences.agent.customClientManualFallback') }}
        </p>
        <div v-show="customDetailsExpanded" class="mcp-custom-client-details">
          <p>{{ t('preferences.agent.customClientDetailsDescription') }}</p>
          <ol>
            <li>{{ t('preferences.agent.customClientStepSkill') }}</li>
            <li>{{ t('preferences.agent.customClientStepPaste') }}</li>
            <li>{{ t('preferences.agent.customClientStepRestart') }}</li>
          </ol>
          <p>{{ t('preferences.agent.customClientPermissionBoundary') }}</p>
        </div>
      </section>
    </div>

    <el-button
      v-if="!showAddClientCard"
      class="mcp-add-client"
      size="small"
      @click="openAddClientCard"
    >
      {{ t('preferences.agent.clientAdd') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import claudeCodeIcon from '@/assets/agent-icons/claude-code.svg?url'
import chatGptIcon from '@/assets/agent-icons/chatgpt.png?url'
import openCodeIcon from '@/assets/agent-icons/opencode.svg?url'
import qoderWorkIcon from '@/assets/agent-icons/qoderwork.svg?url'
import workBuddyIcon from '@/assets/agent-icons/workbuddy.svg?url'
import type {
  AnnotaMDMcpClientId,
  AnnotaMDMcpClientState
} from '@shared/types/mcpClients'
import type {
  AnnotaMDMcpClientStatus,
  AnnotaMDMcpStatus
} from '@shared/types/comments'

const { t, te } = useI18n()
type ClientId = AnnotaMDMcpClientId

const clientIds: ClientId[] = ['codex', 'claude-code']
const emptyClientState = (id: ClientId): AnnotaMDMcpClientState => ({
  id,
  installed: false,
  configured: false,
  mcpConfigured: false,
  skillConfigured: false,
  canAutoConfigure: true
})

const inspectedClients = ref<AnnotaMDMcpClientState[]>(clientIds.map(emptyClientState))
const mcpStatus = ref<AnnotaMDMcpStatus>({ enabled: false, running: false, clients: [] })
const initialInspectionPending = ref(true)
const busyClient = ref<ClientId | null>(null)
const configureErrors = ref<Partial<Record<ClientId, string>>>({})
const expandedErrorClientId = ref<ClientId | null>(null)
const customConfigCopied = ref(false)
const customConfigBusy = ref(false)
const customConfigError = ref<string | null>(null)
const customDetailsExpanded = ref(false)
const showCustomSetup = ref(false)
const showAddClientCard = ref(false)
const pendingClientId = ref<ClientId | 'custom' | ''>('')
const addedClientIds = ref<ClientId[]>([])
const missingIcons = ref<Record<string, boolean>>({})
let stopMcpStatusListener: null | (() => void) = null

const clientNames: Record<ClientId, string> = {
  codex: 'ChatGPT',
  'claude-code': 'Claude Code'
}

const clientIcons: Record<ClientId, string> = {
  codex: chatGptIcon,
  'claude-code': claudeCodeIcon
}
const clientSkillPaths: Record<ClientId, string> = {
  codex: '~/.agents/skills/annotamd-comment-review',
  'claude-code': '~/.claude/skills/annotamd-comment-review'
}

const conciseError = (error: string | undefined): string => (
  (error || t('preferences.agent.clientUnknownError'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240)
)

const setConfigureError = (id: ClientId, error?: string): void => {
  const next = { ...configureErrors.value }
  if (error) next[id] = error
  else delete next[id]
  configureErrors.value = next
  if (!error && expandedErrorClientId.value === id) expandedErrorClientId.value = null
}

const toggleConfigureError = (id: ClientId): void => {
  expandedErrorClientId.value = expandedErrorClientId.value === id ? null : id
}

const normalizedClientName = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '')

const knownClientId = (name: string): ClientId | null => {
  const normalized = normalizedClientName(name)
  if (normalized.includes('chatgpt') || normalized.includes('codex')) return 'codex'
  if (normalized.includes('claude')) return 'claude-code'
  return null
}

const connectedClient = (id: ClientId): AnnotaMDMcpClientStatus | undefined =>
  mcpStatus.value.clients.find((client) => client.connected && knownClientId(client.name) === id)

const knownClientHistory = (id: ClientId): AnnotaMDMcpClientStatus | undefined =>
  mcpStatus.value.clients.find((client) => knownClientId(client.name) === id)

const otherClients = computed(() =>
  mcpStatus.value.clients.filter((client) => knownClientId(client.name) === null)
)
const visibleInspectedClients = computed(() => inspectedClients.value.filter((client) => (
  client.mcpConfigured ||
  connectedClient(client.id) != null ||
  addedClientIds.value.includes(client.id) ||
  busyClient.value === client.id ||
  configureErrors.value[client.id] != null
)))
const clientMcpReady = (client: AnnotaMDMcpClientState): boolean => (
  client.mcpConfigured || connectedClient(client.id) != null
)
const availableClientIds = computed(() => clientIds.filter((id) => (
  !visibleInspectedClients.value.some((client) => client.id === id)
)))
const hasVisibleClients = computed(() => (
  visibleInspectedClients.value.length > 0 ||
  otherClients.value.length > 0 ||
  showCustomSetup.value ||
  showAddClientCard.value
))

const displayClientName = (name: string): string => {
  const normalized = normalizedClientName(name)
  if (normalized.includes('workbuddy')) return 'WorkBuddy'
  if (normalized.includes('qoderwork') || normalized === 'qoder') return 'QoderWork'
  if (normalized.includes('opencode')) return 'OpenCode'
  return name
}

const clientIcon = (name: string): string | undefined => {
  const normalized = normalizedClientName(name)
  if (normalized.includes('workbuddy')) return workBuddyIcon
  if (normalized.includes('qoderwork') || normalized === 'qoder') return qoderWorkIcon
  if (normalized.includes('opencode')) return openCodeIcon
  return undefined
}

const ageText = (lastSeenAt: number): string => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastSeenAt) / 1000))
  if (elapsedSeconds < 5) return t('preferences.agent.clientJustNow')
  if (elapsedSeconds < 60) {
    return t('preferences.agent.clientSecondsAgo', { count: elapsedSeconds })
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60)
  if (elapsedMinutes < 60) {
    return t('preferences.agent.clientMinutesAgo', { count: elapsedMinutes })
  }
  return t('preferences.agent.clientHoursAgo', { count: Math.floor(elapsedMinutes / 60) })
}

const connectionText = (client: AnnotaMDMcpClientStatus): string => t(
  client.connected
    ? 'preferences.agent.clientConnectedAge'
    : 'preferences.agent.clientLastConnectedAge',
  { age: ageText(client.lastSeenAt) }
)

const stateText = (client: AnnotaMDMcpClientState): string => {
  if (initialInspectionPending.value) return detectingText()
  if (configureErrors.value[client.id]) return t('preferences.agent.clientConfigureFailed')
  if (client.error) return t('preferences.agent.clientDetectionFailed')
  if (!client.installed) return t('preferences.agent.clientInstallFirst')
  if (client.mcpConfigured && !client.skillConfigured) {
    return t('preferences.agent.clientSkillMissing')
  }
  const liveClient = connectedClient(client.id)
  if (liveClient) return connectionText(liveClient)
  const previousClient = knownClientHistory(client.id)
  if (previousClient) return connectionText(previousClient)
  if (client.configured) return t('preferences.agent.clientConfiguredWaiting')
  return t('preferences.agent.clientAvailable')
}

const clientStateClass = (id: ClientId): string => {
  if (configureErrors.value[id]) return 'error'
  if (connectedClient(id)) return 'online'
  if (knownClientHistory(id)) return 'offline'
  return 'idle'
}

const detectingText = (): string => {
  const key = 'preferences.agent.clientDetecting'
  return te(key) ? t(key) : t('preferences.agent.clientConfiguring')
}

const markIconMissing = (id: string): void => {
  missingIcons.value = { ...missingIcons.value, [id]: true }
}

const refresh = async(): Promise<void> => {
  try {
    const inspected = await window.electron.ipcRenderer.invoke('annotamd::mcp-clients::inspect')
    inspectedClients.value = clientIds.map((id) =>
      inspected.find((client) => client.id === id) ?? {
        ...emptyClientState(id),
        error: 'Client detection returned no result'
      }
    )
  } catch {
    inspectedClients.value = clientIds.map((id) => ({
      ...emptyClientState(id),
      error: 'Client detection failed'
    }))
  } finally {
    initialInspectionPending.value = false
  }
}

const configure = async(id: ClientId): Promise<void> => {
  busyClient.value = id
  setConfigureError(id)
  try {
    const result = await window.electron.ipcRenderer.invoke('annotamd::mcp-clients::configure', id)
    const index = inspectedClients.value.findIndex((client) => client.id === id)
    if (index >= 0) inspectedClients.value[index] = result.client
    if (result.client.mcpConfigured) {
      addedClientIds.value = addedClientIds.value.filter((clientId) => clientId !== id)
    }
    if (!result.success) {
      setConfigureError(id, result.message || t('preferences.agent.clientUnknownError'))
      customDetailsExpanded.value = true
    }
  } catch (error) {
    setConfigureError(id, error instanceof Error ? error.message : String(error))
    customDetailsExpanded.value = true
  } finally {
    busyClient.value = null
  }
}

const openAddClientCard = (): void => {
  pendingClientId.value = ''
  showAddClientCard.value = true
}

const cancelPendingClient = (): void => {
  pendingClientId.value = ''
  showAddClientCard.value = false
}

const confirmClientSelection = (client: ClientId | 'custom'): void => {
  if (client === 'custom') {
    showCustomSetup.value = true
    customDetailsExpanded.value = true
    cancelPendingClient()
    return
  }
  if (!addedClientIds.value.includes(client)) {
    addedClientIds.value = [...addedClientIds.value, client]
  }
  cancelPendingClient()
}

const removeAddedClient = (client: ClientId): void => {
  addedClientIds.value = addedClientIds.value.filter((clientId) => clientId !== client)
  setConfigureError(client)
}

const cancelCustomSetup = (): void => {
  showCustomSetup.value = false
  customDetailsExpanded.value = false
  customConfigError.value = null
}

const copyCustomConfig = async(): Promise<void> => {
  customConfigBusy.value = true
  customConfigError.value = null
  try {
    try {
      await window.electron.ipcRenderer.invoke('annotamd::mcp-clients::install-portable-skill')
    } catch (error) {
      customConfigError.value = error instanceof Error ? error.message : String(error)
      customDetailsExpanded.value = true
    }

    const result = await window.electron.ipcRenderer.invoke('annotamd::mcp-clients::manual-config')
    window.electron.clipboard.writeText(result.manualConfig)
    customConfigCopied.value = true
    window.setTimeout(() => {
      customConfigCopied.value = false
    }, 1600)
  } catch (error) {
    customConfigError.value = error instanceof Error ? error.message : String(error)
    customDetailsExpanded.value = true
  } finally {
    customConfigBusy.value = false
  }
}

onMounted(() => {
  void refresh()
  window.addEventListener('annotamd-agent-configuration-changed', refresh)
  void window.electron.ipcRenderer.invoke('annotamd::comments::mcp-status').then((status) => {
    mcpStatus.value = status
  })
  stopMcpStatusListener = window.electron.ipcRenderer.on(
    'annotamd::comments::mcp-status-changed',
    (_event, status) => {
      mcpStatus.value = status
    }
  )
})

onBeforeUnmount(() => {
  stopMcpStatusListener?.()
  window.removeEventListener('annotamd-agent-configuration-changed', refresh)
})
</script>

<style scoped>
.mcp-client-state-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--editorColor30);
}

.mcp-client-state-dot.online {
  background: #20a162;
  box-shadow: 0 0 0 3px color-mix(in srgb, #20a162 12%, transparent);
}

.mcp-client-state-dot.offline {
  background: var(--editorColor30);
}

.mcp-client-state-dot.error {
  background: #cf3f3f;
}

.mcp-client-list {
  overflow: hidden;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
}

.mcp-add-client {
  width: 100%;
  height: 34px;
  margin-top: 10px;
  font-size: var(--agent-body-font-size, 13px);
}

.mcp-add-client-card {
  gap: 10px;
}

.mcp-add-client-select {
  flex: 1 1 auto;
}

.mcp-client-row {
  box-sizing: border-box;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  min-height: 76px;
  padding: 12px 13px;
  border-bottom: 1px solid var(--floatBorderColor);
}

.mcp-client-row:last-child {
  border-bottom: 0;
}

.mcp-client-row.configured {
  background: color-mix(in srgb, #20a162 4%, var(--editorBgColor));
}

.mcp-client-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.mcp-client-identity {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.mcp-client-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--themeColor) 10%, var(--editorBgColor));
  color: var(--themeColor);
  font-size: 12px;
  font-weight: 700;
}

.mcp-client-mark img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.mcp-client-mark-chatgpt img {
  width: 22px;
  height: 22px;
}

.mcp-client-copy {
  min-width: 0;
}

.mcp-client-copy strong,
.mcp-client-copy small {
  display: block;
}

.mcp-client-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.mcp-client-copy strong {
  color: var(--editorColor);
  font-size: var(--agent-card-title-font-size, 14px);
  line-height: var(--agent-text-line-height, 1.4);
}

.mcp-client-copy small {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--editorColor80);
  font-size: var(--agent-meta-font-size, 12px);
  line-height: var(--agent-text-line-height, 1.4);
}

.mcp-client-error-toggle {
  height: 22px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, #cf3f3f 38%, var(--floatBorderColor));
  border-radius: 5px;
  background: color-mix(in srgb, #cf3f3f 7%, var(--editorBgColor));
  color: #c43535;
  cursor: pointer;
  font: inherit;
  line-height: 20px;
}

.mcp-client-config-error {
  width: 100%;
  box-sizing: border-box;
  margin-top: 11px;
  padding: 10px 12px;
  border-radius: 6px;
  background: color-mix(in srgb, #cf3f3f 5%, var(--editorBgColor));
  color: var(--editorColor80);
  font-size: var(--agent-meta-font-size, 12px);
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.mcp-client-config-error p {
  margin: 0;
}

.mcp-client-config-error p + p {
  margin-top: 6px;
}

.mcp-client-button {
  min-width: 72px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 6px;
  background: var(--editorBgColor);
  color: var(--editorColor);
  cursor: pointer;
  font-size: 12px;
}

.mcp-client-button.primary {
  border-color: var(--themeColor);
  background: var(--themeColor);
  color: #fff;
}

.mcp-client-button.connected {
  border-color: color-mix(in srgb, #20a162 35%, var(--floatBorderColor));
  color: #168f52;
}

.mcp-client-button.configured,
.mcp-client-button.offline {
  color: var(--editorColor80);
}

.mcp-client-button:disabled {
  cursor: default;
  opacity: 0.72;
}

.mcp-custom-client {
  min-height: 58px;
  padding: 8px 13px;
  background: var(--editorBgColor);
}

.mcp-custom-client-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 58px;
}

.mcp-custom-client-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--editorColor);
  cursor: pointer;
  font: inherit;
}

.mcp-custom-client-icon {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.mcp-custom-client-copy {
  min-width: 0;
  text-align: left;
}

.mcp-custom-client-title {
  display: flex;
  align-items: center;
  gap: 3px;
}

.mcp-custom-client-copy strong,
.mcp-custom-client-copy small {
  display: block;
}

.mcp-custom-client-copy strong {
  color: var(--editorColor);
  font-size: 13px;
}

.mcp-custom-client-copy small,
.mcp-custom-client p,
.mcp-custom-client ol {
  color: var(--editorColor80);
  font-size: 11px;
  line-height: 1.55;
}

.mcp-custom-client .mcp-custom-client-error {
  margin: 0 0 8px 38px;
  color: #d46b08;
}

.mcp-custom-client-copy small {
  margin-top: 2px;
}

.mcp-custom-client-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  color: var(--editorColor50);
  font-size: 16px;
  line-height: 1;
  transition: transform 0.15s ease;
}

.mcp-custom-client-toggle[aria-expanded='true'] .mcp-custom-client-chevron {
  transform: rotate(90deg);
}

.mcp-custom-client-details {
  margin-top: 10px;
  margin-left: 38px;
}

.mcp-custom-client-details > p:first-child {
  margin-top: 0;
}

.mcp-custom-client ol {
  margin: 10px 0 0;
  padding-left: 18px;
}

.mcp-custom-client p {
  margin: 7px 0 0;
}
</style>
