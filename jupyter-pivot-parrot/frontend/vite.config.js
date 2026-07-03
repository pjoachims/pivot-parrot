import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // lib mode keeps process.env.NODE_ENV for downstream bundlers, but anywidget
  // loads this ESM directly in the browser where `process` does not exist
  define: {
    'process.env.NODE_ENV': JSON.stringify('production')
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/widget.jsx'),
      formats: ['es'],
      fileName: () => 'widget.js',
      cssFileName: 'widget'
    },
    outDir: path.resolve(__dirname, '../jupyter_pivot_parrot/static'),
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: 'esbuild',
    rollupOptions: {
      external: ['plotly.js-dist-min'],
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'widget.css';
          }
          return '[name][extname]';
        }
      }
    },
    chunkSizeWarningLimit: 12000
  }
});
