<template>
  <div class="cli-agent-profiles">
    <div v-if="profilesToRender.length && advanced" class="cli-agent-list">
      <div
        v-for="profile in profilesToRender"
        :key="profile.id"
        class="cli-agent-card"
        :class="{
          selected: profile.id === selectedProfileId
        }"
      >
        <input
          v-if="profile.id !== selectedProfileId"
          class="cli-agent-selector"
          type="radio"
          name="annotamd-comment-agent"
          :aria-label="profile.name"
          :checked="profile.id === selectedProfileId"
          @change="setDefaultProfile(profile.id)"
        >
        <div class="cli-agent-card-main">
          <div v-if="profile.id !== selectedProfileId" class="cli-agent-name-row">
            <strong>{{ displayAgentProfileName(profile) }}</strong>
          </div>
          <span v-if="advanced" class="cli-agent-command">
            <span class="cli-agent-command-label">{{ t('preferences.agent.cliCommand') }}</span>
            {{ profile.command }}
          </span>
        </div>
        <div v-if="advanced" class="cli-agent-actions">
          <span
            v-if="profileStatus[profile.id]"
            class="cli-agent-test-result"
            :class="{ success: profileStatus[profile.id]?.available }"
          >
            {{ profileStatus[profile.id]?.available
              ? t('preferences.agent.cliCommandAvailable')
              : t('preferences.agent.cliCommandUnavailable') }}
          </span>
          <el-button size="small" :loading="testingProfileId === profile.id" @click="testSavedProfile(profile)">
            {{ t('preferences.agent.cliTest') }}
          </el-button>
          <el-button size="small" @click="editProfile(profile)">
            {{ t('preferences.agent.cliEdit') }}
          </el-button>
          <el-button size="small" @click="deleteProfile(profile.id)">
            {{ t('preferences.agent.cliDelete') }}
          </el-button>
        </div>
      </div>
    </div>

    <div v-if="editing" class="cli-agent-form">
      <label>
        <span>{{ t('preferences.agent.cliType') }}</span>
        <el-select v-model="draft.kind" @change="applyPreset">
          <el-option
            v-for="preset in presets"
            :key="preset.kind"
            :label="profileKindLabel(preset.kind)"
            :value="preset.kind"
          />
        </el-select>
      </label>
      <label>
        <span>{{ t('preferences.agent.cliName') }}</span>
        <el-input v-model="draft.name" />
      </label>
      <label>
        <span>{{ t('preferences.agent.cliCommand') }}</span>
        <el-input
          v-model="draft.command"
          :placeholder="t('preferences.agent.cliCommandPlaceholder')"
          @input="resetDraftTest"
        />
      </label>
      <p class="cli-agent-test-note">{{ t('preferences.agent.cliTestNote') }}</p>
      <div class="cli-agent-form-actions">
        <span
          v-if="draftTested"
          class="cli-agent-test-result"
          :class="{ success: draftAvailable }"
        >
          {{ draftAvailable
            ? t('preferences.agent.cliCommandAvailable')
            : t('preferences.agent.cliCommandUnavailable') }}
        </span>
        <el-button size="small" :loading="testingDraft" @click="testDraft">
          {{ t('preferences.agent.cliTest') }}
        </el-button>
        <el-button size="small" @click="cancelEdit">
          {{ t('preferences.agent.cliCancel') }}
        </el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="!canSave"
          @click="saveProfile"
        >
          {{ t('preferences.agent.cliSave') }}
        </el-button>
      </div>
    </div>

    <el-button v-else-if="showAdd" size="small" @click="startAdd">
      {{ t('preferences.agent.cliAdd') }}
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { usePreferencesStore } from '@/store/preferences'
import {
  ANNOTAMD_AGENT_PROFILE_PRESETS,
  defaultAgentProfile,
  displayAgentProfileName,
  parseAgentCommand,
  type AnnotaMDAgentProfile,
  type AnnotaMDAgentProfileKind
} from '@shared/types/agentProfiles'

const preferences = usePreferencesStore()
const { agentProfiles, defaultAgentProfileId } = storeToRefs(preferences)
const { t } = useI18n()
const presets = ANNOTAMD_AGENT_PROFILE_PRESETS

const props = withDefaults(defineProps<{
  advanced?: boolean
  profileId?: string
  showAdd?: boolean
}>(), {
  advanced: false,
  profileId: '',
  showAdd: true
})
const emit = defineEmits<{
  (event: 'editing-change', value: boolean): void
}>()

const editing = ref(false)
const editingProfileId = ref<string | null>(null)
const draft = reactive<AnnotaMDAgentProfile>({
  id: '',
  name: '',
  kind: 'codex',
  command: 'codex'
})
const testingDraft = ref(false)
const testingProfileId = ref<string | null>(null)
const draftTested = ref(false)
const draftAvailable = ref(false)
const testedDraftCommand = ref('')
const profileStatus = ref<Record<string, { available: boolean }>>({})
const selectedProfileId = computed(() => (
  defaultAgentProfile(agentProfiles.value, defaultAgentProfileId.value)?.id ?? ''
))
const profilesToRender = computed(() => (
  props.profileId
    ? agentProfiles.value.filter((profile) => profile.id === props.profileId)
    : agentProfiles.value
))
const canSave = computed(() => (
  Boolean(draft.name.trim()) &&
  Boolean(draft.command.trim()) &&
  draftAvailable.value &&
  testedDraftCommand.value === draft.command.trim()
))

const profileKindLabel = (kind: AnnotaMDAgentProfileKind): string => (
  t(`preferences.agent.cliKinds.${kind}`)
)

const updateProfiles = (profiles: AnnotaMDAgentProfile[]): void => {
  preferences.SET_SINGLE_PREFERENCE({
    type: 'agentProfiles',
    value: profiles.map((profile) => ({ ...profile }))
  })
}

const setDefaultProfile = (profileId: string): void => {
  preferences.SET_SINGLE_PREFERENCE({ type: 'defaultAgentProfileId', value: profileId })
}

const createProfileId = (): string => (
  window.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random().toString(16).slice(2)}`
)

const resetDraftTest = (): void => {
  draftTested.value = false
  draftAvailable.value = false
  testedDraftCommand.value = ''
}

const resetDraft = (profile?: AnnotaMDAgentProfile): void => {
  const initial = profile ?? {
    id: createProfileId(),
    name: presets[0]!.name,
    kind: presets[0]!.kind,
    command: presets[0]!.command
  }
  Object.assign(draft, initial)
  resetDraftTest()
}

const startAdd = (): void => {
  editingProfileId.value = null
  resetDraft()
  editing.value = true
  emit('editing-change', true)
}

const editProfile = (profile: AnnotaMDAgentProfile): void => {
  editingProfileId.value = profile.id
  resetDraft(profile)
  editing.value = true
  emit('editing-change', true)
}

const cancelEdit = (): void => {
  editing.value = false
  editingProfileId.value = null
  resetDraftTest()
  emit('editing-change', false)
}

const applyPreset = (kind: AnnotaMDAgentProfileKind): void => {
  const preset = presets.find((item) => item.kind === kind)
  if (!preset) return
  draft.name = preset.name
  draft.command = preset.command
  resetDraftTest()
}

const commandIsAvailable = async(command: string): Promise<boolean> => {
  let executable = ''
  try {
    executable = parseAgentCommand(command)[0] ?? ''
  } catch {
    return false
  }
  if (!executable) return false
  return /[\\/]/.test(executable)
    ? window.fileUtils.isExecutable(executable)
    : window.commandExists.exists(executable)
}

const testDraft = async(): Promise<void> => {
  testingDraft.value = true
  try {
    draftAvailable.value = await commandIsAvailable(draft.command)
    draftTested.value = true
    testedDraftCommand.value = draft.command.trim()
  } finally {
    testingDraft.value = false
  }
}

const testSavedProfile = async(profile: AnnotaMDAgentProfile): Promise<void> => {
  testingProfileId.value = profile.id
  try {
    profileStatus.value = {
      ...profileStatus.value,
      [profile.id]: { available: await commandIsAvailable(profile.command) }
    }
  } finally {
    testingProfileId.value = null
  }
}

const saveProfile = (): void => {
  if (!canSave.value) return
  const profile: AnnotaMDAgentProfile = {
    id: draft.id,
    name: draft.name.trim(),
    kind: draft.kind,
    command: draft.command.trim()
  }
  const index = agentProfiles.value.findIndex((item) => item.id === profile.id)
  const nextProfiles = agentProfiles.value.map((item) => ({ ...item }))
  if (index >= 0) nextProfiles.splice(index, 1, profile)
  else nextProfiles.push(profile)
  updateProfiles(nextProfiles)
  if (!defaultAgentProfileId.value) setDefaultProfile(profile.id)
  profileStatus.value = {
    ...profileStatus.value,
    [profile.id]: { available: true }
  }
  cancelEdit()
}

const deleteProfile = (profileId: string): void => {
  const nextProfiles = agentProfiles.value
    .filter((profile) => profile.id !== profileId)
    .map((profile) => ({ ...profile }))
  updateProfiles(nextProfiles)

  if (defaultAgentProfileId.value === profileId) {
    setDefaultProfile(nextProfiles[0]?.id ?? '')
  }
  if (editingProfileId.value === profileId) cancelEdit()
}

defineExpose({ startAdd })
</script>

<style scoped>
.cli-agent-profiles {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cli-agent-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--floatBorderColor);
}

.cli-agent-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 13px;
}

.cli-agent-card:not(:last-child) {
  border-bottom: 1px solid var(--floatBorderColor);
}

.cli-agent-selector {
  flex: 0 0 auto;
  accent-color: var(--themeColor);
}

.cli-agent-card-main {
  min-width: 0;
}

.cli-agent-name-row {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--editorColor);
  font-size: 14px;
}


.cli-agent-command {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: var(--editorColor60);
  font-family: var(--codeFontFamily);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cli-agent-command-label {
  margin-right: 8px;
  color: var(--editorColor80);
  font-family: var(--font-family);
}

.cli-agent-actions,
.cli-agent-form-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.cli-agent-form {
  display: grid;
  gap: 10px;
  padding: 12px 13px;
  border-top: 1px solid var(--floatBorderColor);
}

.cli-agent-form label {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  color: var(--editorColor);
  font-size: 13px;
}

.cli-agent-form-actions {
  justify-content: flex-end;
  margin-top: 4px;
}

.cli-agent-test-result {
  color: #c45656;
  font-size: 12px;
}

.cli-agent-test-result.success {
  color: #2f8f5b;
}

.cli-agent-test-note {
  margin: 5px 0 0;
  color: var(--editorColor80);
  font-size: 12px;
  line-height: 1.5;
}

.cli-agent-profiles > .el-button:last-child {
  height: 34px;
  margin: 10px 13px 12px;
}

</style>
