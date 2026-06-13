import { defineConfig } from 'vite';

export default defineConfig({
  // Change this to '/your-repo-name/' when deploying to GitHub Pages
  // e.g. base: '/gecko-home/'
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
