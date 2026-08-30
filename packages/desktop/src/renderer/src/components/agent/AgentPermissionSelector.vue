<template>
  <div class="annotamd-agent-permission-control">
    <button
      ref="trigger"
      type="button"
      :class="{ 'is-unsupported': mode === 'request' && !requestSupported }"
      class="annotamd-agent-permission-trigger"
      data-testid="ai-permission-trigger"
      :title="t('annotamd.agentWorkspace.permissionMode')"
      :aria-label="t('annotamd.agentWorkspace.permissionMode')"
      :aria-expanded="visible"
      @click="emit('update:visible', !visible)"
    >
      <el-icon><Lock v-if="mode === 'request'" /><Unlock v-else /></el-icon>
      <span>{{ modeLabel }}</span>
      <el-icon class="is-chevron"><ArrowDown /></el-icon>
    </button>

    <Teleport to="body">
      <section
        v-if="visible"
        ref="menu"
        :style="menuStyle"
        class="annotamd-agent-permission-menu"
        data-testid="ai-permission-menu"
      >
        <header>
          <strong>{{ t('annotamd.agentWorkspace.permissionMode') }}</strong>
          <small>{{ t('annotamd.agentWorkspace.permissionDescription') }}</small>
        </header>
        <button
          type="button"
          :class="{ 'is-active': mode === 'request' }"
          :disabled="!requestSupported"
          data-testid="ai-permission-request"
          @click="select('request')"
        >
          <span class="is-icon"><el-icon><Lock /></el-icon></span>
          <span>
            <b>{{ t('annotamd.agentWorkspace.permissionRequest') }}</b>
            <small class="is-description">{{ t('annotamd.agentWorkspace.permissionRequestDescription') }}</small>
            <small v-if="!requestSupported" class="is-unsupported-note">
              {{ t('annotamd.agentWorkspace.permissionRequestUnsupported') }}
            </small>
          </span>
          <el-icon v-if="mode === 'request'"><Check /></el-icon>
        </button>
        <button
          type="button"
          :class="{ 'is-active': mode === 'full-access' }"
          data-testid="ai-permission-full-access"
          @click="select('full-access')"
        >
          <span class="is-icon"><el-icon><Unlock /></el-icon></span>
          <span>
            <b>{{ t('annotamd.agentWorkspace.permissionFullAccess') }}</b>
            <small class="is-description">{{ t('annotamd.agentWorkspace.permissionFullAccessDescription') }}</small>
          </span>
          <el-icon v-if="mode === 'full-access'"><Check /></el-icon>
        </button>
        <p v-if="mode === 'full-access'">
          {{ t('annotamd.agentWorkspace.permissionFullAccessWarning') }}
        </p>
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ArrowDown, Check, Lock, Unlock } from '@element-plus/icons-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiPermissionMode, AiProviderId } from '@shared/types/aiWorkspace'
import { supportsNativeApprovalBridge } from '@shared/types/aiProviderPresets'
import { useAiSettingsStore } from '../../store/aiSettings'

const props = defineProps<{ visible: boolean; provider?: AiProviderId }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const { t } = useI18n()
const settings = useAiSettingsStore()
const trigger = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const menuStyle = ref<Record<string, string>>({})
const mode = computed(() => settings.selections.agent.permissionMode)
const requestSupported = computed(() => supportsNativeApprovalBridge(props.provider))
const modeLabel = computed(() => t(
  mode.value === 'request'
    ? 'annotamd.agentWorkspace.permissionRequest'
    : 'annotamd.agentWorkspace.permissionFullAccess'
))
const select = (value: AiPermissionMode): void => {
  settings.selectPermissionMode('agent', value)
  emit('update:visible', false)
}
const onDocumentPointerDown = (event: PointerEvent): void => {
  if (!props.visible) return
  const target = event.target
  if (!(target instanceof Node)) return
  if (trigger.value?.contains(target)) return
  if (menu.value?.contains(target)) return
  emit('update:visible', false)
}
const positionMenu = (): void => {
  if (!props.visible || !trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const width = 292
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
  menuStyle.value = {
    left: `${left}px`,
    bottom: `${window.innerHeight - rect.top + 8}px`,
    width: `${width}px`
  }
}
watch(() => props.visible, (visible) => {
  if (visible) void nextTick(positionMenu)
})
onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  window.addEventListener('resize', positionMenu)
  if (props.visible) void nextTick(positionMenu)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', positionMenu)
})
</script>

<style scoped>
.annotamd-agent-permission-control { min-width: 0; }
.annotamd-agent-permission-trigger { display: inline-flex; width: 100%; min-width: 0; height: 30px; align-items: center; gap: 5px; padding: 0 8px; color: var(--annotamd-muted); border: 1px solid var(--annotamd-border); border-radius: 7px; background: var(--annotamd-surface); cursor: pointer; font: inherit; font-size: 11px; }
.annotamd-agent-permission-trigger:hover { color: var(--annotamd-text); background: var(--annotamd-fill-soft); }
.annotamd-agent-permission-trigger.is-unsupported { color: #b54708; border-color: color-mix(in srgb, #f79009 32%, var(--annotamd-border)); }
.annotamd-agent-permission-trigger > span { overflow: hidden; max-width: 76px; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-permission-trigger svg { width: 14px; height: 14px; }
.annotamd-agent-permission-trigger .is-chevron { margin-left: auto; }
.annotamd-agent-permission-menu { position: fixed; z-index: 3000; box-sizing: border-box; display: grid; gap: 6px; padding: 12px; border: 1px solid var(--annotamd-border); border-radius: 10px; background: var(--annotamd-surface); box-shadow: 0 10px 30px color-mix(in srgb, #000 13%, transparent); }
.annotamd-agent-permission-menu > header { display: grid; gap: 2px; padding: 1px 2px 8px; }
.annotamd-agent-permission-menu > header strong { color: var(--annotamd-text); font-size: 13px; line-height: 1.35; }
.annotamd-agent-permission-menu > header small { color: var(--annotamd-muted); font-size: 10px; line-height: 1.45; }
.annotamd-agent-permission-menu > button { display: grid; grid-template-columns: 30px minmax(0, 1fr) 18px; align-items: start; gap: 9px; padding: 9px; text-align: left; color: var(--annotamd-text); border: 1px solid var(--annotamd-border); border-radius: 8px; background: var(--annotamd-surface); cursor: pointer; transition: background-color .15s ease, border-color .15s ease; }
.annotamd-agent-permission-menu > button:hover { border-color: color-mix(in srgb, var(--annotamd-green) 18%, var(--annotamd-border)); background: var(--annotamd-fill-soft); }
.annotamd-agent-permission-menu > button.is-active { border-color: color-mix(in srgb, var(--annotamd-green) 28%, var(--annotamd-border)); background: color-mix(in srgb, var(--annotamd-green) 8%, var(--annotamd-surface)); }
.annotamd-agent-permission-menu > button:disabled { opacity: .58; cursor: not-allowed; }
.annotamd-agent-permission-menu .is-icon { display: grid; width: 28px; height: 28px; place-items: center; color: var(--annotamd-muted); border-radius: 7px; background: var(--annotamd-fill-soft); }
.annotamd-agent-permission-menu > button.is-active .is-icon { color: var(--annotamd-green); background: color-mix(in srgb, var(--annotamd-green) 12%, var(--annotamd-surface)); }
.annotamd-agent-permission-menu .is-icon svg { width: 15px; height: 15px; }
.annotamd-agent-permission-menu > button > svg { width: 15px; height: 15px; margin-top: 6px; color: var(--annotamd-green); }
.annotamd-agent-permission-menu span { display: grid; gap: 2px; }
.annotamd-agent-permission-menu b { font-size: 12px; font-weight: 600; line-height: 1.4; }
.annotamd-agent-permission-menu small { color: var(--annotamd-muted); font-size: 10px; line-height: 1.45; }
.annotamd-agent-permission-menu small.is-description { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.annotamd-agent-permission-menu small.is-unsupported-note { color: #b54708; }
.annotamd-agent-permission-menu p { margin: 2px 0 0; padding: 8px 9px; color: #9a3412; border-top: 1px solid color-mix(in srgb, #f79009 24%, var(--annotamd-border-soft)); background: color-mix(in srgb, #f79009 6%, transparent); font-size: 10px; line-height: 1.45; }
</style>
