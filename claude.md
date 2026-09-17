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

## Regla de trabajo: publicar cada cambio
Después de CADA alteración al proyecto (código, docs, config), hacer commit y `git push origin main` sin que el usuario lo pida.
Remote: `https://github.com/giokacafeybakery/gioka.git` (rama `main`, repo privado). Cuenta con acceso: `stivencortez2026-afk` — si `gh auth status` muestra otra activa, ejecutar `gh auth switch --user stivencortez2026-afk` antes del push. Si el push falla, avisar al usuario en una línea y continuar.
Nunca commitear `.env`, `server/data/*.db`, `server/uploads/*` ni tokens/credenciales (ya están en `.gitignore`).

## Resumen del proyecto y de lo acordado (historial)
- 2026-09-17 — Se creó Gioka desde cero: sistema para el cafetín "Gioka — Café · Heladería · Bakery" (logo panda). Referencia de diseño: dashboard POS con sidebar oscura, tarjetas de producto y panel de pedido a la derecha. Requisito explícito: diseño cuidado, nada de íconos ni pantallas amateur.
- Módulos: PDV con impresión térmica (navegador 80 mm o ESC/POS por red), pedidos/cocina (KDS) en tiempo real, caja (apertura/cierre), inventario con insumos + recetas + alertas, administración (productos, categorías, equipo, ajustes), reportes PWA (ventas, ganancias, productos en falta), pantalla pública para clientes (`/pantalla`) y seguimiento por QR (`/seguir/:code`).
- Decisiones: UI en español (el usuario escribe en portugués/español; responderle en su idioma). Sin dependencias nativas (SQLite de Node 24). Íconos PWA generados con Pillow (`client/scripts/make-icons.py`). Paleta de gráficos validada con el validador de dataviz.
- Permisos (pedido del usuario): **cajero** ve stock pero no edita nada; todo lo de edición (productos, insumos, stock, categorías, usuarios, ajustes) y los reportes son solo del **admin**. **cocina** solo ve pedidos.
- Acceso: login por **correo + contraseña** (reemplazó al PIN). Los perfiles se crean solo desde Administración → Equipo. Demo: admin@gioka.com/admin123, cajero@gioka.com/cajero123, cocina@gioka.com/cocina123.
- Caja: para vender hay que **abrir la caja** registrando monto inicial + correo + contraseña del cajero (el turno queda a su nombre). Con caja cerrada el PDV bloquea vender/cobrar (cliente y servidor). Solo quien abrió la caja o un admin puede cerrarla.
- Supabase: el usuario pegó un token personal (`sbp_…`) en el chat; NO se guardó en ningún archivo. Se le recomendó revocarlo. Pendiente definir qué quiere (migrar a Postgres, desplegar, auth o backup).
- GitHub: repo privado `giokacafeybakery/gioka`, publicado el 2026-09-17 con la cuenta `stivencortez2026-afk` (tiene push). Cada cambio se sube a `main`.
