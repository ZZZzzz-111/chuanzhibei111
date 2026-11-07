import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Vitest 独立配置（Vitest 5 不会读取 vite.config 的 test 字段）
export default defineConfig({
  plugins: [react()],
  // 与 vite.config.mjs 保持一致：缓存放系统 Temp，绕开安全软件 EPERM 拦截
  cacheDir: 'C:/Users/31002/AppData/Local/Temp/chuanzhibei-vite-cache',
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
