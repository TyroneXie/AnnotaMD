<template>
  <div class="mcp-client-setup">
    <div class="mcp-client-summary">
      <span>{{ t('preferences.agent.clientConnectionDescription') }}</span>
      <span class="mcp-listener-state" :class="listenerStateClass">
        <i aria-hidden="true" />
        {{ listenerStateText }}
      </span>
    </div>

    <div class="mcp-client-list">
      <div v-for="client in inspectedClients" :key="client.id" class="mcp-client-row">
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
            <strong>{{ clientNames[client.id] }}</strong>
            <small>
              <i class="mcp-client-state-dot" :class="clientStateClass(client.id)" />
              {{ stateText(client) }}
            </small>
          </span>
        </div>
        <button
          v-if="connectedClient(client.id)"
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
          v-else-if="client.configured"
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

      <div v-for="client in otherClients" :key="client.name" class="mcp-client-row">
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

      <section class="mcp-custom-client">
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
          <button
            type="button"
            class="mcp-client-button primary"
            @click="copyCustomConfig"
          >
            {{ customConfigCopied
              ? t('preferences.agent.clientCopied')
              : t('preferences.agent.customClientCopy') }}
          </button>
        </div>
        <div v-show="customDetailsExpanded" class="mcp-custom-client-details">
          <p>{{ t('preferences.agent.customClientDetailsDescription') }}</p>
          <ol>
            <li>{{ t('preferences.agent.customClientStepPaste') }}</li>
            <li>{{ t('preferences.agent.customClientStepRestart') }}</li>
          </ol>
          <p>{{ t('preferences.agent.customClientPermissionBoundary') }}</p>
        </div>
      </section>
    </div>
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
  canAutoConfigure: true
})

const inspectedClients = ref<AnnotaMDMcpClientState[]>(clientIds.map(emptyClientState))
const mcpStatus = ref<AnnotaMDMcpStatus>({ enabled: false, running: false, clients: [] })
const initialInspectionPending = ref(true)
const busyClient = ref<ClientId | null>(null)
const customConfigCopied = ref(false)
const customDetailsExpanded = ref(false)
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
  const liveClient = connectedClient(client.id)
  if (liveClient) return connectionText(liveClient)
  const previousClient = knownClientHistory(client.id)
  if (previousClient) return connectionText(previousClient)
  if (initialInspectionPending.value) return detectingText()
  if (client.error) return t('preferences.agent.clientDetectionFailed')
  if (!client.installed) return t('preferences.agent.clientInstallFirst')
  if (client.configured) return t('preferences.agent.clientConfiguredWaiting')
  return t('preferences.agent.clientAvailable')
}

const clientStateClass = (id: ClientId): string => {
  if (connectedClient(id)) return 'online'
  if (knownClientHistory(id)) return 'offline'
  return 'idle'
}

const listenerStateText = computed(() => {
  if (!mcpStatus.value.enabled) return t('preferences.agent.clientListeningOff')
  if (!mcpStatus.value.running) return t('preferences.agent.clientListeningError')
  return t('preferences.agent.clientListening')
})

const listenerStateClass = computed(() => {
  if (!mcpStatus.value.enabled) return 'off'
  return mcpStatus.value.running ? 'listening' : 'error'
})

const detectingText = (): string => {
  const key = 'preferences.agent.clientDetecting'
  return te(key) ? t(key) : t('preferences.agent.clientConfiguring')
}

const markIconMissing = (id: string): void => {
  missingIcons.value = { ...missingIcons.value, [id]: true }
}

const refresh = async(): Promise<void> => {
  try {
    const inspected = await window.electron.ipcRenderer.invoke('mt::mcp-clients::inspect')
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
  try {
    const result = await window.electron.ipcRenderer.invoke('mt::mcp-clients::configure', id)
    const index = inspectedClients.value.findIndex((client) => client.id === id)
    if (index >= 0) inspectedClients.value[index] = result.client
  } finally {
    busyClient.value = null
  }
}

const copyCustomConfig = async(): Promise<void> => {
  const result = await window.electron.ipcRenderer.invoke('mt::mcp-clients::manual-config')
  window.electron.clipboard.writeText(result.manualConfig)
  customConfigCopied.value = true
  window.setTimeout(() => {
    customConfigCopied.value = false
  }, 1600)
}

onMounted(() => {
  void refresh()
  void window.electron.ipcRenderer.invoke('mt::comments::mcp-status').then((status) => {
    mcpStatus.value = status
  })
  stopMcpStatusListener = window.electron.ipcRenderer.on(
    'mt::comments::mcp-status-changed',
    (_event, status) => {
      mcpStatus.value = status
    }
  )
})

onBeforeUnmount(() => stopMcpStatusListener?.())
</script>

<style scoped>
.mcp-client-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0 0 9px;
  color: var(--editorColor80);
  font-size: 12px;
}

.mcp-listener-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  color: var(--editorColor80);
  white-space: nowrap;
}

.mcp-listener-state i,
.mcp-client-state-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 6px;
  border-radius: 50%;
  background: var(--editorColor30);
}

.mcp-listener-state.listening {
  color: #168f52;
}

.mcp-listener-state.listening i,
.mcp-client-state-dot.online {
  background: #20a162;
  box-shadow: 0 0 0 3px color-mix(in srgb, #20a162 12%, transparent);
}

.mcp-listener-state.error,
.mcp-listener-state.error i {
  color: #d46b08;
}

.mcp-listener-state.error i {
  background: #d46b08;
}

.mcp-client-state-dot.offline {
  background: var(--editorColor30);
}

.mcp-client-list {
  overflow: hidden;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
}

.mcp-client-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 58px;
  padding: 8px 13px;
  border-bottom: 1px solid var(--floatBorderColor);
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

.mcp-client-copy strong {
  color: var(--editorColor);
  font-size: 13px;
}

.mcp-client-copy small {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--editorColor80);
  font-size: 11px;
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
