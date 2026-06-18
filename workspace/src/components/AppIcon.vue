<template>
  <img
    :src="logoSrc"
    :width="size"
    :height="size"
    class="app-icon-img"
    alt="Logo"
  />
</template>

<script setup lang="ts">
import logoSrc from '/logo.png';
withDefaults(defineProps<{ size?: number }>(), { size: 64 });
</script>

<style scoped>
.app-icon-img { display: block; border-radius: 14px; object-fit: contain; }
</style>
