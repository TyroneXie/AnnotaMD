<template>
  <div class="recent-files-projects">
    <section class="start-panel">
      <div class="start-icon" aria-hidden="true">
        <span />
      </div>
      <h2>{{ t('recent.startTitle') }}</h2>
      <p class="start-description">
        {{ t('recent.startDescription') }}
      </p>
      <div class="start-actions">
        <button
          type="button"
          class="start-primary"
          @click="openFile"
        >
          {{ t('recent.openFile') }}
        </button>
        <button
          type="button"
          class="start-secondary"
          @click="newFile"
        >
          {{ t('recent.newBlankFile') }}
        </button>
      </div>
      <p class="drag-hint">
        {{ t('recent.dragHint') }}
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useEditorStore } from '@/store/editor'
import { t } from '../../i18n'

const editorStore = useEditorStore()

const openFile = (): void => {
  window.electron.ipcRenderer.send('mt::cmd-open-file')
}

const newFile = (): void => {
  editorStore.NEW_UNTITLED_TAB({})
}
</script>

<style scoped>
.recent-files-projects {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  background: var(--editorBgColor);
}

.start-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(440px, calc(100% - 48px));
  color: var(--editorColor);
  text-align: center;
}

.start-icon {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin-bottom: 16px;
  color: var(--themeColor);
  background: color-mix(in srgb, var(--themeColor) 10%, transparent);
  border-radius: 12px;
}

.start-icon::before {
  width: 18px;
  height: 22px;
  border: 1.7px solid currentcolor;
  border-radius: 3px;
  content: '';
}

.start-icon::after {
  position: absolute;
  top: 11px;
  right: 11px;
  width: 7px;
  height: 7px;
  background: var(--editorBgColor);
  border-bottom: 1.7px solid currentcolor;
  border-left: 1.7px solid currentcolor;
  content: '';
}

.start-icon span,
.start-icon span::before {
  position: absolute;
  width: 9px;
  height: 1.5px;
  background: currentcolor;
  border-radius: 999px;
  content: '';
}

.start-icon span {
  top: 24px;
  left: 17px;
}

.start-icon span::before {
  top: 4px;
  left: 0;
}

.start-panel h2 {
  margin: 0;
  color: var(--editorColor);
  font-weight: 650;
  font-size: 20px;
  line-height: 1.4;
}

.start-description {
  margin: 8px 0 0;
  color: var(--editorColor50);
  font-size: 13px;
  line-height: 1.6;
}

.start-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 22px;
}

.start-actions button {
  min-width: 112px;
  height: 36px;
  padding: 0 18px;
  font: inherit;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.start-primary {
  color: var(--editorColor);
  background: transparent;
  border: 1px solid var(--borderColor);
}

.start-secondary {
  color: var(--editorColor);
  background: transparent;
  border: 1px solid transparent;
}

.start-primary:hover,
.start-primary:focus-visible,
.start-secondary:hover,
.start-secondary:focus-visible {
  color: var(--buttonPrimaryFontColor);
  background: var(--buttonPrimaryBgColor);
  border-color: transparent;
}

.drag-hint {
  margin: 16px 0 0;
  color: var(--editorColor30);
  font-size: 12px;
  line-height: 1.5;
}
</style>
