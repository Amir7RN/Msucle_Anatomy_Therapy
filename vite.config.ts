import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_BASE_PATH is set by the GitHub Actions workflow when building for
// GitHub Pages (e.g. '/Msucle_Anatomy_Therapy/').
// During local `npm run dev` this env var is absent, so base defaults to '/'
// and the dev server works normally at localhost:3000.
const base = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
  },
  // Allow importing binary/model assets without transformation
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.bin', '**/*.ktx2'],
  optimizeDeps: {
    // Prevent Vite from pre-bundling Three.js addons that use dynamic imports
    exclude: ['three/examples/jsm/libs/mikktspace'],
  },
})
