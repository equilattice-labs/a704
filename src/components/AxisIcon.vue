<script setup>
defineProps({ name: { type: String, default: 'arrow' } })
const paths = {
  arrow: 'M5 12h14M13 6l6 6-6 6', external: 'M7 17 17 7M7 7h10v10',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  wallet: 'M20 8V5H4a2 2 0 0 0 0 4h17v11H4a2 2 0 0 1-2-2V7m19 6h-5v3h5',
  close: 'm6 6 12 12M6 18 18 6', check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14', chevron: 'm8 5 7 7-7 7',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 7a8 8 0 0 1 13-2l2 3M4 16l2 3a8 8 0 0 0 13-2',
  shield: 'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Zm-4 9 3 3 5-6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
}
</script>
<template><svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.arrow"/></svg></template>
