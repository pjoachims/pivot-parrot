import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default [
  {
    input: 'src/index.ts',
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      entryFileNames: 'index.js',
      chunkFileNames: '[name].js'
    },
    external: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'ag-grid-community',
      'ag-grid-react',
      'plotly.js-dist-min',
      'jszip',
      '@tanstack/react-virtual',
      'jspreadsheet-ce'
    ],
    plugins: [
      postcss({
        extract: false,
        inject: true,
        minimize: true
      }),
      resolve({
        extensions: ['.ts', '.tsx', '.js', '.jsx']
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationDir: './dist',
        exclude: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx']
      }),
      terser()
    ]
  }
];
