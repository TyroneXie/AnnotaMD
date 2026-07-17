<template>
  <div class="pref-theme">
    <h4>{{ t('preferences.theme.title') }}</h4>
    <compound>
      <template #head>
        <h6 class="title">
          {{ t('preferences.theme.documentTheme') }}
        </h6>
      </template>
      <template #children>
        <Bool
          :description="t('preferences.theme.followSystemTheme')"
          :bool="followSystemTheme"
          :on-change="(value) => onSelectChange('followSystemTheme', value)"
        />
        <theme-select
          v-if="!followSystemTheme"
          :description="t('preferences.theme.currentTheme')"
          :value="theme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('theme', value)"
          @preview="showThemePreview"
          @clear-preview="clearThemePreview"
        />
        <theme-select
          v-if="followSystemTheme"
          :description="t('preferences.theme.lightModeTheme')"
          :value="lightModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('lightModeTheme', value)"
          @preview="showThemePreview"
          @clear-preview="clearThemePreview"
        />
        <theme-select
          v-if="followSystemTheme"
          :description="t('preferences.theme.darkModeTheme')"
          :value="darkModeTheme"
          :options="themeOptions"
          :on-change="(value) => onSelectChange('darkModeTheme', value)"
          @preview="showThemePreview"
          @clear-preview="clearThemePreview"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.general.misc.language.title') }}</h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.general.misc.language.title')"
          :value="language"
          :options="getLanguageOptions()"
          :on-change="(value) => onSelectChange('language', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.editor.textEditor.title') }}</h6>
      </template>
      <template #children>
        <range
          :description="t('preferences.editor.textEditor.fontSize')"
          :value="fontSize"
          :min="12"
          :max="32"
          :step="1"
          :on-change="(value) => onSelectChange('fontSize', value)"
        />
        <range
          :description="t('preferences.editor.textEditor.lineHeight')"
          :value="lineHeight"
          :min="1.2"
          :max="2.0"
          :step="0.1"
          :on-change="(value) => onSelectChange('lineHeight', value)"
        />
        <font-text-box
          :description="t('preferences.editor.textEditor.fontFamily')"
          :value="editorFontFamily"
          :on-change="(value) => onSelectChange('editorFontFamily', value)"
        />
        <text-box
          :description="t('preferences.editor.textEditor.maxWidth')"
          :notes="t('preferences.editor.textEditor.maxWidthNotes')"
          :input="editorLineWidth"
          :regex-validator="/^(?:$|[0-9]+(?:ch|px|%)$)/"
          :on-change="(value) => onSelectChange('editorLineWidth', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.editor.textEditor.iconTheme') }}</h6>
      </template>
      <template #children>
        <cur-select
          :description="t('preferences.editor.textEditor.iconTheme')"
          :value="iconTheme"
          :options="iconThemeOptions"
          :on-change="(value) => onSelectChange('iconTheme', value)"
        />
      </template>
    </compound>

    <compound>
      <template #head>
        <h6 class="title">{{ t('preferences.markdown.codeBlock.title') }}</h6>
      </template>
      <template #children>
        <font-text-box
          :description="t('preferences.editor.codeBlock.fontFamily')"
          :only-monospace="true"
          :value="codeFontFamily"
          :on-change="(value) => onSelectChange('codeFontFamily', value)"
        />
        <Bool
          :description="t('preferences.markdown.codeBlock.showLineNumbers')"
          :bool="codeBlockLineNumbers"
          :on-change="(value) => onSelectChange('codeBlockLineNumbers', value)"
        />
        <Bool
          :description="t('preferences.markdown.codeBlock.wrap')"
          :bool="wrapCodeBlocks"
          :on-change="(value) => onSelectChange('wrapCodeBlocks', value)"
        />
        <Bool
          :description="t('preferences.editor.codeBlock.removeEmptyLines')"
          :bool="trimUnnecessaryCodeBlockEmptyLines"
          :on-change="(value) => onSelectChange('trimUnnecessaryCodeBlockEmptyLines', value)"
        />
      </template>
    </compound>

    <advanced :title="t('preferences.advancedSettings')">
      <div class="custom-css">
        <div class="description">
          {{ t('preferences.theme.customCss') }}
        </div>
        <textarea
          class="custom-css-input"
          rows="10"
          :value="customCss"
          @change="
            (event: Event) =>
              onSelectChange('customCss', (event.target as HTMLTextAreaElement).value)
          "
        />
      </div>
    </advanced>
    <separator v-show="false" />
    <section v-show="false" class="import-themes ag-underdevelop">
      <div>
        <span>{{ t('preferences.theme.openThemesFolder') }}</span>
        <el-button size="small">
          {{ t('preferences.theme.openFolder') }}
        </el-button>
      </div>

      <div>
        <span>{{ t('preferences.theme.importCustomThemes') }}</span>
        <el-button size="small">
          {{ t('preferences.theme.importTheme') }}
        </el-button>
      </div>
    </section>
    <Teleport to="body">
      <section
        v-if="hoveredTheme"
        class="offcial-themes theme-hover-preview"
        :style="previewPosition"
      >
        <div class="theme" :class="hoveredTheme.name">
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div v-html="hoveredTheme.html" />
        </div>
      </section>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import themeMd from './theme.md?raw'
import { themes as configThemes } from './config'
import markdownToHtml from '@/util/markdownToHtml'
import Bool from '../common/bool/index.vue'
import CurSelect from '../common/select/index.vue'
import Separator from '../common/separator/index.vue'
import Compound from '../common/compound/index.vue'
import Advanced from '../common/advanced/index.vue'
import Range from '../common/range/index.vue'
import FontTextBox from '../common/fontTextBox/index.vue'
import TextBox from '../common/textBox/index.vue'
import ThemeSelect from './themeSelect.vue'
import type { PrefSelectOption } from '../common/types'
import { getLanguageOptions } from '../general/config'
import { iconThemeOptions } from '../editor/config'

interface ThemePreview {
  name: string
  html: string
}

const themes = ref<ThemePreview[]>([])
const hoveredThemeName = ref('')
const previewPosition = ref({ left: '0px', top: '0px' })

const { t } = useI18n()
const preferenceStore = usePreferencesStore()

const {
  followSystemTheme,
  lightModeTheme,
  darkModeTheme,
  theme,
  customCss,
  language,
  fontSize,
  editorFontFamily,
  lineHeight,
  editorLineWidth,
  iconTheme,
  codeFontFamily,
  codeBlockLineNumbers,
  wrapCodeBlocks,
  trimUnnecessaryCodeBlockEmptyLines
} = storeToRefs(preferenceStore)

const hoveredTheme = computed(() =>
  themes.value.find((themeItem) => themeItem.name === hoveredThemeName.value)
)

// Generate dropdown options from configThemes
const themeOptions: PrefSelectOption<string>[] = configThemes.map((theme) => ({
  label: theme.name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' '),
  value: theme.name
}))

onMounted(async () => {
  const newThemes: ThemePreview[] = []
  for (const theme of configThemes) {
    const html = await markdownToHtml(themeMd.replace(/{theme}/, theme.name))
    newThemes.push({
      name: theme.name,
      html
    })
  }
  themes.value = newThemes
})

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

const showThemePreview = (themeName: string, anchor: DOMRect): void => {
  const previewWidth = 280
  const previewHeight = 110
  const gap = 12
  const left =
    anchor.right + gap + previewWidth <= window.innerWidth
      ? anchor.right + gap
      : Math.max(gap, anchor.left - previewWidth - gap)
  const top = Math.min(
    Math.max(gap, anchor.top - (previewHeight - anchor.height) / 2),
    window.innerHeight - previewHeight - gap
  )
  previewPosition.value = { left: `${left}px`, top: `${top}px` }
  hoveredThemeName.value = themeName
}

const clearThemePreview = (): void => {
  hoveredThemeName.value = ''
}
</script>

<style>
.offcial-themes {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  & .theme {
    cursor: pointer;
    width: 100%;
    height: 110px;
    margin: 0;
    padding: 16px 18px 16px 32px;
    overflow: hidden;
    background: var(--editorBgColor);
    color: var(--editorColor);
    box-sizing: border-box;
    box-shadow: 0 9px 28px -9px rgba(0, 0, 0, 0.4);
    border-radius: 5px;
    transition: opacity 0.2s ease;

    &.dark {
      color: rgba(255, 255, 255, 0.7);
      background: #282828;
      & a {
        color: #409eff;
      }
    }
    &.light {
      color: rgba(0, 0, 0, 0.7);
      background: rgba(255, 255, 255, 1);
      & a {
        color: rgba(33, 181, 111, 1);
      }
    }
    &.graphite {
      color: rgba(43, 48, 50, 0.7);
      background: #f7f7f7;
      & a {
        color: rgb(104, 134, 170);
      }
    }
    &.material-dark {
      color: rgba(171, 178, 191, 0.8);
      background: #34393f;
      & a {
        color: #f48237;
      }
    }
    &.one-dark {
      color: #9da5b4;
      background: #282c34;
      & a {
        color: rgba(226, 192, 141, 1);
      }
    }
    &.ulysses {
      color: rgba(101, 101, 101, 0.7);
      background: #f3f3f3;
      & a {
        color: rgb(12, 139, 186);
      }
    }

    /* New gogh themes - Dark */
    &.dracula {
      color: #f8f8f2;
      background: #282a36;
      & a {
        color: #bd93f9;
      }
    }
    &.nord {
      color: #d8dee9;
      background: #2e3440;
      & a {
        color: #81a1c1;
      }
    }
    &.catppuccin-mocha {
      color: #cdd6f4;
      background: #1e1e2e;
      & a {
        color: #89b4fa;
      }
    }
    &.gruvbox-dark {
      color: #ebdbb2;
      background: #282828;
      & a {
        color: #83a598;
      }
    }
    &.tokyo-night {
      color: #c0caf5;
      background: #1a1b26;
      & a {
        color: #7aa2f7;
      }
    }
    &.tokyo-night-storm {
      color: #c0caf5;
      background: #24283b;
      & a {
        color: #7aa2f7;
      }
    }
    &.solarized-dark {
      color: #839496;
      background: #002b36;
      & a {
        color: #268bd2;
      }
    }
    &.ayu-dark {
      color: #b3b1ad;
      background: #0a0e14;
      & a {
        color: #39bae6;
      }
    }
    &.ayu-mirage {
      color: #cbccc6;
      background: #1f2430;
      & a {
        color: #ffcc66;
      }
    }
    &.everforest-dark {
      color: #d3c6aa;
      background: #2d353b;
      & a {
        color: #a7c080;
      }
    }
    &.rose-pine {
      color: #e0def4;
      background: #191724;
      & a {
        color: #c4a7e7;
      }
    }
    &.rose-pine-moon {
      color: #e0def4;
      background: #232136;
      & a {
        color: #c4a7e7;
      }
    }
    &.monokai-pro {
      color: #fcfcfa;
      background: #2d2a2e;
      & a {
        color: #ffd866;
      }
    }
    &.synthwave-84 {
      color: #ffffff;
      background: #262335;
      & a {
        color: #ff7edb;
      }
    }
    &.horizon-dark {
      color: #d5d8da;
      background: #1c1e26;
      & a {
        color: #e95678;
      }
    }
    &.palenight {
      color: #a6accd;
      background: #292d3e;
      & a {
        color: #82aaff;
      }
    }
    &.oxocarbon-dark {
      color: #f2f4f8;
      background: #161616;
      & a {
        color: #78a9ff;
      }
    }
    &.kanagawa {
      color: #dcd7ba;
      background: #1f1f28;
      & a {
        color: #7e9cd8;
      }
    }
    &.nightfox {
      color: #cdcecf;
      background: #192330;
      & a {
        color: #719cd6;
      }
    }
    &.cyberdream {
      color: #ffffff;
      background: #16181a;
      & a {
        color: #5ea1ff;
      }
    }

    /* New gogh themes - Light */
    &.catppuccin-latte {
      color: #4c4f69;
      background: #eff1f5;
      & a {
        color: #1e66f5;
      }
    }
    &.gruvbox-light {
      color: #3c3836;
      background: #fbf1c7;
      & a {
        color: #458588;
      }
    }
    &.tokyo-night-light {
      color: #343b58;
      background: #d5d6db;
      & a {
        color: #34548a;
      }
    }
    &.solarized-light {
      color: #657b83;
      background: #fdf6e3;
      & a {
        color: #268bd2;
      }
    }
    &.ayu-light {
      color: #575f66;
      background: #fafafa;
      & a {
        color: #399ee6;
      }
    }
    &.everforest-light {
      color: #5c6a72;
      background: #fdf6e3;
      & a {
        color: #8da101;
      }
    }
    &.rose-pine-dawn {
      color: #575279;
      background: #faf4ed;
      & a {
        color: #907aa9;
      }
    }

    /* Disabled state when followSystemTheme is on */
    &.disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    /* Active theme - use outline instead of border to avoid layout shift? */
    &.active {
      box-shadow: var(--floatShadow);
      outline: 2px solid var(--themeColor);
      outline-offset: -2px;
    }

    /* Active + disabled: slightly more visible */
    &.disabled.active {
      opacity: 0.7;
    }
  }
  & h3 {
    position: relative;
    margin: 0;
    font-size: 16px;
    color: currentColor;
    cursor: pointer;
    &::before {
      content: 'h3';
      position: absolute;
      top: 4px;
      left: -20px;
      display: block;
      width: 10px;
      height: 10px;
      font-size: 12px;
      opacity: 0.5;
    }
  }
  & p {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.offcial-themes.theme-hover-preview {
  position: fixed;
  z-index: 4000;
  display: block;
  width: 280px;
  margin: 0;
  pointer-events: none;

  & .theme {
    width: 280px;
    height: 110px;
    box-shadow: var(--floatShadow);
    outline: 1px solid var(--floatBorderColor);
  }
}

.custom-css {
  margin: 20px 0;
  font-size: 14px;
  color: var(--editorColor);
  & .description {
    margin-bottom: 10px;
  }
  & .custom-css-input {
    width: 100%;
    background: transparent;
    color: var(--editorColor);
    border: 1px solid var(--editorColor10);
    border-radius: 4px;
    padding: 8px 10px;
    font-family: 'DejaVu Sans Mono', 'Source Code Pro', 'Droid Sans Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 1.5;
    box-sizing: border-box;
    resize: vertical;
  }
  & .custom-css-input:focus {
    outline: none;
    border-color: var(--themeColor);
  }
}

.import-themes {
  padding: 10px 0;
  display: flex;
  justify-content: space-around;
  color: var(--editorColor);
  & > div {
    display: flex;
    flex-direction: column;
    & > span {
      display: inline-block;
      margin-bottom: 20px;
    }
  }
}
</style>
