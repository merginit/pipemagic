<template>
  <div v-if="unsupported" class="gate">
    <p>{{ unsupported }}</p>
    <a href="https://github.com/mo1app/pipemagic" target="_blank">Read more at github &#8594;</a>
  </div>
  <NuxtPage v-else />
</template>

<script setup lang="ts">
const unsupported = ref<string | null>(null)

onMounted(() => {
  if (window.innerWidth < 900) {
    unsupported.value = 'Only desktop supported for now.'
  } else if (!navigator.gpu) {
    unsupported.value = 'WebGPU is required but not supported by this browser.'
  }
})
</script>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-family: system-ui, sans-serif;
  color: #888;
  padding: 2rem;
  text-align: center;
}
.gate p {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
.gate a {
  font-size: 0.85rem;
  color: #666;
}
</style>
