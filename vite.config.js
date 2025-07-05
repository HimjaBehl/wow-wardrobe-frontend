import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [".replit.dev"], // ✅ This is the fix
  },
  define: {
    global: 'globalThis',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          fabric: ['fabric'],
          router: ['react-router-dom']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});
