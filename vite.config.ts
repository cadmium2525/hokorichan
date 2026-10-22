import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// base: './' で GitHub Pages など無料の静的ホスティングのサブパスでも動く
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800,
    // 開発用ページ（dev.html）と BGM の試聴ページ（bgm.html）も一緒に出力する
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), dev: resolve(__dirname, 'dev.html'), bgm: resolve(__dirname, 'bgm.html') } },
  },
});
