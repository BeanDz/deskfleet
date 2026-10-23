<script setup lang="ts">
import type { Component } from "vue"
import { RouterLink, type RouteLocationRaw } from "vue-router"

defineProps<{
  to: RouteLocationRaw
  icon: Component
  label: string
}>()
</script>

<template>
  <RouterLink
    :to="to"
    class="flex h-8 items-center gap-2.5 rounded-lg px-2.5 hover:bg-ui-hover"
    exact-active-class="bg-ui-active"
  >
    <component :is="icon" :size="16" :stroke-width="1.75" class="shrink-0" aria-hidden="true" />
    <span class="truncate">{{ label }}</span>
  </RouterLink>
</template>
