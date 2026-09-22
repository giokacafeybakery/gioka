import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Keep the current version running until the operator explicitly accepts
      // the update. This avoids an unexpected reload in the middle of a sale.
      registerType: "prompt",
      includeAssets: ["icons/favicon.png", "icons/apple-touch-icon.png", "brand/*.png", "sounds/*.mp3", "anim/**/*.{webp,json}"],
      manifest: {
        name: "Gioka — Café · Heladería · Bakery",
        short_name: "Gioka",
        description: "Punto de venta, pedidos, inventario y reportes de Gioka.",
        theme_color: "#232323",
        background_color: "#F4EFE8",
        display: "standalone",
        start_url: "/app",
        scope: "/",
        lang: "es",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Ajustar stock", url: "/app/ajustar", description: "Registrar entrada o salida" },
          { name: "Alertas de stock", url: "/app/alertas" },
          { name: "Historial", url: "/app/historial" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // API data is NOT cached here: src/lib/offline (IndexedDB cache + operation queue) owns offline reads/writes,
          // and a service-worker copy would hide real network errors from that layer.
          // Photos (Supabase Storage / local uploads) and brand images: cache first, they never change under the same name.
          { urlPattern: ({ url }) => /\/storage\/v1\/object\/public\//.test(url.pathname) || url.pathname.startsWith("/uploads/"), handler: "CacheFirst", options: { cacheName: "gioka-images", cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 300, maxAgeSeconds: 2592000, purgeOnQuotaError: true } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "CacheFirst", options: { cacheName: "gioka-fonts", cacheableResponse: { statuses: [0, 200] }, expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } } },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  esbuild: { drop: ["debugger"] },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Stable vendor chunks: React/router/zustand/motion change rarely, so returning users hit the cache.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (/[\/]node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|zustand)[\/]/.test(id)) return "vendor";
          if (/[\/]node_modules[\/]motion/.test(id) || /[\/]node_modules[\/]framer-motion/.test(id)) return "motion";
          if (/[\/]node_modules[\/](recharts|d3-|victory|internmap|delaunator|robust-predicates)/.test(id)) return "charts";
          if (/[\/]node_modules[\/]@supabase[\/]/.test(id)) return "realtime";
          if (/[\/]node_modules[\/]lottie-web/.test(id)) return "lottie";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/uploads": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
