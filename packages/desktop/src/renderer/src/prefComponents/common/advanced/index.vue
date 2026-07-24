<template>
  <section class="pref-advanced">
    <details>
      <summary>
        <span class="pref-advanced-copy">
          <span>{{ title }}</span>
          <small v-if="description">{{ description }}</small>
        </span>
        <ArrowRight class="pref-advanced-chevron" />
      </summary>
      <div class="pref-advanced-body">
        <slot />
      </div>
    </details>
  </section>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue'

defineProps<{
  title: string
  description?: string
}>()
</script>

<style>
.pref-advanced {
  margin: 14px 0 6px;
  border-top: 1px solid var(--editorColor10);
  border-bottom: 1px solid var(--editorColor10);
}

.pref-advanced summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  color: var(--editorColor);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.pref-advanced summary::-webkit-details-marker {
  display: none;
}

.pref-advanced-copy > span,
.pref-advanced-copy > small {
  display: block;
}

.pref-advanced-copy > small {
  margin-top: 2px;
  color: var(--editorColor60);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.4;
}

.pref-advanced-chevron {
  width: 15px;
  height: 15px;
  color: var(--editorColor70);
  transition: transform 0.16s ease;
}

.pref-advanced details[open] .pref-advanced-chevron {
  transform: rotate(90deg);
}

.pref-advanced-body {
  padding-bottom: 2px;
}

.pref-advanced-body > .pref-compound-item:first-child {
  margin-top: 8px;
}
</style>
