# Faturamento e Vendas vindos do Kanban PRO — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As abas Produção e Vendas passam a ler do Kanban PRO por uma função na Vercel, com os mesmos campos que o dashboard já consome.

**Architecture:** Nova função `GET /api/faturamento` (padrão das funções do ShopFloor: dependências injetadas, testável) autoriza o usuário do dashboard, chama `GET {KANBAN_URL}/api/integracoes/dashboard/faturamento` com token de servidor e converte a resposta, num módulo puro, nas linhas legadas (`previsto` / `realizado` / `vendas`). O `index.html` só troca a URL, envia a sessão, lê `Qtde Faturada` e escapa/encurta o nome do cliente.

**Tech Stack:** Vercel Node Functions (ESM), `@supabase/supabase-js` v2, `node --test` (Node 20+), HTML/JS puro no front.

**Spec:** `docs/superpowers/specs/2026-10-08-faturamento-kanban-design.md`

## Global Constraints

- Rota do Kanban: `GET {KANBAN_URL}/api/integracoes/dashboard/faturamento?de=YYYY-MM&ate=YYYY-MM`, `Authorization: Bearer {KANBAN_DASHBOARD_TOKEN}`.
- Env da Vercel: `KANBAN_URL` (`https://kanbanpro.enterplak.com.br`), `KANBAN_DASHBOARD_TOKEN`. Ausentes → 503 `"Integração com o Kanban não configurada."`.
- Função do dashboard: `GET /api/faturamento?mes=<nome>/<aa>&mes2=…&mes3=…` (ex.: `outubro/26`); só GET (405); `Cache-Control: no-store`; resposta 200 = **array** de linhas; erro = `{ erro }` com status ≠ 2xx.
- Permissão: admin/moderador sempre; `usuario` precisa de `faturamento` **ou** `vendas`. Mensagem: `"Sem permissão para Produção/Vendas."`.
- Meses PT-BR minúsculos: `janeiro fevereiro março abril maio junho julho agosto setembro outubro novembro dezembro`; ano de 2 dígitos `aa` → `20aa`.
- Datas do Kanban `"YYYY-MM-DD"` → `"DD/MM/YYYY"`; mês → `"setembro/26"`.
- `previsto` e `realizado` só do mês `mes`; `vendas` de todo o intervalo, só `moeda === "BRL"`.
- Cliente: nome do Kanban (trim); `null`/vazio → `"(sem cliente)"`; mesmo nome com `clienteId` diferente → `"Nome (2)"`, `"Nome (3)"`…
- Timeout da chamada ao Kanban: 15 s. Não-2xx → 502 `"Kanban respondeu <status>."`; erro de rede/JSON → 502 `"Kanban indisponível."`.
- `main` publica em produção automaticamente: as Tasks 1–3 podem ir para a `main` (a função fica inerte sem uso pelo front); a **Task 4 fica em branch** até a validação da Task 5.
- Estilo: `api/` em ESM; `index.html` em `var`, funções nomeadas, aspas simples, comentários em PT-BR.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `api/_lib/auth.js` (modificar) | `autorizarUsuario` passa a aceitar as páginas exigidas e a mensagem de recusa |
| `api/_lib/faturamento.js` (novo) | puro: validar meses, calcular intervalo, converter resposta do Kanban em linhas legadas |
| `api/_lib/handlers.js` (modificar) | `criarHandlerFaturamento` |
| `api/faturamento.js` (novo) | liga o handler às dependências reais |
| `tests/auth.test.js`, `tests/faturamento.test.js` (novo), `tests/handlers.test.js` | testes |
| `index.html` (modificar, em branch) | URL + sessão, `Qtde Faturada`, nome do cliente escapado e com reticências |

---

### Task 1: Autorização por página configurável

**Files:**
- Modify: `api/_lib/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Produces:
  - `podeVerAlguma(perfil, paginas: string[], exigidas: string[]): boolean`
  - `autorizarUsuario(authorization, { criarCliente, paginasExigidas = ['shopfloor_fluxo'], erroSemPermissao = 'Sem permissão para o Fluxo ShopFloor.' })` — mesmo retorno de antes.
  - `podeVerFluxo(perfil, paginas)` continua existindo (= `podeVerAlguma(perfil, paginas, [PERMISSAO_FLUXO])`).

- [ ] **Step 1: Escrever os testes (falhando)** — acrescentar ao final de `tests/auth.test.js` (reaproveita o `fakeCliente` já existente no arquivo):

```js
import { podeVerAlguma } from '../api/_lib/auth.js'

test('podeVerAlguma: basta uma das páginas exigidas', () => {
  const u = { role: 'usuario', active: true }
  assert.equal(podeVerAlguma(u, ['vendas'], ['faturamento', 'vendas']), true)
  assert.equal(podeVerAlguma(u, ['faturamento'], ['faturamento', 'vendas']), true)
  assert.equal(podeVerAlguma(u, ['logistica'], ['faturamento', 'vendas']), false)
  assert.equal(podeVerAlguma({ role: 'moderador', active: true }, [], ['faturamento']), true)
  assert.equal(podeVerAlguma({ role: 'admin', active: false }, [], ['faturamento']), false)
  assert.equal(podeVerAlguma(null, ['faturamento'], ['faturamento']), false)
})

test('autorizarUsuario: páginas exigidas e mensagem configuráveis', async () => {
  const opts = { paginasExigidas: ['faturamento', 'vendas'], erroSemPermissao: 'Sem permissão para Produção/Vendas.' }
  const ok = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perms: ['vendas'] }), ...opts })
  assert.deepEqual(ok, { ok: true, userId: 'u1' })
  const negado = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perms: ['shopfloor_fluxo'] }), ...opts })
  assert.deepEqual(negado, { ok: false, status: 403, erro: 'Sem permissão para Produção/Vendas.' })
})
```

(Se o arquivo já importa de `../api/_lib/auth.js` numa linha só, acrescente `podeVerAlguma` a esse import em vez de duplicar.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `podeVerAlguma` não exportado.

- [ ] **Step 3: Implementar** — em `api/_lib/auth.js`, substituir `podeVerFluxo` e a assinatura/final de `autorizarUsuario`:

```js
export function podeVerAlguma(perfil, paginas, exigidas) {
  if (!perfil || perfil.active === false) return false
  if (perfil.role === 'admin' || perfil.role === 'moderador') return true
  return Array.isArray(paginas) && exigidas.some((p) => paginas.includes(p))
}

export function podeVerFluxo(perfil, paginas) {
  return podeVerAlguma(perfil, paginas, [PERMISSAO_FLUXO])
}
```

```js
export async function autorizarUsuario(authorization, {
  criarCliente,
  paginasExigidas = [PERMISSAO_FLUXO],
  erroSemPermissao = 'Sem permissão para o Fluxo ShopFloor.',
}) {
  // … corpo atual inalterado até o cálculo de `paginas` …

  if (!podeVerAlguma(perfil, paginas, paginasExigidas)) return { ok: false, status: 403, erro: erroSemPermissao }
  return { ok: true, userId }
}
```

Atualize o comentário JSDoc de `autorizarUsuario` para dizer "a permissão exigida (por padrão, a do Fluxo ShopFloor)".

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos; os testes antigos do Fluxo continuam passando sem alteração)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/auth.js tests/auth.test.js
git commit -m "refactor(api): autorização por página configurável"
```

---

### Task 2: Conversão Kanban → linhas legadas

**Files:**
- Create: `api/_lib/faturamento.js`
- Test: `tests/faturamento.test.js`

**Interfaces:**
- Produces:
  - `MESES: string[]` (12 nomes PT-BR minúsculos)
  - `parseMesParam(s: unknown): { ano: number, mes: number } | null` — `"outubro/26"` → `{ ano: 2026, mes: 10 }`
  - `intervaloDeMeses(lista: {ano,mes}[]): { de: 'YYYY-MM', ate: 'YYYY-MM' }`
  - `converterKanban(json, alvo: {ano,mes}): Array<object>` — linhas `previsto`/`realizado`/`vendas`

- [ ] **Step 1: Escrever o teste (falhando)** — `tests/faturamento.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MESES, parseMesParam, intervaloDeMeses, converterKanban } from '../api/_lib/faturamento.js'

const KANBAN = {
  geradoEm: '2026-10-08T12:00:00Z',
  entregas: [
    { id: 'e1', pedidoId: 'p1', pedido: 'ALFA PV0002/26 ACP002/26', acp: 'ACP002/26', clienteId: 'c1', cliente: ' Alfa Sistemas ',
      produtoCodigo: 'X', produtoDescricao: 'PLACA LED', quantidade: 1000, data: '2026-09-30', cambio: 5.2, valorEstimadoBRL: 5000.5 },
    { id: 'e2', pedidoId: 'p2', pedido: 'BETA sem acp', acp: null, clienteId: 'c2', cliente: 'BETA',
      produtoCodigo: 'Y', produtoDescricao: 'MODULO', quantidade: 10, data: '2026-10-05', cambio: 5.2, valorEstimadoBRL: 999 },
    { id: 'e3', pedidoId: 'p3', pedido: 'sem data', acp: null, clienteId: 'c2', cliente: 'BETA',
      produtoCodigo: 'Z', produtoDescricao: '', quantidade: 5, data: null, cambio: 5.2, valorEstimadoBRL: 1 },
  ],
  notas: [
    { id: 'n1', pedidoId: 'p1', pedido: 'ALFA PV0002/26 ACP002/26', acp: 'ACP002/26', clienteId: 'c1', cliente: 'Alfa Sistemas',
      produtoCodigo: 'X', produtoDescricao: 'PLACA LED', quantidade: 141, data: '2026-09-11', cambio: 5.1654, numeroNF: 1001, valorBRL: 1234.56 },
    { id: 'n2', pedidoId: 'p9', pedido: 'Outra ALFA', acp: null, clienteId: 'c9', cliente: 'Alfa Sistemas',
      produtoCodigo: 'W', produtoDescricao: 'CABO', quantidade: 2, data: '2026-09-22', cambio: 5.17, numeroNF: null, valorBRL: 100 },
    { id: 'n3', pedidoId: 'p4', pedido: 'Sem cliente', acp: null, clienteId: null, cliente: null,
      produtoCodigo: 'V', produtoDescricao: 'X', quantidade: 1, data: '2026-08-01', cambio: 5, numeroNF: 1, valorBRL: 50 },
  ],
  vendas: [
    { pedidoId: 'v1', pedido: 'ORC001/26', acp: 'ACP003/26', clienteId: 'c3', cliente: 'DELTA', valor: 2500.9, moeda: 'BRL',
      dataAprovacao: '2026-09-14', dataAprovacaoOrigem: 'evento' },
    { pedidoId: 'v2', pedido: 'ORC002/26', acp: null, clienteId: 'c3', cliente: 'DELTA', valor: 5000, moeda: 'USD',
      dataAprovacao: '2026-09-15', dataAprovacaoOrigem: 'evento' },
    { pedidoId: 'v3', pedido: 'ORC003/26', acp: null, clienteId: 'c4', cliente: 'OMEGA', valor: 700, moeda: 'BRL',
      dataAprovacao: '2026-07-02', dataAprovacaoOrigem: 'pedido' },
  ],
}

test('MESES e parseMesParam', () => {
  assert.equal(MESES.length, 12)
  assert.equal(MESES[2], 'março')
  assert.deepEqual(parseMesParam('outubro/26'), { ano: 2026, mes: 10 })
  assert.deepEqual(parseMesParam(' Março/27 '), { ano: 2027, mes: 3 })
  for (const ruim of [undefined, '', 'outubro', 'outubro/2026', 'octubre/26', '10/26', 'outubro/2x', 42]) {
    assert.equal(parseMesParam(ruim), null, String(ruim))
  }
})

test('intervaloDeMeses usa o menor e o maior mês', () => {
  assert.deepEqual(intervaloDeMeses([{ ano: 2026, mes: 9 }, { ano: 2026, mes: 7 }, { ano: 2026, mes: 8 }]), { de: '2026-07', ate: '2026-09' })
  assert.deepEqual(intervaloDeMeses([{ ano: 2026, mes: 12 }, { ano: 2027, mes: 1 }]), { de: '2026-12', ate: '2027-01' })
  assert.deepEqual(intervaloDeMeses([{ ano: 2026, mes: 10 }]), { de: '2026-10', ate: '2026-10' })
})

test('previsto: entregas do mês alvo, no formato da planilha', () => {
  const linhas = converterKanban(KANBAN, { ano: 2026, mes: 9 })
  const prev = linhas.filter((r) => r._source === 'previsto')
  assert.deepEqual(prev, [{
    ID: 'ACP002/26', Cliente: 'Alfa Sistemas', PMO: 'ACP002/26', 'Descrição': 'PLACA LED',
    'Qtde planejada': 1000, 'Data entrega planejada': '30/09/2026', 'Mês entrega planejada': 'setembro/26',
    'Total fat. Estimado': 5000.5, _source: 'previsto',
  }])
})

test('previsto sem acp usa o título como ID; entrega sem data é descartada', () => {
  const prev = converterKanban(KANBAN, { ano: 2026, mes: 10 }).filter((r) => r._source === 'previsto')
  assert.equal(prev.length, 1)
  assert.equal(prev[0].ID, 'BETA sem acp')
  assert.equal(prev[0].PMO, '')
})

test('realizado: notas do mês alvo; nomes iguais de clientes diferentes são desambiguados', () => {
  const real = converterKanban(KANBAN, { ano: 2026, mes: 9 }).filter((r) => r._source === 'realizado')
  assert.deepEqual(real[0], {
    ID: 'ACP002/26', 'Mês': 'setembro/26', Cliente: 'Alfa Sistemas', PMO: 'ACP002/26', 'Descrição': 'PLACA LED',
    'Qtde Faturada': 141, 'Data faturada': '11/09/2026', 'Dólar': 5.1654, 'Valor total': 1234.56,
    'Nota Fiscal': 1001, _source: 'realizado',
  })
  assert.equal(real[1].Cliente, 'Alfa Sistemas (2)')
  assert.equal(real[1]['Nota Fiscal'], '')
  assert.equal(real.length, 2)
})

test('cliente nulo vira "(sem cliente)"', () => {
  const real = converterKanban(KANBAN, { ano: 2026, mes: 8 }).filter((r) => r._source === 'realizado')
  assert.equal(real[0].Cliente, '(sem cliente)')
})

test('vendas: todo o intervalo, só BRL, nas colunas da planilha Comercial', () => {
  const vendas = converterKanban(KANBAN, { ano: 2026, mes: 9 }).filter((r) => r._source === 'vendas')
  assert.equal(vendas.length, 2)
  assert.deepEqual(vendas[0], {
    col_2: 'ORC001/26', col_3: 2500.9, col_4: 'ACP003/26', col_6: 'Aprovado',
    col_8: '14/09/2026', col_9: 'setembro/26', col_10: '14/09/2026', col_11: 'setembro/26', col_14: 'setembro/26',
    cliente: 'DELTA', dataAprovacaoOrigem: 'evento', _source: 'vendas',
  })
  assert.equal(vendas[1].col_11, 'julho/26')
})

test('resposta vazia ou malformada não quebra', () => {
  assert.deepEqual(converterKanban({}, { ano: 2026, mes: 9 }), [])
  assert.deepEqual(converterKanban(null, { ano: 2026, mes: 9 }), [])
  assert.deepEqual(converterKanban({ entregas: 'x', notas: [null], vendas: [{}] }, { ano: 2026, mes: 9 }), [])
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../api/_lib/faturamento.js'`

- [ ] **Step 3: Implementar `api/_lib/faturamento.js`**

```js
// Converte a resposta do Kanban PRO nas linhas que o dashboard já lê da planilha
// (previsto = "Plan entregas", realizado = "Faturamento", vendas = "Comercial").
// Os nomes de campo são os da planilha de propósito: parseFaturamentoData no index.html não muda.

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const pad2 = (n) => String(n).padStart(2, '0')
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/

/** "outubro/26" → { ano: 2026, mes: 10 }; qualquer outra coisa → null. */
export function parseMesParam(s) {
  if (typeof s !== 'string') return null
  const m = s.trim().toLowerCase().match(/^([a-zç]+)\/(\d{2})$/)
  if (!m) return null
  const mes = MESES.indexOf(m[1]) + 1
  if (mes === 0) return null
  return { ano: 2000 + Number(m[2]), mes }
}

export function intervaloDeMeses(lista) {
  const chave = (x) => x.ano * 12 + (x.mes - 1)
  const ord = [...lista].sort((a, b) => chave(a) - chave(b))
  const fmt = (x) => x.ano + '-' + pad2(x.mes)
  return { de: fmt(ord[0]), ate: fmt(ord[ord.length - 1]) }
}

function partesData(ymd) {
  const m = typeof ymd === 'string' ? ymd.match(RE_DATA) : null
  return m ? { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) } : null
}
const dataBR = (p) => pad2(p.dia) + '/' + pad2(p.mes) + '/' + p.ano
const mesLabel = (p) => MESES[p.mes - 1] + '/' + String(p.ano).slice(-2)
const noMes = (p, alvo) => p.ano === alvo.ano && p.mes === alvo.mes
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/** Nome de exibição por cliente: mesmo nome com clienteId diferente ganha " (2)", " (3)"… */
function criarNomeador() {
  const porChave = new Map()
  const usados = new Map() // nome base → quantidade de chaves que já o usam
  return function nomeDe(item) {
    const base = (typeof item.cliente === 'string' && item.cliente.trim()) || '(sem cliente)'
    const chave = item.clienteId != null ? 'id:' + item.clienteId : 'nome:' + base
    if (porChave.has(chave)) return porChave.get(chave)
    const n = (usados.get(base) || 0) + 1
    usados.set(base, n)
    const nome = n === 1 ? base : base + ' (' + n + ')'
    porChave.set(chave, nome)
    return nome
  }
}

export function converterKanban(json, alvo) {
  const fonte = json && typeof json === 'object' ? json : {}
  const nomeDe = criarNomeador()
  const linhas = []

  for (const e of lista(fonte.entregas)) {
    const p = partesData(e.data)
    if (!p || !noMes(p, alvo)) continue
    linhas.push({
      ID: e.acp || e.pedido || '',
      Cliente: nomeDe(e),
      PMO: e.acp || '',
      'Descrição': e.produtoDescricao || '',
      'Qtde planejada': num(e.quantidade),
      'Data entrega planejada': dataBR(p),
      'Mês entrega planejada': mesLabel(p),
      'Total fat. Estimado': num(e.valorEstimadoBRL),
      _source: 'previsto',
    })
  }

  for (const n of lista(fonte.notas)) {
    const p = partesData(n.data)
    if (!p || !noMes(p, alvo)) continue
    linhas.push({
      ID: n.acp || n.pedido || '',
      'Mês': mesLabel(p),
      Cliente: nomeDe(n),
      PMO: n.acp || '',
      'Descrição': n.produtoDescricao || '',
      'Qtde Faturada': num(n.quantidade),
      'Data faturada': dataBR(p),
      'Dólar': num(n.cambio),
      'Valor total': num(n.valorBRL),
      'Nota Fiscal': n.numeroNF != null ? n.numeroNF : '',
      _source: 'realizado',
    })
  }

  // Vendas: todo o intervalo pedido (o dashboard separa por mês/trimestre). Só BRL, igual à tela do Kanban.
  for (const v of lista(fonte.vendas)) {
    if (v.moeda !== 'BRL') continue
    const p = partesData(v.dataAprovacao)
    if (!p) continue
    const d = dataBR(p)
    const m = mesLabel(p)
    linhas.push({
      col_2: v.pedido || '',
      col_3: num(v.valor),
      col_4: v.acp || '',
      col_6: 'Aprovado',
      col_8: d, col_9: m, col_10: d, col_11: m, col_14: m,
      cliente: nomeDe(v),
      dataAprovacaoOrigem: v.dataAprovacaoOrigem || '',
      _source: 'vendas',
    })
  }

  return linhas
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/faturamento.js tests/faturamento.test.js
git commit -m "feat(api): conversão do faturamento do Kanban para as linhas do dashboard"
```

---

### Task 3: Função `/api/faturamento`

**Files:**
- Modify: `api/_lib/handlers.js`
- Create: `api/faturamento.js`
- Test: `tests/handlers.test.js`

**Interfaces:**
- Consumes: `parseMesParam`, `intervaloDeMeses`, `converterKanban` (Task 2); `autorizarUsuario` com `paginasExigidas`/`erroSemPermissao` (Task 1).
- Produces: `criarHandlerFaturamento({ autorizar, fetchFn, env })`; HTTP `GET /api/faturamento?mes=&mes2=&mes3=` → `200 [linhas]` | `400/401/403/405/502/503 { erro }`.

- [ ] **Step 1: Escrever os testes (falhando)** — acrescentar a `tests/handlers.test.js` (reaproveita `fakeRes`, `autorizado`, `negado` já existentes no arquivo; acrescente `criarHandlerFaturamento` ao import de `../api/_lib/handlers.js`):

```js
const envKanban = { KANBAN_URL: 'https://kanbanpro.enterplak.com.br', KANBAN_DASHBOARD_TOKEN: 'kb-secret' }
const respostaKanban = {
  entregas: [{ pedido: 'P', acp: 'ACP1/26', clienteId: 'c1', cliente: 'ALFA', produtoDescricao: 'D', quantidade: 10, data: '2026-09-30', valorEstimadoBRL: 100 }],
  notas: [{ pedido: 'P', acp: 'ACP1/26', clienteId: 'c1', cliente: 'ALFA', produtoDescricao: 'D', quantidade: 5, data: '2026-09-11', cambio: 5.1654, numeroNF: 1, valorBRL: 50 }],
  vendas: [{ pedido: 'OMT', acp: null, clienteId: 'c2', cliente: 'G', valor: 10, moeda: 'BRL', dataAprovacao: '2026-07-02', dataAprovacaoOrigem: 'evento' }],
}
const reqFat = (query) => ({ method: 'GET', headers: { authorization: 'Bearer t' }, query })
const silenciarErro = async (fn) => {
  const original = console.error
  console.error = () => {}
  try { return await fn() } finally { console.error = original }
}

test('faturamento: chama o Kanban com o intervalo do trimestre e devolve as linhas', async () => {
  let chamada
  const fetchFn = async (url, opts) => { chamada = { url, opts }; return { ok: true, status: 200, json: async () => respostaKanban } }
  const res = fakeRes()
  await criarHandlerFaturamento({ autorizar: autorizado, fetchFn, env: envKanban })(
    reqFat({ mes: 'setembro/26', mes2: 'julho/26', mes3: 'agosto/26' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(chamada.url, 'https://kanbanpro.enterplak.com.br/api/integracoes/dashboard/faturamento?de=2026-07&ate=2026-09')
  assert.equal(chamada.opts.headers.Authorization, 'Bearer kb-secret')
  assert.ok(Array.isArray(res.body))
  assert.deepEqual(res.body.map((r) => r._source), ['previsto', 'realizado', 'vendas'])
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('faturamento: só GET', async () => {
  const res = fakeRes()
  await criarHandlerFaturamento({ autorizar: autorizado, fetchFn: async () => {}, env: envKanban })({ method: 'POST', headers: {}, query: {} }, res)
  assert.equal(res.statusCode, 405)
})

test('faturamento: sem permissão não consulta o Kanban', async () => {
  let chamou = false
  const res = fakeRes()
  await criarHandlerFaturamento({ autorizar: negado, fetchFn: async () => { chamou = true }, env: envKanban })(reqFat({ mes: 'setembro/26' }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(chamou, false)
})

test('faturamento: falha ao verificar sessão → 503', async () => {
  const res = fakeRes()
  await silenciarErro(() => criarHandlerFaturamento({ autorizar: async () => { throw new Error('x') }, fetchFn: async () => {}, env: envKanban })(reqFat({ mes: 'setembro/26' }), res))
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.erro, 'Não foi possível verificar a sessão agora.')
})

test('faturamento: mês ausente ou inválido → 400', async () => {
  for (const query of [{}, { mes: 'setembro' }, { mes: 'setembro/26', mes2: 'xx/26' }]) {
    const res = fakeRes()
    await criarHandlerFaturamento({ autorizar: autorizado, fetchFn: async () => {}, env: envKanban })(reqFat(query), res)
    assert.equal(res.statusCode, 400, JSON.stringify(query))
  }
})

test('faturamento: sem configuração → 503', async () => {
  const res = fakeRes()
  await criarHandlerFaturamento({ autorizar: autorizado, fetchFn: async () => {}, env: {} })(reqFat({ mes: 'setembro/26' }), res)
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.erro, 'Integração com o Kanban não configurada.')
})

test('faturamento: Kanban com erro HTTP → 502 com o status', async () => {
  const res = fakeRes()
  await criarHandlerFaturamento({ autorizar: autorizado, fetchFn: async () => ({ ok: false, status: 401 }), env: envKanban })(reqFat({ mes: 'setembro/26' }), res)
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.erro, 'Kanban respondeu 401.')
})

test('faturamento: Kanban fora do ar → 502', async () => {
  const res = fakeRes()
  await silenciarErro(() => criarHandlerFaturamento({ autorizar: autorizado, fetchFn: async () => { throw new Error('ECONNREFUSED') }, env: envKanban })(reqFat({ mes: 'setembro/26' }), res))
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.erro, 'Kanban indisponível.')
})
```

(Se `silenciarErro` já existir no arquivo, não duplique.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `criarHandlerFaturamento` não exportado.

- [ ] **Step 3: Implementar** — em `api/_lib/handlers.js`, acrescentar o import e a fábrica:

```js
import { parseMesParam, intervaloDeMeses, converterKanban } from './faturamento.js'
```

```js
export function criarHandlerFaturamento({ autorizar, fetchFn, env }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' })

    let a
    try {
      a = await autorizar(req.headers.authorization)
    } catch (e) {
      console.error('[faturamento] falha ao verificar a sessão:', e.message)
      return res.status(503).json({ erro: 'Não foi possível verificar a sessão agora.' })
    }
    if (!a.ok) return res.status(a.status).json({ erro: a.erro })

    const query = req.query || {}
    const alvo = parseMesParam(query.mes)
    const extras = [query.mes2, query.mes3].filter((m) => m !== undefined && m !== '')
    const outros = extras.map(parseMesParam)
    if (!alvo || outros.some((m) => !m)) return res.status(400).json({ erro: 'Mês inválido.' })

    if (!env.KANBAN_URL || !env.KANBAN_DASHBOARD_TOKEN) {
      return res.status(503).json({ erro: 'Integração com o Kanban não configurada.' })
    }

    try {
      const { de, ate } = intervaloDeMeses([alvo, ...outros])
      const url = new URL('/api/integracoes/dashboard/faturamento', env.KANBAN_URL)
      url.searchParams.set('de', de)
      url.searchParams.set('ate', ate)
      const r = await fetchFn(url.toString(), {
        headers: { Authorization: 'Bearer ' + env.KANBAN_DASHBOARD_TOKEN },
        signal: AbortSignal.timeout(15000),
      })
      if (!r.ok) return res.status(502).json({ erro: 'Kanban respondeu ' + r.status + '.' })
      return res.status(200).json(converterKanban(await r.json(), alvo))
    } catch (e) {
      console.error('[faturamento] falha ao consultar o Kanban:', e.message)
      return res.status(502).json({ erro: 'Kanban indisponível.' })
    }
  }
}
```

`api/faturamento.js`:

```js
import { criarHandlerFaturamento } from './_lib/handlers.js'
import { autorizarUsuario, criarClienteSupabase } from './_lib/auth.js'

export default criarHandlerFaturamento({
  autorizar: (authorization) => autorizarUsuario(authorization, {
    criarCliente: criarClienteSupabase,
    paginasExigidas: ['faturamento', 'vendas'],
    erroSemPermissao: 'Sem permissão para Produção/Vendas.',
  }),
  fetchFn: fetch,
  env: process.env,
})
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos, saída sem ruído)

Run: `node -e "import('./api/faturamento.js').then(m=>console.log(typeof m.default))"`
Expected: `function`

- [ ] **Step 5: Commit**

```bash
git add api/_lib/handlers.js api/faturamento.js tests/handlers.test.js
git commit -m "feat(api): função /api/faturamento lendo do Kanban PRO"
```

---

### Task 4: Front — trocar a fonte (em branch, sem merge)

**Files:**
- Modify: `index.html` (localizar pelos trechos citados)

**Interfaces:**
- Consumes: `GET /api/faturamento` (Task 3); `sfAuthHeaders()` já existente no `index.html`.

- [ ] **Step 1: Criar a branch**

```bash
git checkout -b feat/faturamento-kanban-front
```

- [ ] **Step 2: URL da fonte** — substituir:

```js
const FATURAMENTO_WEBHOOK = N8N_BASE + '/webhook/4cb6950a-eab2-4819-9467-4af2e16b5fac';
```

por:

```js
// Produção e Vendas: dados do Kanban PRO via função da Vercel (antes: planilha pelo n8n).
const FATURAMENTO_WEBHOOK = '/api/faturamento';
```

- [ ] **Step 3: Enviar a sessão e mostrar o erro do servidor** — em `loadFaturamento`, substituir:

```js
        var response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        var text = await response.text();
        if (!text || text.trim() === '') throw new Error('Webhook retornou vazio. Verifique o nó "Respond to Webhook" no n8n.');
```

por:

```js
        var headers = await sfAuthHeaders();
        if (!headers) throw new Error('Sessão expirada. Faça login novamente.');
        var response = await fetch(url, { cache: 'no-store', headers: headers });
        if (!response.ok) {
            var msgErro = 'HTTP ' + response.status;
            try { var corpoErro = await response.json(); if (corpoErro && corpoErro.erro) msgErro = corpoErro.erro; } catch (e) {}
            throw new Error(msgErro);
        }
        var text = await response.text();
        if (!text || text.trim() === '') throw new Error('O servidor respondeu vazio.');
```

- [ ] **Step 4: Produção realizada = quantidade faturada** — em `parseFaturamentoData`, ramo `realizado`, substituir:

```js
                var embalada = parseNum(row['Qtde Embalada']);
```

por:

```js
                // Kanban: produção realizada = quantidade faturada no mês (a planilha usava "Qtde Embalada", nunca preenchida)
                var embalada = parseNum(row['Qtde Faturada']);
```

e atualizar o comentário do cabeçalho da função de `producao = Qtde Embalada (Faturamento)` para `producao = Qtde Faturada (notas do Kanban)`.

- [ ] **Step 5: Nome do cliente escapado e em uma linha** — CSS, logo após o bloco `.fat-proj-name { … }`:

```css
        .fat-proj-nome {
            display: inline-block;
            max-width: 260px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            vertical-align: bottom;
        }
```

No render dos cartões, substituir:

```js
        html += '<div class="fat-proj-name">' + proj.nome;
```

por:

```js
        var nomeProjEsc = escHtml(proj.nome);
        html += '<div class="fat-proj-name"><span class="fat-proj-nome" title="' + nomeProjEsc + '">' + nomeProjEsc + '</span>';
```

No título do gráfico, substituir:

```js
        ? 'Evolu&ccedil;&atilde;o do Faturamento - ' + faturamentoProjetoSelecionado
```

por:

```js
        ? 'Evolu&ccedil;&atilde;o do Faturamento - ' + escHtml(faturamentoProjetoSelecionado)
```

E declarar o helper logo antes de `function parseFaturamentoData`:

```js
// Nomes de cliente vêm do cadastro do Kanban (texto livre): sempre escapar antes de pôr no HTML.
function escHtml(s) {
    return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
```

(Antes de declarar, rode `grep -n "function escHtml" index.html`; se já existir, reutilize e não duplique.)

- [ ] **Step 6: Verificar**

Run: `npm test` → PASS.
Run (sintaxe dos scripts inline):

```bash
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const b=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);fs.writeFileSync(process.env.TMPDIR+"/inline.js",b.join("\n;\n"))' && node --check "$TMPDIR/inline.js" && echo SINTAXE-OK
```

Expected: `SINTAXE-OK`. `grep -n "Qtde Embalada" index.html` deve mostrar só comentários.

- [ ] **Step 7: Commit na branch (sem merge, sem push para main)**

```bash
git add index.html
git commit -m "feat: Produção e Vendas lendo do Kanban PRO"
```

---

### Task 5: Configuração, validação e troca (com o Matheus e a sessão do Kanban)

- [ ] **Step 1:** Publicar as Tasks 1–3 (`git push origin main`). Conferir: `curl -s -o /dev/null -w '%{http_code}' https://dashboard.enterplak.com.br/api/faturamento` → `401`.
- [ ] **Step 2:** Quando a rota do Kanban estiver no ar: Matheus gera `DASHBOARD_TOKEN` no servidor do Kanban (`openssl rand -base64 48`), cadastra no `.env` de produção do Kanban e na Vercel como Secret `KANBAN_DASHBOARD_TOKEN`; mais `KANBAN_URL=https://kanbanpro.enterplak.com.br` (Production e Preview). Redeploy. Conferir a impressão digital nos dois lados: `printf %s "$X" | sha256sum | cut -c1-12`.
- [ ] **Step 3:** Pelo console do navegador logado em `https://dashboard.enterplak.com.br`, chamar `/api/faturamento?mes=setembro/26&mes2=julho/26&mes3=agosto/26` e conferir: Σ `Valor total` (realizado) = faturado de setembro/26 na tela do Kanban (valor informado pela sessão do Kanban, fora do repositório); Σ `Total fat. Estimado` (previsto) = programado de setembro informado pelo Kanban; vendas BRL do trimestre = total "Efetivado" do Kanban.
- [ ] **Step 4:** `git push -u origin feat/faturamento-kanban-front` → testar a **pré-visualização da Vercel** da branch (Produção e Vendas carregando, cartões com nome completo e reticências, produção realizada ≠ 0, erro amigável sem permissão).
- [ ] **Step 5:** Com o OK do Matheus, merge da branch na `main` e conferência em produção.
- [ ] **Step 6:** Após alguns dias estável: desligar o fluxo do n8n de faturamento.
