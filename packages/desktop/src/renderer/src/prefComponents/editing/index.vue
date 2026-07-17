<template>
  <div class="pref-editing">
    <h4>{{ t('preferences.editor.title') }}</h4>
    <editor-settings />
    <markdown-settings />
    <spellchecker-settings />
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EditorSettings from '../editor/index.vue'
import MarkdownSettings from '../markdown/index.vue'
import SpellcheckerSettings from '../spellchecker/index.vue'

const { t } = useI18n()
</script>

<style scoped>
.pref-editing > :deep(.pref-editor > h4),
.pref-editing > :deep(.pref-markdown > h4),
.pref-editing > :deep(.pref-spellchecker > h4) {
  display: none;
}
</style>
