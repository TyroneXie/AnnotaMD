<template>
  <div class="direct-agent-setup">
    <div
      class="direct-agent-panel"
      :class="{ selected: selectedProfile }"
    >
      <div class="direct-agent-summary">
        <div class="direct-agent-identity">
          <input
            v-if="selectedProfile"
            class="direct-agent-selector"
            type="radio"
            name="annotamd-comment-agent"
            :aria-label="selectedProfileName"
            checked
            @change="selectedProfile && setDefaultProfile(selectedProfile.id)"
          >
          <div class="direct-agent-summary-copy">
            <strong>{{ selectedProfileName || t('preferences.agent.directNoAgent') }}</strong>
            <small>{{ directStatusText }}</small>
          </div>
        </div>
        <div class="direct-agent-summary-actions">
          <el-button size="small" @click="advancedOpen = !advancedOpen">
            {{ advancedOpen
              ? t('preferences.agent.directHideAdvanced')
              : t('preferences.agent.directAdvanced') }}
          </el-button>
        </div>
      </div>

      <cli-agent-profiles
        ref="cliProfiles"
        :advanced="advancedOpen"
        :profile-id="selectedProfile?.id ?? ''"
        :show-add="false"
        @editing-change="profilesEditing = $event"
      />
    </div>
    <div
      v-for="profile in otherProfiles"
      :key="profile.id"
      class="direct-agent-panel"
    >
      <div class="direct-agent-summary direct-agent-summary-option">
        <div class="direct-agent-identity">
          <input
            class="direct-agent-selector"
            type="radio"
            name="annotamd-comment-agent"
            :aria-label="displayAgentProfileName(profile)"
            :checked="false"
            @change="setDefaultProfile(profile.id)"
          >
          <div class="direct-agent-summary-copy">
            <strong>{{ displayAgentProfileName(profile) }}</strong>
            <small>{{ t('preferences.agent.directNotSelected') }}</small>
          </div>
        </div>
      </div>
    </div>
    <el-button
      v-if="!profilesEditing"
      class="direct-agent-add"
      size="small"
      @click="cliProfiles?.startAdd()"
    >
      {{ t('preferences.agent.cliAdd') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import { useAgentReadinessStore } from '@/store/agentReadiness'
import { defaultAgentProfile, displayAgentProfileName } from '@shared/types/agentProfiles'
import CliAgentProfiles from './CliAgentProfiles.vue'

const { t } = useI18n()
const preferences = usePreferencesStore()
const agentReadiness = useAgentReadinessStore()
const {
  agentProfiles,
  commentMcpEnabled,
  defaultAgentProfileId
} = storeToRefs(preferences)
const advancedOpen = ref(false)
const profilesEditing = ref(false)
const cliProfiles = ref<{ startAdd: () => void } | null>(null)

const selectedProfile = computed(() => defaultAgentProfile(
  agentProfiles.value,
  defaultAgentProfileId.value
))
const selectedProfileName = computed(() => (
  selectedProfile.value ? displayAgentProfileName(selectedProfile.value) : ''
))
const otherProfiles = computed(() => agentProfiles.value.filter((profile) => (
  profile.id !== selectedProfile.value?.id
)))
const directStatusText = computed(() => {
  if (agentReadiness.loading) return t('preferences.agent.directChecking')
  if (!commentMcpEnabled.value) return t('preferences.agent.directCommentAccessDisabled')
  if (agentReadiness.directSendReady) {
    return t('preferences.agent.directReady')
  }
  if (!selectedProfile.value) return t('preferences.agent.directNoAgentDescription')
  if (!agentReadiness.selectedDirectSupported) {
    return t('preferences.agent.directUnsupported')
  }
  if (!agentReadiness.selectedCliAvailable) {
    return t('preferences.agent.directCommandMissing')
  }
  return t('preferences.agent.directCommandMissing')
})

const setDefaultProfile = (profileId: string): void => {
  preferences.SET_SINGLE_PREFERENCE({ type: 'defaultAgentProfileId', value: profileId })
  advancedOpen.value = false
  void agentReadiness.refresh()
}

watch(
  [agentProfiles, defaultAgentProfileId],
  () => void agentReadiness.refresh(),
  { deep: true }
)

onMounted(() => agentReadiness.start())
</script>

<style scoped>
.direct-agent-setup {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.direct-agent-panel {
  overflow: hidden;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  background: var(--editorBgColor);
}

.direct-agent-summary {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 76px;
  padding: 12px 13px;
}

.direct-agent-identity {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 11px;
}

.direct-agent-selector {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  margin: 0;
  accent-color: var(--themeColor);
}

.direct-agent-panel.selected {
  border-color: color-mix(in srgb, #20a162 40%, var(--floatBorderColor));
  background: color-mix(in srgb, #20a162 4%, var(--editorBgColor));
}

.direct-agent-summary-option {
  min-height: 76px;
}

.direct-agent-add {
  width: 100%;
  height: 34px;
  font-size: var(--agent-body-font-size, 13px);
}

.direct-agent-summary-copy strong,
.direct-agent-summary-copy small {
  display: block;
}

.direct-agent-summary-copy strong {
  color: var(--editorColor);
  font-size: var(--agent-card-title-font-size, 14px);
  line-height: var(--agent-text-line-height, 1.4);
}

.direct-agent-summary-copy small {
  margin-top: 2px;
  color: var(--editorColor80);
  font-size: var(--agent-meta-font-size, 12px);
  line-height: var(--agent-text-line-height, 1.4);
}

.direct-agent-summary-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

</style>
