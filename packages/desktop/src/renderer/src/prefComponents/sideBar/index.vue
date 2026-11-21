<template>
  <div class="pref-sidebar">
    <h3 class="title">
      <el-icon><Setting /></el-icon>
      {{ t('preferences.title') }}
    </h3>
    <section class="category">
      <div
        v-for="c of getCategory()"
        :key="c.name"
        class="item"
        :class="{ active: c.label === (route.name ?? 'general') }"
        @click="router.push(c.path)"
      >
        <component :is="c.icon" />
        <span>{{ c.name }}</span>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { getCategory } from './config'
import { onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Setting } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

let stopCategoryListener: (() => void) | null = null

const { t } = useI18n()

const router = useRouter()
const route = useRoute()

const onIpcCategoryChange = (_event: unknown, category: unknown): void => {
  const categoryName = typeof category === 'string' ? category : ''
  const validRoute =
    categoryName &&
    router.getRoutes().findIndex((r) => r.path.endsWith(`/${categoryName}`)) !== -1
  if (validRoute) {
    router.push({
      path: `/preference/${categoryName}`
    })
  }
}

onMounted(() => {
  stopCategoryListener = window.electron.ipcRenderer.on(
    'settings::change-tab',
    onIpcCategoryChange
  )
})

onUnmounted(() => {
  stopCategoryListener?.()
  stopCategoryListener = null
})
</script>

<style>
.pref-sidebar {
  -webkit-app-region: drag;
  display: flex;
  flex-direction: column;
  flex: none;
  background: var(--editorBgColor);
  width: var(--prefSideBarWidth);
  height: 100vh;
  padding: 22px 14px 24px;
  border-right: 1px solid var(--editorColor10);
  box-sizing: border-box;
  & h3 {
    display: flex;
    min-height: 28px;
    align-items: center;
    gap: 9px;
    margin: 0;
    padding: 0 10px;
    font-size: 17px;
    font-weight: 700;
    text-align: left;
    color: var(--editorColor);
  }
  & h3 .el-icon {
    width: 17px;
    height: 17px;
    font-size: 17px;
  }
}
.category {
  -webkit-app-region: no-drag;
  overflow-y: auto;
  margin-top: 20px;
  & .item {
    width: 100%;
    min-height: 36px;
    margin-bottom: 3px;
    padding: 0 11px;
    color: var(--editorColor60);
    border-radius: 7px;
    font-size: 13px;
    font-weight: 500;
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    position: relative;
    user-select: none;
    & > svg {
      display: none;
    }
    &:hover {
      color: var(--editorColor);
      background: var(--editorColor06);
    }
    &.active {
      color: #fff;
      background: var(--highlightThemeColor);
      font-weight: 650;
    }
    &.active:hover {
      background: color-mix(in srgb, var(--highlightThemeColor) 88%, #000);
    }
  }
}
</style>
