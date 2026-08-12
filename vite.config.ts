import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    // The main-process build emits configuration helpers here for the remote API.
    // Keep them when Vite refreshes renderer assets.
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html'),
        splash: resolve(__dirname, 'src/renderer/splash.html')
      }
    }
  }
});
