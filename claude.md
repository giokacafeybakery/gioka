# Gioka — sistema de cafetería

Monorepo npm workspaces: `server/` (Node 24 + Express 5 + Socket.IO + `node:sqlite`) y `client/` (Vite + React 19 + TS + Tailwind v4 + PWA).

## Comandos
- `npm run dev` — server (3001, `--watch`) + client (5173, proxy a /api, /uploads, /socket.io)
- `npm run build` — build del client a `client/dist` (el server lo sirve en producción)
- `npm start` — server en producción en http://localhost:3001
- `python client/scripts/make-icons.py` — regenera íconos PWA (Pillow)

## Estructura
- `server/src/db.js` — esquema SQLite, helpers (`get/all/run`), seed (usuarios, categorías, insumos, productos con recetas), settings por defecto.
- `server/src/routes/*.js` — auth (email + contraseña, token en tabla `sessions`), catalog, orders (crea/paga/estado, descuenta stock por receta, emite socket), inventory, reports, settings, print (ESC/POS TCP 9100), cash (apertura/cierre de caja).
- `server/src/escpos.js` — builder ESC/POS sin dependencias + `receiptBuffer(order, settings, {kitchen})`.
- `client/src/pages/*` — Login, Pos, Pedidos (KDS), Caja, Inventario, Admin, Reportes, Pantalla (público), Seguir (público, `/seguir/:code`).
- `client/src/components/Receipt.tsx` — impresión: modo `browser` (CSS 80mm + window.print) o `network` (POST /api/print/:id).
- `client/src/index.css` — tokens de diseño (`@theme`) y utilidades (`btn-*`, `card`, `input`, `pill`, `chip`).

## Convenciones
- UI en español. Roles: `admin` (edita todo), `cajero` (vende, caja, inventario solo lectura), `cocina` (solo KDS). Login email + contraseña (scrypt). Demo: admin@gioka.com/admin123, cajero@gioka.com/cajero123, cocina@gioka.com/cocina123.
- Vender/cobrar exige caja abierta (`cash_sessions.closed_at IS NULL`); abrir caja requiere monto + email + contraseña del cajero (`POST /api/cash/open`). `client/src/components/OpenCash.tsx` centraliza el estado de caja (`useCashSession`).
- Fechas en DB en ISO UTC; agrupaciones por día usan `date(created_at,'localtime')`.
- Paleta de gráficos validada (dataviz): `#e0702f, #2b7fb8, #b8860b, #7d55d6, #2a8f68` en orden fijo.
- Sin dependencias nativas: no agregar better-sqlite3 ni módulos de impresora USB.
