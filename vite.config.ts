/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5103, strictPort: true },
  preview: { port: 5103, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
})
