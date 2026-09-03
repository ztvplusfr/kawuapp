import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    hmr: {
      host: 'localhost',
      protocol: 'ws',
      port: 5173,
    }
  }
})
