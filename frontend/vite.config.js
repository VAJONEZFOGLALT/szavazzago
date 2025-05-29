import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sajatkerdes: resolve(__dirname, 'sajatkerdes.html'),
        toplista: resolve(__dirname, 'toplista.html'),
        gyik: resolve(__dirname, 'gyik.html'),
        admin: resolve(__dirname, 'admin.html'),
      }
    }
  }
}); 