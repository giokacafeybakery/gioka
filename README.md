# 🐼 Gioka — Café · Heladería · Bakery

Sistema completo para o cafetín Gioka: **punto de venta (PDV)** com impressão térmica, **pedidos em tempo real** (cozinha/KDS), **caixa**, **inventário** com receitas e alertas, **painel para clientes**, **acompanhamento de pedido por QR** e **relatórios** instaláveis como **PWA** no celular.

Interface em espanhol, identidade visual do panda Gioka.

---

## Requisitos

- **Node.js 22+** (nenhuma dependência nativa para compilar)
- Um projeto **Supabase** (Postgres + Storage). O banco e as fotos ficam na nuvem, então vários PCs/celulares usam os mesmos dados.
- Windows, macOS ou Linux

## Instalação e uso

```bash
npm install          # instala server + client
cp server/.env.example server/.env   # e preencha DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY (fotos) e SUPABASE_ANON_KEY (tempo real)
npm run build        # compila o front-end
npm start            # abre em http://localhost:3001
```

Na primeira execução o servidor cria as tabelas no Postgres e carrega os dados de demonstração (usuários, categorias, insumos e produtos).

No Windows, basta dar dois cliques em **`start-gioka.cmd`** (instala, compila e abre o navegador).

Para desenvolvimento (hot reload):

```bash
npm run dev          # server em :3001 e client em :5173
```

### Usuários de demonstração

| Correo              | Senha      | Perfil  | Acesso                                                                 |
|---------------------|------------|---------|------------------------------------------------------------------------|
| admin@gioka.com     | admin123   | Admin   | Tudo: edição de produtos, insumos, estoque, equipe, ajustes, relatórios |
| cajero@gioka.com    | cajero123  | Cajero  | PDV, caixa, cobrança; nos pedidos só marca **Entregado**; sem inventário |
| cocina@gioka.com    | cocina123  | Cocina  | Somente tela de pedidos (KDS)                                          |
| inventario@gioka.com | inventario123 | Gestor de inventário | Entradas/saídas de estoque e insumos, **sempre com foto do comprovante**; não vê vendas nem menu |

Os perfis são criados e editados **somente pelo administrador** em **Administración → Equipo** (nome, correo, senha, perfil). Troque as senhas de demo no primeiro uso.

### Gestor de inventário

Perfil dedicado a repor e baixar estoque. Cada movimento registra **foto do comprovante (obrigatória)**, **data/hora automática**, usuário e **motivo opcional**. O administrador audita tudo em **Administración → Ajustes de stock** (com visualização da foto). Para o admin a foto é opcional.

### Fluxo do caixa

1. O cajero entra com seu correo e senha.
2. Para vender, precisa **abrir a caixa**: informa o efectivo inicial e confirma **correo + senha** — o turno fica registrado no nome dele.
3. Com a caixa fechada o PDV bloqueia vendas e cobranças.
4. Só quem abriu a caixa (ou um admin) pode fechá-la, conferindo o efectivo contado contra o esperado.

---

## Telas

| Rota            | Tela                                                                                   |
|-----------------|----------------------------------------------------------------------------------------|
| `/login`        | Login com correo e senha                                                               |
| `/pos`          | **Punto de venta** — menu por categorias, pedido atual, pagamento (efectivo/QR/tarjeta), troco, desconto, notas para cozinha, pedidos ativos |
| `/pedidos`      | **Cocina / KDS** — quadro Pendiente → Preparando → Listo, alerta sonoro, histórico do dia |
| `/caja`         | **Caja** — abertura/fechamento com conferência de efectivo, pedidos do dia, cobrar pendentes, reimprimir |
| `/inventario`   | **Inventario** — insumos, estoque de produtos, ajustes (entrada/saída/fixar), movimentos, alertas de estoque baixo |
| `/reportes`     | **Reportes (PWA)** — ingressos, lucro, margem, pedidos por hora, métodos de pagamento, top produtos, categorias, produtos em falta, exportar CSV |
| `/admin`        | **Administración** — produtos (foto, emoji, receita), categorias, equipe, ajustes do negócio e impressora |
| `/pantalla`     | **Pantalla de clientes** (público) — para uma TV/monitor: "Preparando" e "¡Listo para retirar!" com sinal sonoro |
| `/seguir/:code` | **Seguimiento** (público) — o cliente escaneia o QR do ticket e acompanha seu pedido em tempo real |

Tudo é atualizado em tempo real: o servidor publica cada evento no **Supabase Realtime** e os navegadores assinam o canal com a chave pública do projeto (funciona tanto no PC da loja quanto na Vercel).

---

## Impressão térmica

Em **Administración → Ajustes → Impresora térmica** há dois modos:

1. **Navegador** (padrão) — usa o driver da impressora instalado no Windows. Abre o diálogo de impressão com layout de 80 mm. Funciona com qualquer impressora (USB, Bluetooth, rede).
   > Dica: no diálogo do Chrome/Edge, escolha a impressora térmica, marque "Imprimir usando a caixa de diálogo do sistema" uma vez e defina-a como padrão para evitar cliques.
2. **Red (ESC/POS)** — envia comandos ESC/POS direto para a impressora pelo IP (porta 9100). Sem diálogos, corta o papel e abre a gaveta de dinheiro em pagamentos em efectivo. Recomendado para impressoras Epson/Xprinter/Elgin com rede.
   - Configure IP, porta e largura (58 mm = 32 colunas; 80 mm = 42/48).
   - Use **Imprimir página de prueba** para validar.

O ticket inclui um **QR de acompanhamento** quando a **URL pública** estiver configurada (ex.: `http://192.168.0.10:3001`).

Com **Imprimir al crear pedido** ativo, cada venda imprime o ticket do cliente (e, em modo rede, também a comanda da cozinha).

---

## App móvel (PWA) — inventário

A PWA é o **app de inventário** (rota `/app`), com visual estilo iOS: lista de cartões, busca, filtros, barra inferior com botão central, transições animadas entre telas. Acessível **somente para os perfis inventário e admin** (cajero/cocina são redirecionados para o sistema de escritório).

Fluxo: **Início** (lista + alertas) → **Detalhe do item** (estoque, mínimo, custo, valor, movimentos recentes) → **Ajustar** (entrada/saída/fixar, quantidade, foto do comprovante, motivo, detalhe) → **Confirmar** (antes → depois, foto, responsável, hora) → **Concluído** (animação de sucesso). Abas: Início, Alertas, ➕ Ajustar, Histórico (com foto do comprovante), Perfil.

Instalação: abra o endereço do servidor no celular (mesma rede Wi‑Fi) e toque em **"Adicionar à tela inicial"** (iPhone: Compartilhar → Adicionar à tela de início). O app abre em tela cheia com o ícone do panda. Atalhos do ícone: Ajustar stock, Alertas, Histórico. O admin também acessa pelo ícone 📱 da barra lateral do sistema.

---

## Estrutura do projeto

```
gioka/
├── api/index.js            função serverless da Vercel (exporta a app Express)
├── vercel.json             build, rewrites e cache para a Vercel
├── server/                 Node + Express + Postgres (pg → Supabase) + Supabase Realtime
│   ├── src/app.js          app Express (rotas, health, realtime config); src/index.js = servidor local
│   ├── src/db.js           esquema, seed inicial, helpers get/all/run/transaction
│   ├── src/realtime.js     publica eventos ao vivo (Broadcast REST do Supabase Realtime)
│   ├── src/storage.js      fotos em Supabase Storage (ou server/uploads sem Supabase)
│   ├── scripts/supabase-admin.mjs  utilitário da Management API (listar projetos, rodar SQL)
│   ├── src/escpos.js       gerador ESC/POS + envio TCP
│   └── src/routes/         auth, catalog, orders, inventory, reports, settings, print, cash
│   └── .env                DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY (não versionado)
├── client/                 Vite + React + TypeScript + Tailwind v4 + PWA
│   ├── src/pages/          Login, Pos, Pedidos, Caja, Inventario, Admin, Reportes, Pantalla, Seguir
│   ├── src/components/     AppShell (sidebar), Logo (panda SVG), Receipt, ui
│   └── scripts/make-brand.py  gera os assets da marca e os ícones do PWA a partir de logo/
└── start-gioka.cmd         atalho para Windows
```

## Backup

Os dados ficam no Postgres do Supabase (backups diários automáticos no plano do projeto; também é possível exportar em *Database → Backups*). As fotos ficam no bucket `gioka` do Supabase Storage.

## Rede local

O servidor escuta em `0.0.0.0:3001`. Descubra o IP do PC (`ipconfig`) e acesse `http://IP:3001` de tablets, celulares e da TV da pantalla. Libere a porta 3001 no firewall do Windows se necessário. Para usar outra porta: `set PORT=8080 && npm start`.

---

## Publicar na Vercel

O front (PWA) é servido pelo CDN da Vercel e a API roda como função serverless (`api/index.js`). Banco, fotos e tempo real ficam no Supabase, então não há nada para instalar na loja — só abrir o endereço.

1. **Importar o repositório** em [vercel.com/new](https://vercel.com/new) (GitHub → `giokacafeybakery/gioka`). Framework: **Other**. Os comandos já estão em `vercel.json` (`npm run build`, saída `client/dist`); não precisa alterar nada.
2. **Variáveis de ambiente** (Settings → Environment Variables, para *Production* e *Preview*):

   | Variável | Valor |
   |----------|-------|
   | `DATABASE_URL` | connection string do Supabase em **modo transação (porta 6543)**: `postgresql://postgres.<ref>:<senha>@aws-0-<região>.pooler.supabase.com:6543/postgres` (Project Settings → Database → Connection string → *Transaction pooler*). O modo sessão (5432) também funciona, mas esgota conexões com muitas funções. |
   | `SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | chave `service_role` (Project Settings → API) — **secreta**, só no servidor |
   | `SUPABASE_ANON_KEY` | chave `anon` / publishable — pública, vai para os navegadores (tempo real). Todas as tabelas têm RLS ativo sem políticas, então ela não lê nem escreve nada. |
   | `SUPABASE_BUCKET` | `gioka` |
   | `TZ` | fuso da loja, ex. `America/Bogota` — **obrigatório**: as funções rodam em UTC e os relatórios agrupam por dia local |
   | `PG_POOL_MAX` | `2` (opcional; é o padrão na Vercel) |

   Localmente, `node server/scripts/supabase-admin.mjs anon <ref>` imprime a anon key e `env <ref> <senha>` gera o `.env` completo.
3. **Deploy**. A primeira requisição de cada instância roda `initDb()` (cria/migra tabelas, idempotente) — o banco já existente não é alterado.
4. **Domínio**: Settings → Domains (ex. `gioka.com.br`). O PWA se instala a partir do domínio final; em celulares, abrir o endereço e "Adicionar à tela inicial".
5. **Verificar**: `https://<seu-dominio>/api/health` deve responder `{"ok":true,"db":true}` e `/api/realtime` deve trazer `"enabled":true`.

Limites na nuvem:

- **Impressão térmica por rede (ESC/POS)** não funciona a partir da Vercel: o servidor não enxerga a impressora da rede local. Use o modo **Navegador** em Ajustes → Impresora (o driver da impressora no PC/tablet imprime o ticket de 80 mm), ou rode o servidor num PC da loja (`npm start`) para impressão direta.
- Corpo da requisição limitado a 4,5 MB (as fotos já são reduzidas no aparelho antes de enviar).
- Cada deploy publica o commit da `main`; previews são gerados para outras branches.
