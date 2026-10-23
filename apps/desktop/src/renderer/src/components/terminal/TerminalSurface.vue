<script setup lang="ts">
import { FitAddon } from "@xterm/addon-fit"
import { Terminal, type ITheme } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"
import { useResizeObserver } from "@vueuse/core"
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue"

const props = defineProps<{
  /** Written once when the terminal opens; `\n` becomes a new line. */
  banner?: string
}>()

// Terminals stay dark in both themes; the background matches --ui-color-terminal.
const theme: ITheme = {
  background: "#17171a",
  foreground: "#e4e4e7",
  cursor: "#e4e4e7",
  selectionBackground: "#3f3f46",
}

const container = useTemplateRef<HTMLDivElement>("container")
const fit = new FitAddon()
// Input stays disabled until a session transport exists to receive it.
const terminal = new Terminal({
  cursorBlink: false,
  disableStdin: true,
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  fontSize: 13,
  scrollback: 5_000,
  theme,
})
terminal.loadAddon(fit)

onMounted(() => {
  terminal.open(container.value!)
  fit.fit()
  // Hide the cursor (DECTCEM) while the terminal cannot take input.
  terminal.write("\x1b[?25l")
  if (props.banner) terminal.write(props.banner.replaceAll("\n", "\r\n"))
})
useResizeObserver(container, () => fit.fit())
onBeforeUnmount(() => terminal.dispose())

defineExpose({ terminal })
</script>

<template>
  <div ref="container" class="h-full min-h-0 w-full" />
</template>
