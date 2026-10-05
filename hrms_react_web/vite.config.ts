import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Backend target is configurable so a stuck port on 8000 never blocks
  // local development: set VITE_PROXY_TARGET (e.g. http://localhost:8001)
  // in .env or the shell, and run the backend with the matching PORT.
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_PROXY_TARGET || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/static': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false, // Disable source maps in production
      minify: 'terser',
      rollupOptions: {
        output: {
          // Split big libraries into separate chunks so each one can be cached
          // independently in the browser. Function form is required by Vite 8's
          // stricter rollup typings (the older object form no longer type-checks).
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.match(/[\\/]react(-dom|-router-dom)?[\\/]/)) return 'vendor';
              if (id.match(/[\\/](chart\.js|react-chartjs-2|recharts)[\\/]/)) return 'charts';
              if (id.match(/[\\/](lucide-react|tailwind-merge|clsx)[\\/]/)) return 'ui';
              if (id.match(/[\\/](date-fns|axios)[\\/]/)) return 'utils';
              if (id.match(/[\\/]@tanstack[\\/]/)) return 'tanstack';
              if (id.match(/[\\/](react-hot-toast)[\\/]/)) return 'notifications';
            }
          },
          // Optimize chunk naming for better caching
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]'
        }
      },
      // Optimize chunk size
      chunkSizeWarningLimit: 1000,
      // Enable CSS code splitting
      cssCodeSplit: true
    },
    // Define environment variables for production
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version || '1.0.0'),
      'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString())
    }
  }
})
