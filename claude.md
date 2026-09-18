# Gioka — sistema de cafetería

Monorepo npm workspaces: `server/` (Node 24 + Express 5 + Socket.IO + Postgres en Supabase vía `pg`) y `client/` (Vite + React 19 + TS + Tailwind v4 + PWA).

## Comandos
- `npm run dev` — server (3001, `--watch`) + client (5173, proxy a /api, /uploads, /socket.io)
- `npm run build` — build del client a `client/dist` (el server lo sirve en producción)
- `npm start` — server en producción en http://localhost:3001
- `python client/scripts/make-icons.py` — regenera íconos PWA (Pillow)

## Estructura
- `server/src/db.js` — pool `pg` (`DATABASE_URL` en `server/.env`), esquema Postgres (`initDb()` idempotente al arrancar), helpers async `get/all/run` (placeholders `?` → `$n`; `run` devuelve `lastInsertRowid` vía `RETURNING id`), `transaction(fn)` con AsyncLocalStorage (todo lo que se llama dentro usa la misma conexión), `localDay()/localHour()` para agrupar por día local, seed demo.
- `server/src/storage.js` — `saveImage(dataUrl, name)`: sube a Supabase Storage (bucket público `gioka`, `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`) o, sin esas variables, guarda en `server/uploads/`.
- `server/scripts/supabase-admin.mjs` — Management API (`SUPABASE_ACCESS_TOKEN`): `projects`, `keys <ref>`, `sql <ref> <query>`, `pooler <ref>`.
- `server/src/routes/*.js` — auth (email + contraseña, token en tabla `sessions`), catalog, orders (crea/paga/estado, descuenta stock por receta, emite socket), inventory, reports, settings, print (ESC/POS TCP 9100), cash (apertura/cierre de caja).
- `server/src/escpos.js` — builder ESC/POS sin dependencias + `receiptBuffer(order, settings, {kitchen})`.
- `client/src/app/*` — PWA móvil de inventario (estilo iOS, `motion` para transiciones): `MobileShell` (tabs + AnimatePresence push/pop), `store.ts` (ítems unificados + borrador del ajuste `useFlow`), `ui.tsx` (Screen, Card, Thumb, BigButton…), pages Home/ItemDetail/Adjust/Confirm/Done/History/Alerts/Profile. Solo roles admin e inventario; `homeFor()` en `lib/nav.ts` decide el destino tras login (inventario → /app; admin en móvil/standalone → /app).
- `client/src/pages/*` — Login, Pos, Pedidos (KDS), Caja, Inventario, Admin, Reportes, Pantalla (público), Seguir (público, `/seguir/:code`).
- `client/src/components/Receipt.tsx` — impresión: modo `browser` (CSS 80mm + window.print) o `network` (POST /api/print/:id).
- `client/src/index.css` — tokens de diseño (`@theme`) y utilidades (`btn-*`, `card`, `input`, `pill`, `chip`).

## Convenciones
- UI en español. Roles: `admin` (edita todo), `cajero` (vende, caja, inventario solo lectura), `cocina` (solo KDS), `inventario` (mueve stock y gestiona insumos; foto de comprobante obligatoria; sin acceso a pedidos/menú/reportes). Login email + contraseña (scrypt). Demo: admin@gioka.com/admin123, cajero@gioka.com/cajero123, cocina@gioka.com/cocina123, inventario@gioka.com/inventario123.
- Vender/cobrar exige caja abierta (`cash_sessions.closed_at IS NULL`); abrir caja requiere monto + email + contraseña del cajero (`POST /api/cash/open`). `client/src/components/OpenCash.tsx` centraliza el estado de caja (`useCashSession`).
- Fechas en DB en ISO UTC; agrupaciones por día usan `date(created_at,'localtime')`.
- Paleta de gráficos validada (dataviz): `#e0702f, #2b7fb8, #b8860b, #7d55d6, #2a8f68` en orden fijo.
- Sin dependencias nativas: `pg` es JS puro; no agregar módulos de impresora USB.
- Todas las rutas son `async`; los flags `active/paid/track_stock` son INTEGER 0/1 en Postgres (se convierten a boolean al responder). Fechas en TEXT ISO UTC. Emails únicos por `lower(email)`.
- Para probar sin Supabase: `docker run -d -e POSTGRES_PASSWORD=test -e POSTGRES_DB=gioka -p 55432:5432 postgres:16-alpine` y `DATABASE_URL=postgres://postgres:test@localhost:55432/gioka`.

## Regla de trabajo: publicar cada cambio
Después de CADA alteración al proyecto (código, docs, config), hacer commit y `git push origin main` sin que el usuario lo pida.
Remote: `https://github.com/giokacafeybakery/gioka.git` (rama `main`, repo privado). Cuenta con acceso: `stivencortez2026-afk` — si `gh auth status` muestra otra activa, ejecutar `gh auth switch --user stivencortez2026-afk` antes del push. Si el push falla, avisar al usuario en una línea y continuar.
Nunca commitear `.env`, `server/data/*.db`, `server/uploads/*` ni tokens/credenciales (ya están en `.gitignore`).

## Resumen del proyecto y de lo acordado (historial)
- 2026-09-17 — Se creó Gioka desde cero: sistema para el cafetín "Gioka — Café · Heladería · Bakery" (logo panda). Referencia de diseño: dashboard POS con sidebar oscura, tarjetas de producto y panel de pedido a la derecha. Requisito explícito: diseño cuidado, nada de íconos ni pantallas amateur.
- Módulos: PDV con impresión térmica (navegador 80 mm o ESC/POS por red), pedidos/cocina (KDS) en tiempo real, caja (apertura/cierre), inventario con insumos + recetas + alertas, administración (productos, categorías, equipo, ajustes), reportes PWA (ventas, ganancias, productos en falta), pantalla pública para clientes (`/pantalla`) y seguimiento por QR (`/seguir/:code`).
- Decisiones: UI en español (el usuario escribe en portugués/español; responderle en su idioma). Sin dependencias nativas (SQLite de Node 24). Íconos PWA generados con Pillow (`client/scripts/make-icons.py`). Paleta de gráficos validada con el validador de dataviz.
- Permisos (pedido del usuario): **cajero** ve stock pero no edita nada; todo lo de edición (productos, insumos, stock, categorías, usuarios, ajustes) y los reportes son solo del **admin**. **cocina** solo ve pedidos.
- Acceso: login por **correo + contraseña** (reemplazó al PIN). Los perfiles se crean solo desde Administración → Equipo. Demo: admin@gioka.com/admin123, cajero@gioka.com/cajero123, cocina@gioka.com/cocina123, inventario@gioka.com/inventario123.
- Caja: para vender hay que **abrir la caja** registrando monto inicial + correo + contraseña del cajero (el turno queda a su nombre). Con caja cerrada el PDV bloquea vender/cobrar (cliente y servidor). Solo quien abrió la caja o un admin puede cerrarla.
- Supabase: el usuario pegó un token personal (`sbp_…`) en el chat; NO se guardó en ningún archivo. Se le recomendó revocarlo. Pendiente definir qué quiere (migrar a Postgres, desplegar, auth o backup).
- GitHub: repo privado `giokacafeybakery/gioka`, publicado el 2026-09-17 con la cuenta `stivencortez2026-afk` (tiene push). Cada cambio se sube a `main`.
- 2026-09-17 — Nuevo rol **Gestor de inventario** (`inventario`): entra/quita stock de insumos y productos y crea/edita insumos. Cada ajuste guarda foto del comprobante (obligatoria para ese rol, opcional para admin; `stock_movements.photo` en `server/uploads/`), hora automática, usuario y motivo/detalle opcional. El admin lo audita en Administración → "Ajustes de stock" (`client/src/components/StockLog.tsx`, endpoint `GET /api/inventory/movements?manual=1`). Migración automática del CHECK de roles y de las columnas `photo`/`notes`.
- 2026-09-17 — PWA móvil `/app` (estilo app de Apple, referencia: lista de tarjetas + barra inferior con botón central verde). Solo inventario y admin. Flujo: lista → detalle del ítem → ajustar (foto obligatoria para inventario) → confirmar → pantalla de éxito animada. Tabs: Inicio, Alertas, Ajustar, Historial, Perfil. Transiciones push/pop con `motion` (AnimatePresence), layoutId compartido en la miniatura. `start_url` del manifest → `/app`. El rol inventario ya no usa la página de inventario de escritorio.
- 2026-09-17 — Ajustes tras prueba en teléfono real: teclado numérico propio (`Keypad` en hoja `Sheet` por portal, sin teclado del sistema), hojas por `createPortal` (z-[80]) para que no queden bajo la barra de tabs, altura `100dvh` para Safari iOS, más padding inferior. Regla: en móvil nunca usar `<input type=number>` para cantidades; usar `Keypad`.
- 2026-09-18 — Migración a **Supabase**: el servidor pasó de `node:sqlite` a Postgres (`pg`, sin dependencias nativas) y las fotos a Supabase Storage. El usuario pidió "conectarse a Supabase y gestionar todo" con su token personal (guardado solo en `server/.env`, ignorado por git). La cuenta no tenía organización ni proyecto; crearlos por API fue bloqueado por permisos, así que el usuario los crea en el dashboard y el resto (esquema, seed, rol, bucket) se hace por API/arranque. Suite e2e (`scratchpad/e2e-pg.mjs`) verificada contra Postgres 16 local en Docker: 64 casos OK.
