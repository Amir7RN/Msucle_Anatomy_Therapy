import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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
