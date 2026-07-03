import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Remove alias - use package.json exports instead for proper module resolution
    preserveSymlinks: false
  },
  server: {
    fs: {
      // Allow serving files from one level up from the project root
      allow: ['..']
    }
  },
  optimizeDeps: {
    exclude: ['@duckdb/duckdb-wasm']
  },
  build: {
    rollupOptions: {
      output: {
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
  }
});
