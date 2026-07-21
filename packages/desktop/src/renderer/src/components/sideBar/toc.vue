<template>
  <div
    class="side-bar-toc"
    :class="[
      {
        'side-bar-toc-overflow': !wordWrapInToc,
        'side-bar-toc-wordwrap': wordWrapInToc,
        'annotamd-scrollbar-visible': scrollbarVisible
      },
      'annotamd-auto-hide-scrollbar'
    ]"
    @scroll.passive="revealScrollbar"
    @wheel.passive="revealScrollbar"
    @pointerdown="handleScrollbarPointerDown"
  >
    <div class="title">
      {{ t('sideBar.toc.title') }}
    </div>
    <el-tree
      v-if="keyedToc.length"
      :data="keyedToc"
      node-key="key"
      :default-expanded-keys="expandedKeys"
      :props="defaultProps"
      :expand-on-click-node="false"
      :indent="10"
      :icon="ArrowRight"
      @node-click="handleClick"
      @node-expand="onExpand"
      @node-collapse="onCollapse"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useEditorStore } from '@/store/editor'
import { usePreferencesStore } from '@/store/preferences'
import { deriveKeyedToc, type KeyedTocNode } from '@/util/tocKeys'
import bus from '../../bus'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import { useAutoHideScrollbar } from '@/composables/useAutoHideScrollbar'

const { t } = useI18n()

const editorStore = useEditorStore()
const preferencesStore = usePreferencesStore()

const defaultProps = {
  children: 'children',
  label: 'label'
}

const { toc } = storeToRefs(editorStore)
const { wordWrapInToc } = storeToRefs(preferencesStore)
const {
  scrollbarVisible,
  revealScrollbar,
  handleScrollbarPointerDown
} = useAutoHideScrollbar()

// Stable per-node key so el-tree preserves the user's expand/collapse state
// across content edits (#3028) and tab switches (#3791). See deriveKeyedToc.
const keyedToc = computed<KeyedTocNode[]>(() => deriveKeyedToc(toc.value))

// Track which headings the user collapsed, by stable key (#3028). Headings are
// expanded by default; a collapse is remembered here.
const collapsedKeys = ref<Set<string>>(new Set())

const onCollapse = (data: { key?: string }): void => {
  if (data.key) collapsedKeys.value = new Set(collapsedKeys.value).add(data.key)
}

const onExpand = (data: { key?: string }): void => {
  if (!data.key) return
  const next = new Set(collapsedKeys.value)
  next.delete(data.key)
  collapsedKeys.value = next
}

// The set el-tree should have expanded: every node that is neither collapsed
// nor inside a collapsed ancestor. On each content edit el-tree rebuilds and
// re-applies these keys, so binding the *correct* set makes it paint the right
// state directly — instead of expanding everything and then collapsing, which
// flickered.
const expandedKeys = computed<string[]>(() => {
  const keys: string[] = []
  const walk = (nodes: KeyedTocNode[], hiddenByAncestor: boolean): void => {
    for (const node of nodes) {
      const collapsed = hiddenByAncestor || collapsedKeys.value.has(node.key)
      if (!collapsed) keys.push(node.key)
      walk(node.children, collapsed)
    }
  }
  walk(keyedToc.value, false)
  return keys
})

const handleClick = (data: { slug?: unknown }): void => {
  // editor.vue builds a CSS selector with `#${slug}` — bail out if the
  // node has no slug (e.g. unsluggable headings) to avoid emitting
  // `undefined` / non-string payloads and producing `#undefined` selectors.
  if (typeof data.slug !== 'string' || data.slug.length === 0) return
  bus.emit('scroll-to-header', data.slug)
}
</script>

<style>
.side-bar-toc {
  height: calc(100% - 35px);
  margin: 0;
  padding: 0 10px 12px;
  list-style: none;
  display: flex;
  flex-direction: column;
  color: #646a73;
}

.side-bar-toc .title {
  color: #1f2329;
  font-weight: 700;
  font-size: 14px;
  margin: 34px 0 10px;
  padding: 0 8px;
  line-height: 28px;
}

.side-bar-toc .el-tree-node {
  margin-top: 0;
}

.side-bar-toc .el-tree {
  background: transparent;
  color: #646a73;
  font-size: 12px;
}

.side-bar-toc .el-tree-node:focus > .el-tree-node__content {
  background-color: #eef3ff;
}

.side-bar-toc .el-tree-node__content:hover {
  background: #eef3ff;
  color: #3370ff;
}

.side-bar-toc .el-tree-node__content {
  height: 24px;
  border-radius: 6px;
}

.side-bar-toc .el-tree-node__expand-icon {
  color: #8f959e;
}

.side-bar-toc > li {
  font-size: 14px;
  margin-bottom: 15px;
  cursor: pointer;
}
.side-bar-toc-overflow {
  overflow: auto;
}

.side-bar-toc-overflow .el-tree {
  display: inline-block;
  min-width: 100%;
}

.side-bar-toc-overflow .el-tree-node,
.side-bar-toc-overflow .el-tree-node__content {
  width: max-content;
  min-width: 100%;
}

.side-bar-toc-overflow .el-tree-node__content {
  box-sizing: border-box;
  padding-right: 8px;
}

.side-bar-toc-overflow .el-tree-node__label {
  flex: none;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
}

.side-bar-toc-wordwrap {
  overflow-x: hidden;
  overflow-y: auto;
}

.side-bar-toc-wordwrap .el-tree-node__content {
  white-space: normal;
  height: auto;
  min-height: 24px;
}
</style>
