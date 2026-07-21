<template>
  <div
    class="open-file-split"
    @focusout="handleFocusOut"
    @keydown.esc.stop="closeMenu"
  >
    <button
      type="button"
      class="open-file-split-main"
      @click="openFile"
    >
      {{ t('recent.openFile') }}
    </button>
    <button
      type="button"
      class="open-file-split-toggle"
      :aria-label="`${t('recent.openFile')} / ${t('sideBar.tree.openFolder')}`"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click="menuOpen = !menuOpen"
    >
      <el-icon :size="14"><ArrowDown /></el-icon>
    </button>
    <div
      v-if="menuOpen"
      class="open-file-split-menu"
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        @click="openFolder"
      >
        {{ t('sideBar.tree.openFolder') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  (event: 'open-file'): void
  (event: 'open-folder'): void
}>()

const { t } = useI18n()
const menuOpen = ref(false)

const closeMenu = (): void => {
  menuOpen.value = false
}

const openFile = (): void => {
  closeMenu()
  emit('open-file')
}

const openFolder = (): void => {
  closeMenu()
  emit('open-folder')
}

const handleFocusOut = (event: FocusEvent): void => {
  const current = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (!current?.contains(next)) closeMenu()
}
</script>

<style scoped>
.open-file-split {
  position: relative;
  display: inline-flex;
  height: 36px;
  color: var(--buttonPrimaryFontColor);
  font-size: 13px;
  line-height: 1;
}

.open-file-split-main,
.open-file-split-toggle {
  box-sizing: border-box;
  height: 36px;
  border: var(--buttonPrimaryBorder);
  background: var(--buttonPrimaryBgColor);
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.open-file-split-main {
  min-width: 112px;
  padding: 0 18px;
  border-radius: 8px 0 0 8px;
}

.open-file-split-toggle {
  display: grid;
  width: 34px;
  place-items: center;
  padding: 0;
  border-left: 1px solid color-mix(in srgb, var(--buttonPrimaryFontColor) 26%, transparent);
  border-radius: 0 8px 8px 0;
}

.open-file-split-main:hover,
.open-file-split-main:focus-visible,
.open-file-split-toggle:hover,
.open-file-split-toggle:focus-visible {
  background: var(--buttonPrimaryBgColorHover, var(--buttonPrimaryBgColor));
  outline: none;
}

.open-file-split-main:focus-visible,
.open-file-split-toggle:focus-visible {
  box-shadow: var(--buttonPrimaryFocusShadow);
}

.open-file-split-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  right: 0;
  min-width: 146px;
  box-sizing: border-box;
  padding: 4px;
  border: 1px solid var(--floatBorderColor);
  border-radius: 8px;
  background: var(--floatBgColor);
  box-shadow: 0 6px 18px var(--floatShadow);
}

.open-file-split-menu button {
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--floatFontColor);
  font: inherit;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.open-file-split-menu button:hover,
.open-file-split-menu button:focus-visible {
  background: var(--floatHoverColor);
  outline: none;
}
</style>
