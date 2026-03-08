import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // These modules resolve to native binaries or use Node APIs that
      // must NOT be bundled by Vite — they need to be required at runtime.
      external: [
        'ffmpeg-static',
        'ffprobe-static',
        'electron-store',
      ],
    },
  },
});
