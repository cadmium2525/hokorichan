import { defineConfig } from 'vite';

// base: './' で GitHub Pages など無料の静的ホスティングのサブパスでも動く
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 800 },
});
