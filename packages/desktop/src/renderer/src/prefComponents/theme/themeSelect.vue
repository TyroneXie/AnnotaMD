<template>
  <section class="pref-select-item has-description">
    <div class="label-column">
      <div class="description">
        <span>{{ description }}:</span>
      </div>
    </div>
    <el-select
      v-model="selectValue"
      :disabled="disable"
      @change="select"
      @visible-change="handleVisibleChange"
    >
      <el-option
        v-for="item in options"
        :key="item.value"
        :label="item.label"
        :value="item.value"
        @mouseenter="showPreview(item.value, $event)"
        @mouseleave="hidePreview"
      />
    </el-select>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import type { PrefSelectOption } from '../common/types'

interface ThemeSelectProps {
  description: string
  value: string
  options: ReadonlyArray<PrefSelectOption<string>>
  disable?: boolean
  onChange: (value: string) => void
}

const props = withDefaults(defineProps<ThemeSelectProps>(), {
  disable: false
})

const emit = defineEmits<{
  preview: [themeName: string, anchor: DOMRect]
  clearPreview: []
}>()

const selectValue = ref(props.value)
let clearPreviewTimer: number | undefined

watch(
  () => props.value,
  (value) => {
    selectValue.value = value
  }
)

const select = (value: string): void => {
  hidePreview()
  props.onChange(value)
}

const showPreview = (themeName: string, event: MouseEvent): void => {
  emit('preview', themeName, (event.currentTarget as HTMLElement).getBoundingClientRect())
}

const hidePreview = (): void => emit('clearPreview')

const handleVisibleChange = (visible: boolean): void => {
  window.clearTimeout(clearPreviewTimer)
  if (!visible) {
    clearPreviewTimer = window.setTimeout(hidePreview)
  }
}

onBeforeUnmount(() => window.clearTimeout(clearPreviewTimer))
</script>
