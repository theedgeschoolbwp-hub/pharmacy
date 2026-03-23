import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// VitePWA temporarily disabled (workbox deps broken in node_modules — run npm ci to fix)
// import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    // Re-enable once deps are clean:
    // VitePWA({ registerType: 'autoUpdate', ... })
  ],
  build: {
    rollupOptions: {
      output: {
        // Split vendor chunks for better caching
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          dexie: ['dexie'],
        },
      },
    },
  },
})
