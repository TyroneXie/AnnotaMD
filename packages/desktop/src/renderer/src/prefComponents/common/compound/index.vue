<template>
  <section class="pref-compound-item">
    <div class="pref-compound-head">
      <slot name="head" />
    </div>
    <div class="pref-compound-body">
      <slot name="children" />
    </div>
    <div
      v-if="notes"
      class="notes"
    >
      {{ notes }}
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  notes?: string
}>()
</script>

<style>
.pref-compound-item {
  font-size: 14px;
  user-select: none;
  margin: 14px 0;
  color: var(--editorColor);

  & .pref-compound-head h6.title {
    margin: 0 0 4px;
    padding: 0;
    color: var(--ui-ink);
    font-size: 14px;
    font-weight: 650;
  }

  & .pref-compound-body {
    padding-left: 0;
    margin-top: 0;
  }

  & .pref-compound-body > * {
    padding: 6px 0;
  }

  & .pref-compound-body > * + * {
    border-top: 1px solid var(--ui-divider);
  }

  & .pref-compound-body > h6 {
    margin: 0 0 6px;
  }

  & .description {
    margin-bottom: 6px;
    & i {
      cursor: pointer;
      opacity: 0.7;
      color: var(--iconColor);
    }
    & i:hover {
      color: var(--themeColor);
    }
  }
}
</style>
