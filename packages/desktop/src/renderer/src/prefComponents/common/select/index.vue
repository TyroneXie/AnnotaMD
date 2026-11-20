<template>
  <section
    class="pref-select-item"
    :class="{ 'ag-underdevelop': disable, 'has-description': description }"
  >
    <div
      v-if="description"
      class="label-column"
    >
      <div class="description">
        <span>{{ description }}:</span>
        <LinkIcon
          v-if="more"
          :size="14"
          class="link-icon"
          @click="handleMoreClick"
        />
      </div>
      <div v-if="notes" class="notes">{{ notes }}</div>
    </div>
    <el-select
      v-model="selectValue"
      :disabled="disable"
      :filterable="filterable"
      :allow-create="allowCreate"
      :default-first-option="allowCreate"
      :placeholder="placeholder"
      @change="select"
    >
      <template v-if="$slots.prefix" #prefix>
        <slot name="prefix" />
      </template>
      <el-option
        v-for="item in options"
        :key="item.value"
        :label="item.label"
        :value="item.value"
      >
        <slot name="option" :item="item">{{ item.label }}</slot>
      </el-option>
    </el-select>
    <div
      v-if="!description && notes"
      class="notes"
    >
      {{ notes }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import LinkIcon from '@/components/icons/LinkIcon.vue'
import type { PrefControlBaseProps, PrefSelectOption } from '../types'

type SelectValue = string | number | boolean

interface SelectProps extends PrefControlBaseProps {
  notes?: string
  /** Lets the user type to narrow the list. */
  filterable?: boolean
  /** Accepts a typed value that is not in `options` (e.g. a custom model id). */
  allowCreate?: boolean
  placeholder?: string
  value: SelectValue
  options: ReadonlyArray<PrefSelectOption<SelectValue>>
  onChange: (value: SelectValue) => void
}

const props = withDefaults(defineProps<SelectProps>(), {
  description: '',
  notes: '',
  more: '',
  disable: false,
  filterable: false,
  allowCreate: false,
  placeholder: 'Select'
})

const selectValue = ref<SelectValue>(props.value)

watch(
  () => props.value,
  (value, oldValue) => {
    if (value !== oldValue) {
      selectValue.value = value
    }
  }
)

const handleMoreClick = () => {
  if (typeof props.more === 'string') {
    window.electron.shell.openExternal(props.more)
  }
}

const select = (value: SelectValue) => {
  props.onChange(value)
}
</script>

<style>
.pref-select-item {
  margin: 4px 0;
  font-size: 14px;
  color: var(--editorColor);
  &.has-description {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--prefControlWidth);
    align-items: center;
    gap: 16px;
  }
  & .el-select {
    width: var(--prefControlWidth);
  }
  & div {
    background: transparent;
    color: var(--editorColor);
    border-color: var(--editorColor10);
  }
  & input.el-input__inner {
    height: 28px;
    background: transparent;
    color: var(--editorColor);
    border-color: var(--editorColor10);
  }
  & .el-input__icon,
  & .el-input__inner {
    line-height: 28px;
  }
}
.pref-select-item .description {
  display: flex;
  align-items: center;
  margin-bottom: 0;
  & svg {
    margin-left: 4px;
    cursor: pointer;
    opacity: 0.7;
    color: var(--iconColor);
  }
  & svg:hover {
    color: var(--themeColor);
  }
}
li.el-select-dropdown__item {
  color: var(--editorColor);
  height: 28px;
}
li.el-select-dropdown__item.hover,
li.el-select-dropdown__item:hover {
  background: var(--floatHoverColor);
}
li.el-select-dropdown__item.selected,
li.el-select-dropdown__item.is-selected {
  color: var(--themeColor);
  background: var(--themeColor10);
}
div.el-select-dropdown {
  background: var(--floatBgColor);
  border-color: var(--floatBorderColor);
  & .popper__arrow {
    display: none;
  }
}
.el-select__wrapper.is-focused {
  box-shadow: 0 0 0 1px var(--themeColor) inset;
}
</style>
