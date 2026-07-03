import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',  // Use relative paths for Streamlit
  build: {
    outDir: 'build',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          // Group large vendor libraries into separate chunks
          if (id.includes('node_modules')) {
            if (id.includes('plotly.js-dist-min')) {
              return 'plotly';
            }
            if (id.includes('ag-grid')) {
              return 'ag-grid';
            }
            if (id.includes('@duckdb/duckdb-wasm')) {
              return 'duckdb';
            }
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
          }
        }
      }
    },
    // Increase chunk size warning limit since we're using code splitting
    chunkSizeWarningLimit: 1000,
    // Use esbuild for minification (default, faster than terser)
    minify: 'esbuild'
  },
  server: {
    port: 5173
  }
})
