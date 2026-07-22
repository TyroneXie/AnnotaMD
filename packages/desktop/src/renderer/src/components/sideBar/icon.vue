<script setup lang="ts">
import { Document } from '@element-plus/icons-vue'

defineProps<{
  name: string
}>()
</script>

<template>
  <Document
    class="file-icon"
  />
</template>

<style scoped>
.file-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  margin-right: 5px;
}
</style>
