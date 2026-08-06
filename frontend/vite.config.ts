import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from "vite-plugin-singlefile"
import { readFileSync } from 'fs'

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isGasMode = env.VITE_API_MODE !== 'rest'

  return {
    plugins: [
      react(),
      // Chỉ dùng singlefile khi build cho GAS (mode mặc định)
      ...(isGasMode ? [viteSingleFile()] : []),
    ],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      target: 'es2020',
      cssTarget: 'chrome61',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    },
    server: {
      // Proxy cho REST API khi dev với backend mới
      ...(isGasMode ? {} : {
        proxy: {
          '/api': {
            target: env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:3001',
            changeOrigin: true,
          }
        }
      })
    },
    define: {
      'process.env': {},
      // Nguồn chuẩn DUY NHẤT của số version hiển thị: frontend/package.json.
      // Ra bản mới chỉ sửa trường `version` ở đó (và ở server/package.json).
      __APP_VERSION__: JSON.stringify(packageJson.version),
      // Thời điểm build, KHÔNG phải giờ máy người xem — dùng để biết bản
      // frontend đang chạy được build lúc nào.
      __BUILD_TIME__: JSON.stringify(new Date().toISOString())
    }
  }
})
