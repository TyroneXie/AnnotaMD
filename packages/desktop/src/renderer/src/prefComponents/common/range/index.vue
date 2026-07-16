<template>
  <section
    class="pref-range-item"
    :class="{ 'ag-underdevelop': disable }"
  >
    <div
      class="description"
    >
      <span>{{ description }}:</span>
      <div class="number-control">
        <div class="number-stepper">
          <button
            type="button"
            class="stepper-button"
            :aria-label="`${description} -`"
            :disabled="!canDecrease || disable"
            @click="stepBy(-step)"
          >
            <Minus />
          </button>
          <input
            class="stepper-input"
            type="number"
            :value="selectValue"
            :aria-label="description"
            :min="min"
            :max="max"
            :step="step"
            :disabled="disable"
            @change="handleInput"
          >
          <button
            type="button"
            class="stepper-button"
            :aria-label="`${description} +`"
            :disabled="!canIncrease || disable"
            @click="stepBy(step)"
          >
            <Plus />
          </button>
        </div>
        <span v-if="unit" class="unit">{{ unit }}</span>
        <LinkIcon
          v-if="more"
          :size="14"
          class="link-icon"
          @click="handleMoreClick"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Minus, Plus } from '@element-plus/icons-vue'
import LinkIcon from '@/components/icons/LinkIcon.vue'
import type { PrefControlBaseProps } from '../types'

interface RangeProps extends PrefControlBaseProps {
  value: number
  min?: number
  max?: number
  onChange: (value: number) => void
  unit?: string
  step?: number
}

const props = withDefaults(defineProps<RangeProps>(), {
  description: '',
  more: '',
  unit: '',
  disable: false,
  step: 1
})

const selectValue = ref(props.value)
const precision = computed(() => {
  const decimal = String(props.step ?? 1).split('.')[1]
  return decimal?.length ?? 0
})
const canDecrease = computed(() => props.min === undefined || selectValue.value > props.min)
const canIncrease = computed(() => props.max === undefined || selectValue.value < props.max)

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

const clamp = (value: number) => {
  const minimum = props.min ?? Number.NEGATIVE_INFINITY
  const maximum = props.max ?? Number.POSITIVE_INFINITY
  return Math.min(maximum, Math.max(minimum, value))
}

const updateValue = (value: number) => {
  const nextValue = Number(clamp(value).toFixed(precision.value))
  selectValue.value = nextValue
  props.onChange(nextValue)
}

const stepBy = (amount: number) => updateValue(selectValue.value + amount)

const handleInput = (event: Event) => {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (Number.isFinite(value)) {
    updateValue(value)
  } else {
    input.value = String(selectValue.value)
  }
}
</script>

<style>
.pref-range-item {
  margin: 4px 0;
  font-size: 14px;
  color: var(--editorColor);
  width: 100%;
  & .description,
  & .number-control {
    display: flex;
    align-items: center;
  }
  & .description {
    justify-content: space-between;
  }
  & .number-control {
    gap: 6px;
  }
  & .number-stepper {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  & .stepper-button,
  & .stepper-input {
    height: 30px;
    border: 1px solid var(--el-border-color);
    border-radius: 6px;
    background: var(--editorBgColor);
    color: var(--editorColor);
  }
  & .stepper-button {
    display: grid;
    width: 30px;
    padding: 7px;
    place-items: center;
    cursor: pointer;
  }
  & .stepper-button:hover:not(:disabled),
  & .stepper-input:focus {
    border-color: var(--themeColor);
  }
  & .stepper-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
  & .stepper-input {
    width: 56px;
    padding: 0 6px;
    text-align: center;
    outline: none;
    appearance: textfield;
  }
  & .stepper-input::-webkit-inner-spin-button,
  & .stepper-input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
  & .unit {
    color: var(--editorColor80);
  }
  & .link-icon {
    margin-left: 4px;
  }
}
.pref-select-item .description {
  margin-bottom: 10px;

  & .value {
    color: var(--editorColor80);
  }
  & svg {
    cursor: pointer;
    opacity: 0.7;
    color: var(--iconColor);
  }
  & svg:hover {
    color: var(--themeColor);
  }
}
</style>
