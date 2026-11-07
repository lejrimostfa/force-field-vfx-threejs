import { defineConfig } from 'vite';

// top-level await is needed by WebGPURenderer.init(). es2022 keeps it.
// base is relative so the build works from a GitHub Pages project path.
export default defineConfig({
  base: './',
  build: { target: 'es2022' },
});
