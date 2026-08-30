<template>
  <div class="pref-sidebar">
    <h3 class="title">
      <el-icon><Setting /></el-icon>
      {{ t('preferences.title') }}
    </h3>
    <section class="search-wrapper">
      <el-autocomplete
        :key="locale"
        v-model="state"
        popper-class="pref-autocomplete"
        :fetch-suggestions="querySearch"
        :placeholder="t('preferences.search.placeholder')"
        :trigger-on-focus="false"
        @select="handleSelect"
      >
        <template #prefix>
          <Search
            width="16"
            height="16"
          />
        </template>
        <template #default="{ item }">
          <div class="name">
            {{ item.category }}
          </div>
          <span class="addr">{{ item.preference }}</span>
        </template>
      </el-autocomplete>
    </section>
    <section class="category">
      <div
        v-for="c of getCategory()"
        :key="c.name"
        class="item"
        :class="{ active: c.label === currentCategory }"
        @click="handleCategoryItemClick(c)"
      >
        <component :is="c.icon" />
        <span>{{ c.name }}</span>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { getCategory, getTranslatedSearchContent } from './config'
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Search, Setting } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

let stopCategoryListener: (() => void) | null = null

interface SearchEntry {
  key: string
  category: string
  categoryEn: string
  preference: string
  preferenceEn: string
  routeCategory: string
  description: string
  enum: unknown[] | undefined
}

interface CategoryItem {
  name: string
  path: string
}

const { t, locale } = useI18n()

const router = useRouter()
const route = useRoute()

const currentCategory = ref<string>('general')
const restaurants = ref<SearchEntry[]>([])
const state = ref<string>('')

watch(
  () => route.name,
  (newRouteName) => {
    if (newRouteName) {
      currentCategory.value = String(newRouteName)
    }
  }
)

const querySearch = (queryString: string, cb: (results: SearchEntry[]) => void): void => {
  const results = queryString
    ? restaurants.value.filter(createFilter(queryString))
    : restaurants.value
  cb(results)
}

const createFilter = (queryString: string): ((restaurant: SearchEntry) => boolean) => {
  const q = queryString.toLowerCase()
  return (restaurant: SearchEntry): boolean => {
    // Support both the current language and English keywords
    const fields = [
      restaurant.preference,
      restaurant.category,
      restaurant.preferenceEn,
      restaurant.categoryEn
    ]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase())
    return fields.some((f) => f.indexOf(q) >= 0)
  }
}

const loadAll = (): SearchEntry[] => getTranslatedSearchContent()

const handleSelect = (item: SearchEntry | null | undefined): void => {
  // Use a safe routeCategory to avoid a blank screen caused by invalid categories
  const target =
    item && item.routeCategory ? item.routeCategory : (item?.category || 'general').toLowerCase()
  router.push({ path: `/preference/${target}` }).catch(() => {})
}

const handleCategoryItemClick = (item: CategoryItem): void => {
  if (item.name.toLowerCase() !== currentCategory.value) {
    router.push({
      path: item.path
    })
  }
}

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
  restaurants.value = loadAll()
  if (route.name) {
    currentCategory.value = String(route.name)
  }
  stopCategoryListener = window.electron.ipcRenderer.on(
    'settings::change-tab',
    onIpcCategoryChange
  )
})

watch(locale, () => {
  restaurants.value = loadAll()
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
.search-wrapper {
  -webkit-app-region: no-drag;
  position: fixed;
  z-index: 5;
  top: 0;
  right: 36px;
  left: calc(var(--prefSideBarWidth) + 36px);
  margin: 0;
  padding: 13px 20px 12px 0;
  background: var(--editorBgColor);
}
.el-autocomplete {
  width: 100%;

  & .el-input__wrapper {
    min-height: 46px;
    padding: 0 16px;
    border: 1px solid color-mix(in srgb, var(--editorColor) 15%, transparent);
    border-radius: 13px;
    background: var(--editorColor02);
    box-shadow: none;
    transition: border-color .15s ease, background-color .15s ease;
  }

  & .el-input__wrapper:hover,
  & .el-input__wrapper.is-focus {
    border-color: var(--editorColor30);
    background: var(--editorBgColor);
    box-shadow: none;
  }

  & .el-input__inner {
    border: none;
    background: transparent;
    height: 44px;
    line-height: 44px;
    font-size: 13px;
  }
}
.pref-autocomplete {
  background: var(--floatBgColor);
  border-color: var(--floatBorderColor);
  & .el-autocomplete-suggestion__wrap li:hover {
    background: var(--floatHoverColor);
  }
  & .popper__arrow {
    display: none;
  }
  & li {
    line-height: normal;
    padding: 7px;
    opacity: 0.8;

    & .name {
      text-overflow: ellipsis;
      overflow: hidden;
      font-weight: 600;
      color: var(--editorColor80);
    }
    & .addr {
      font-size: 12px;
      color: var(--editorColor);
    }

    & .highlighted .addr {
      color: var(--editorColor);
    }
  }
}
.category {
  -webkit-app-region: no-drag;
  overflow-y: auto;
  margin-top: 32px;
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
