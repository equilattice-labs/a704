import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
export default defineConfig({
  publicDir: 'public-active',
  resolve: { alias: { buffer: 'buffer/' } },
  plugins: [vue()],
})
