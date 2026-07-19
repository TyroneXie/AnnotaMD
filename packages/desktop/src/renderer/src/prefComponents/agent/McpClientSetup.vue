<template>
  <div class="mcp-client-setup">
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
            <small>{{ stateText(client) }}</small>
          </span>
        </div>
        <button
          v-if="initialInspectionPending"
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

    <div class="mcp-client-footer">
      <span>{{ t('preferences.agent.clientPermissionBoundary') }}</span>
      <button type="button" :disabled="refreshing" @click="refresh(true)">
        {{ t('preferences.agent.clientRefresh') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import claudeCodeIcon from '@/assets/agent-icons/claude-code.svg?url'
import chatGptIcon from '@/assets/agent-icons/chatgpt.png?url'
import type {
  AnnotaMDMcpClientId,
  AnnotaMDMcpClientState
} from '@shared/types/mcpClients'

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
const refreshing = ref(true)
const initialInspectionPending = ref(true)
const busyClient = ref<ClientId | null>(null)
const customConfigCopied = ref(false)
const customDetailsExpanded = ref(false)
const missingIcons = ref<Record<string, boolean>>({})

const clientNames: Record<ClientId, string> = {
  codex: 'ChatGPT',
  'claude-code': 'Claude Code'
}

const clientIcons: Record<ClientId, string> = {
  codex: chatGptIcon,
  'claude-code': claudeCodeIcon
}

const stateText = (client: AnnotaMDMcpClientState): string => {
  if (initialInspectionPending.value) return detectingText()
  if (client.error) return t('preferences.agent.clientDetectionFailed')
  if (!client.installed) return t('preferences.agent.clientInstallFirst')
  if (client.configured) return t('preferences.agent.clientReady')
  return t('preferences.agent.clientAvailable')
}

const detectingText = (): string => {
  const key = 'preferences.agent.clientDetecting'
  return te(key) ? t(key) : t('preferences.agent.clientConfiguring')
}

const markIconMissing = (id: ClientId): void => {
  missingIcons.value = { ...missingIcons.value, [id]: true }
}

const refresh = async(forceRefresh = false): Promise<void> => {
  refreshing.value = true
  try {
    const inspected = await window.electron.ipcRenderer.invoke(
      'mt::mcp-clients::inspect',
      forceRefresh
    )
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
    refreshing.value = false
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

onMounted(() => refresh())
</script>

<style scoped>
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

.mcp-client-row:last-child {
  border-bottom: 0;
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

.mcp-custom-client-icon {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.mcp-client-fallback {
  display: grid;
  grid-template-columns: repeat(2, 4px);
  gap: 3px;
}

.mcp-client-fallback i {
  width: 4px;
  height: 4px;
  border-radius: 1px;
  background: currentColor;
}

.mcp-client-copy {
  min-width: 0;
}

.mcp-client-identity strong,
.mcp-client-identity small {
  display: block;
}

.mcp-client-identity strong {
  color: var(--editorColor);
  font-size: 13px;
}

.mcp-client-identity small {
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

.mcp-client-button.configured {
  border-color: color-mix(in srgb, #20a162 35%, var(--floatBorderColor));
  color: #20a162;
}

.mcp-client-button:disabled {
  cursor: default;
  opacity: 0.58;
}

.mcp-custom-client {
  min-height: 58px;
  padding: 8px 13px;
  background: var(--editorBgColor);
}

.mcp-custom-client-copy strong,
.mcp-custom-client-copy small {
  display: block;
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
  transform: rotate(0deg);
  transition: transform 0.15s ease;
}

.mcp-custom-client-toggle[aria-expanded='true'] .mcp-custom-client-chevron {
  transform: rotate(90deg);
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

.mcp-custom-client-details {
  margin-top: 10px;
  margin-left: 38px;
}

.mcp-custom-client-details > p:first-child {
  margin-top: 0;
}

.mcp-custom-client-copy small {
  margin-top: 2px;
}

.mcp-custom-client ol {
  margin: 10px 0 0;
  padding-left: 18px;
}

.mcp-custom-client p {
  margin: 7px 0 0;
}

.mcp-client-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-top: 8px;
  color: var(--editorColor80);
  font-size: 11px;
  line-height: 1.5;
}

.mcp-client-footer button {
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--themeColor);
  cursor: pointer;
  font: inherit;
}

.mcp-client-footer button:disabled {
  cursor: default;
  opacity: 0.5;
}
</style>
