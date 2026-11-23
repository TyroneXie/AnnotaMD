<template>
  <button
    type="button"
    class="comment-pane-toggle"
    :class="{ 'is-active': commentPaneActive }"
    :title="t('annotamd.comments.title')"
    :aria-label="t('annotamd.comments.title')"
    :aria-pressed="commentPaneActive"
    @click.stop="toggleCommentPane"
  >
    <el-icon aria-hidden="true">
      <ChatLineRound />
    </el-icon>
    <span
      v-if="selectionCommentCount"
      class="comment-pane-count"
    >
      {{ selectionCommentCount }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { ChatLineRound } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import { useCommentPane } from '@/composables/useCommentPane'

const { t } = useI18n()
const { commentPaneActive, selectionCommentCount, toggleCommentPane } = useCommentPane()
</script>

<style scoped>
.comment-pane-toggle {
  position: relative;
  display: inline-grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  color: var(--ui-muted);
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
  transition: color 120ms ease, background-color 120ms ease;
}

.comment-pane-toggle:hover {
  color: var(--ui-ink);
  background: var(--ui-hover);
}

.comment-pane-toggle.is-active {
  color: var(--annotamd-green, #159f67);
  background: color-mix(in srgb, var(--annotamd-green, #159f67) 12%, var(--ui-paper));
}

.comment-pane-toggle:focus-visible {
  outline: 2px solid var(--annotamd-green, #159f67);
  outline-offset: -2px;
}

.comment-pane-toggle :deep(.el-icon) {
  font-size: 16px;
}

.comment-pane-count {
  position: absolute;
  top: -1px;
  right: -1px;
  box-sizing: border-box;
  min-width: 15px;
  height: 15px;
  padding: 0 4px;
  color: var(--ui-paper);
  border: 2px solid var(--ui-paper);
  border-radius: 999px;
  background: var(--annotamd-blue, #3370ff);
  font-size: 8px;
  font-weight: 600;
  line-height: 11px;
  text-align: center;
}
</style>
