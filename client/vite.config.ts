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
      registerType: "autoUpdate",
      includeAssets: ["icons/panda.svg"],
      manifest: {
        name: "Gioka — Café · Heladería · Bakery",
        short_name: "Gioka",
        description: "Punto de venta, pedidos, inventario y reportes de Gioka.",
        theme_color: "#232323",
        background_color: "#F4EFE8",
        display: "standalone",
        start_url: "/",
        lang: "es",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        shortcuts: [
          { name: "Reportes", url: "/reportes", description: "Ventas y ganancias" },
          { name: "Punto de venta", url: "/pos" },
          { name: "Pedidos", url: "/pedidos" },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/, /^\/uploads/],
        runtimeCaching: [
          { urlPattern: /^\/api\/(reports|inventory|products|categories|settings)/, handler: "NetworkFirst", options: { cacheName: "gioka-api", expiration: { maxEntries: 50, maxAgeSeconds: 86400 } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "CacheFirst", options: { cacheName: "gioka-fonts", expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } } },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      "/uploads": { target: "http://localhost:3001", changeOrigin: true },
      "/socket.io": { target: "http://localhost:3001", ws: true },
    },
  },
});
