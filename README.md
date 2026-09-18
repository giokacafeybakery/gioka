# 🐼 Gioka — Café · Heladería · Bakery

Sistema completo para o cafetín Gioka: **punto de venta (PDV)** com impressão térmica, **pedidos em tempo real** (cozinha/KDS), **caixa**, **inventário** com receitas e alertas, **painel para clientes**, **acompanhamento de pedido por QR** e **relatórios** instaláveis como **PWA** no celular.

Interface em espanhol, identidade visual do panda Gioka.

---

## Requisitos

- **Node.js 24+** (nenhuma dependência nativa para compilar)
- Um projeto **Supabase** (Postgres + Storage). O banco e as fotos ficam na nuvem, então vários PCs/celulares usam os mesmos dados.
- Windows, macOS ou Linux

## Instalação e uso

```bash
npm install          # instala server + client
cp server/.env.example server/.env   # e preencha DATABASE_URL (+ SUPABASE_URL / SUPABASE_SERVICE_KEY para fotos)
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
| cajero@gioka.com    | cajero123  | Cajero  | PDV, pedidos, caixa, inventário **somente leitura**                    |
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

Tudo é atualizado em tempo real via WebSocket (Socket.IO).

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
├── server/                 Node + Express + Socket.IO + Postgres (pg → Supabase)
│   ├── src/db.js           esquema, seed inicial, helpers get/all/run/transaction
│   ├── src/storage.js      fotos em Supabase Storage (ou server/uploads sem Supabase)
│   ├── scripts/supabase-admin.mjs  utilitário da Management API (listar projetos, rodar SQL)
│   ├── src/escpos.js       gerador ESC/POS + envio TCP
│   └── src/routes/         auth, catalog, orders, inventory, reports, settings, print, cash
│   └── .env                DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_KEY (não versionado)
├── client/                 Vite + React + TypeScript + Tailwind v4 + PWA
│   ├── src/pages/          Login, Pos, Pedidos, Caja, Inventario, Admin, Reportes, Pantalla, Seguir
│   ├── src/components/     AppShell (sidebar), Logo (panda SVG), Receipt, ui
│   └── scripts/make-icons.py  gera os ícones PNG do PWA
└── start-gioka.cmd         atalho para Windows
```

## Backup

Os dados ficam no Postgres do Supabase (backups diários automáticos no plano do projeto; também é possível exportar em *Database → Backups*). As fotos ficam no bucket `gioka` do Supabase Storage.

## Rede local

O servidor escuta em `0.0.0.0:3001`. Descubra o IP do PC (`ipconfig`) e acesse `http://IP:3001` de tablets, celulares e da TV da pantalla. Libere a porta 3001 no firewall do Windows se necessário. Para usar outra porta: `set PORT=8080 && npm start`.
