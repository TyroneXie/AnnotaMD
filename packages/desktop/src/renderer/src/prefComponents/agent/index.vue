<template>
  <div class="pref-agent">
    <h4>{{ t('preferences.agent.title') }}</h4>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.agent.mcpTitle') }}</h6>
      </template>
      <template #children>
        <bool
          class="agent-comment-access"
          :description="t('preferences.agent.enableComments')"
          :notes="t('preferences.agent.enableCommentsDescription')"
          :bool="commentMcpEnabled"
          :on-change="setMcpEnabled"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.agent.clientsTitle') }}</h6>
      </template>
      <template #children>
        <mcp-client-setup />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.agent.capabilitiesTitle') }}</h6>
      </template>
      <template #children>
        <div class="agent-capability-card">
          <strong>{{ t('preferences.agent.capabilitiesSummary') }}</strong>
          <ul>
            <li>{{ t('preferences.agent.capabilityDocument') }}</li>
            <li>{{ t('preferences.agent.capabilityComments') }}</li>
            <li>{{ t('preferences.agent.capabilityActions') }}</li>
          </ul>
          <p>{{ t('preferences.agent.permissionBoundary') }}</p>
        </div>
      </template>
    </compound>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import Bool from '../common/bool/index.vue'
import Compound from '../common/compound/index.vue'
import McpClientSetup from './McpClientSetup.vue'

const { t } = useI18n()
const preferences = usePreferencesStore()
const { commentMcpEnabled } = storeToRefs(preferences)

const setMcpEnabled = (value: boolean): void => {
  preferences.SET_SINGLE_PREFERENCE({ type: 'commentMcpEnabled', value })
}
</script>

<style scoped>
.pref-agent :deep(.agent-comment-access) {
  align-items: flex-start;
}

.pref-agent :deep(.agent-comment-access .notes) {
  font-style: normal;
}

.agent-capability-card {
  padding: 12px 14px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  background: color-mix(in srgb, var(--themeColor) 4%, var(--editorBgColor));
}

.agent-capability-card strong {
  color: var(--editorColor);
  font-size: 14px;
}

.agent-capability-card ul {
  margin: 9px 0;
  padding-left: 20px;
  color: var(--editorColor);
  line-height: 1.7;
}

.agent-capability-card p {
  margin: 0;
  color: var(--editorColor80);
  font-size: 12px;
  line-height: 1.5;
}
</style>
