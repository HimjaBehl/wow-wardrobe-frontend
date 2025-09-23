import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
    hmr: {
      port: 5000,
    },
  },
  define: {
    global: 'globalThis',
  },
  build: {
    // Enable source maps for production (smaller files)
    sourcemap: false,
    // Enable minification
    minify: 'terser',
    // Reduce chunk size warning limit
    chunkSizeWarningLimit: 500,
    // Enable tree shaking
    rollupOptions: {
      output: {
        // Enable gzip-friendly chunking
        manualChunks: (id) => {
          // Vendor chunk for react ecosystem
          if (id.includes('react') || id.includes('react-dom')) {
            return 'vendor-react';
          }
          // Fabric.js chunk
          if (id.includes('fabric')) {
            return 'vendor-fabric';
          }
          // Router chunk
          if (id.includes('react-router')) {
            return 'vendor-router';
          }
          // Firebase chunk
          if (id.includes('firebase')) {
            return 'vendor-firebase';
          }
          // Lucide icons chunk
          if (id.includes('lucide-react')) {
            return 'vendor-icons';
          }
          // Other vendor libraries
          if (id.includes('node_modules')) {
            return 'vendor-others';
          }
        },
        // Optimize chunk filenames
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    },
    // Enable CSS code splitting
    cssCodeSplit: true,
    // Asset optimization
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb
    // Enable compression-friendly options
    target: 'esnext',
    // Optimize for modern browsers
    modulePreload: {
      polyfill: false
    }
  }
});
