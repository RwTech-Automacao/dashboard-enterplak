# Fluxo da OP do ShopFloor no Dashboard — Plano de Implementação (lado Dashboard)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada OP ativa do ShopFloor vira uma aba do dashboard que embute (iframe) a tela real do Fluxo da OP, com SSO da conta compartilhada.

**Architecture:** Duas funções serverless na Vercel (`/api/shopfloor-ops`, `/api/shopfloor-sso`) conferem login + permissão do dashboard e conversam com o ShopFloor usando segredos de servidor. O front (`index.html`, JS puro) ganha abas dinâmicas de OP; a lógica pura fica em `shopfloor-tabs.js` (testável). A parte do ShopFloor está na Parte A do spec e é feita por outra equipe.

**Tech Stack:** HTML/JS puro (sem build), Vercel Node Functions (ESM), `jose` (JWT HS256), `@supabase/supabase-js` v2, testes com `node --test` (Node 20+).

**Spec:** `docs/superpowers/specs/2026-10-06-fluxo-shopfloor-embed-design.md`

## Global Constraints

- Permissão do dashboard: page id `shopfloor_fluxo`. Admin e moderador sempre podem.
- Id de aba de OP: prefixo `op:`; rótulo `OP <op>`; tooltip `<cliente> — <descricao>`.
- Posição das abas de OP: depois das abas fixas, antes das abas de imagem.
- JWT de SSO: HS256, `iss = "enterplak-dashboard"`, `aud = "shopfloor-embed"`, `email = "dashboard@enterplak.com.br"`, `jti` uuid, `exp = iat + 60`.
- `next` do SSO: só caminho relativo começando com `/embed/` (nunca `/embed/sso`), sem `//`, `\`, `..`.
- Endpoint do ShopFloor: `GET <SHOPFLOOR_URL>/api/dashboard/ops-ativas?dias=<n>` com `Authorization: Bearer <DASHBOARD_API_SECRET>`; resposta `{ geradoEm, ops: [{ pmo, op, cliente, descricao, ultimoBipe }] }`.
- Mensagens do iframe (origem `https://shopfloor.enterplak.com.br`): `sf-embed:ready`, `sf-embed:login-required`, `sf-embed:error` com `code` ∈ `forbidden | op-not-found | inactive`.
- Timeout sem `ready`: 20 s. Lista de OPs recarrega a cada 5 min. Um iframe por vez.
- Segredos só em variáveis de ambiente da Vercel; nunca no HTML nem no git.
- Env da Vercel: `SHOPFLOOR_URL`, `DASHBOARD_SSO_SECRET`, `DASHBOARD_SSO_EMAIL`, `DASHBOARD_API_SECRET`, `SHOPFLOOR_OPS_DIAS`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- Estilo do `index.html`: `var`, funções nomeadas, strings com `'`, sem módulos ES. Arquivos em `api/`: ESM.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `package.json` (novo) | `"type": "module"`, deps das funções, script `test` |
| `api/_lib/sso.js` (novo) | validar `next`, assinar JWT, montar URL de SSO |
| `api/_lib/auth.js` (novo) | extrair Bearer, regra de permissão, autorizar usuário no Supabase do dashboard |
| `api/_lib/ops.js` (novo) | montar URL do endpoint do ShopFloor, normalizar a lista de OPs |
| `api/_lib/handlers.js` (novo) | fábricas dos dois handlers (dependências injetadas → testáveis) |
| `api/shopfloor-ops.js`, `api/shopfloor-sso.js` (novos) | ligam as fábricas às dependências reais |
| `shopfloor-tabs.js` (novo) | helpers puros do front (ids, rótulos, escape, decisão de mensagens) |
| `tests/*.test.js` (novos) | testes `node --test` |
| `index.html` (modificar) | abas de OP, iframe, mensagens, CSS |
| `.vercelignore` (modificar) | não publicar `tests/` |

Arquivos em `api/` com prefixo `_` não viram funções na Vercel.

---

### Task 1: Base das funções + helpers de SSO

**Files:**
- Create: `package.json`
- Create: `api/_lib/sso.js`
- Test: `tests/sso.test.js`
- Modify: `.vercelignore`

**Interfaces:**
- Produces:
  - `SSO_ISSUER: string`, `SSO_AUDIENCE: string`, `SSO_TTL_S: number`
  - `nextValido(next: unknown): boolean`
  - `assinarTokenSso({ segredo: string, email: string, agora?: number, jti?: string }): Promise<string>`
  - `montarUrlSso(base: string, token: string, next: string): string`

- [ ] **Step 1: Criar `package.json` e instalar dependências**

```json
{
  "name": "dashboard-enterplak",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/"
  }
}
```

Run: `npm install @supabase/supabase-js@^2 jose@^6`
Expected: cria `package-lock.json` e `node_modules/` (já ignorado no `.gitignore`).

- [ ] **Step 2: Não publicar os testes**

Acrescentar ao final de `.vercelignore`:

```
tests/
```

- [ ] **Step 3: Escrever o teste (falhando)**

`tests/sso.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jwtVerify } from 'jose'
import { nextValido, assinarTokenSso, montarUrlSso, SSO_ISSUER, SSO_AUDIENCE, SSO_TTL_S } from '../api/_lib/sso.js'

test('nextValido aceita caminhos /embed/ e codificação da OP', () => {
  assert.equal(nextValido('/embed/fluxo/PMOC13/2340%2F26'), true)
  assert.equal(nextValido('/embed/fluxo/x/y'), true)
})

test('nextValido recusa destinos perigosos ou fora de /embed/', () => {
  for (const ruim of [undefined, null, 42, '', '/home', 'https://evil.com/embed/',
    '//evil.com/embed/', '/embed//evil', '/embed/../home', '/embed/%2E%2E/home',
    '/embed/x\\y', '/embed/sso?token=a', '/embed/' + 'a'.repeat(600)]) {
    assert.equal(nextValido(ruim), false, String(ruim))
  }
})

test('assinarTokenSso gera JWT com os claims do contrato', async () => {
  const segredo = 'segredo-de-teste-com-tamanho-suficiente-123456'
  const agora = Math.floor(Date.now() / 1000)
  const token = await assinarTokenSso({ segredo, email: 'dashboard@enterplak.com.br', agora, jti: 'abc-123' })
  const { payload, protectedHeader } = await jwtVerify(token, new TextEncoder().encode(segredo), {
    issuer: SSO_ISSUER, audience: SSO_AUDIENCE,
  })
  assert.equal(protectedHeader.alg, 'HS256')
  assert.equal(payload.email, 'dashboard@enterplak.com.br')
  assert.equal(payload.jti, 'abc-123')
  assert.equal(payload.iat, agora)
  assert.equal(payload.exp, agora + SSO_TTL_S)
  assert.equal(SSO_TTL_S, 60)
})

test('assinarTokenSso gera jti diferente a cada chamada', async () => {
  const segredo = 'segredo-de-teste-com-tamanho-suficiente-123456'
  const a = await assinarTokenSso({ segredo, email: 'd@e.com' })
  const b = await assinarTokenSso({ segredo, email: 'd@e.com' })
  const ja = JSON.parse(Buffer.from(a.split('.')[1], 'base64url')).jti
  const jb = JSON.parse(Buffer.from(b.split('.')[1], 'base64url')).jti
  assert.notEqual(ja, jb)
})

test('token com outro segredo não valida', async () => {
  const token = await assinarTokenSso({ segredo: 'um-segredo-qualquer-1234567890', email: 'd@e.com' })
  await assert.rejects(jwtVerify(token, new TextEncoder().encode('outro-segredo-1234567890'), {
    issuer: SSO_ISSUER, audience: SSO_AUDIENCE,
  }))
})

test('montarUrlSso codifica token e next', () => {
  const url = montarUrlSso('https://shopfloor.enterplak.com.br/', 'a.b.c', '/embed/fluxo/P/2340%2F26')
  assert.equal(url, 'https://shopfloor.enterplak.com.br/embed/sso?token=a.b.c&next=%2Fembed%2Ffluxo%2FP%2F2340%252F26')
})
```

- [ ] **Step 4: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../api/_lib/sso.js'`

- [ ] **Step 5: Implementar `api/_lib/sso.js`**

```js
import { SignJWT } from 'jose'
import { randomUUID } from 'node:crypto'

export const SSO_ISSUER = 'enterplak-dashboard'
export const SSO_AUDIENCE = 'shopfloor-embed'
export const SSO_TTL_S = 60

/** Só aceita caminho relativo dentro de /embed/ (nunca o próprio /embed/sso). Evita open redirect. */
export function nextValido(next) {
  if (typeof next !== 'string' || next === '' || next.length > 500) return false
  if (!next.startsWith('/embed/') || next.startsWith('/embed/sso')) return false
  if (next.includes('//') || next.includes('\\') || next.includes('..')) return false
  let decodificado
  try { decodificado = decodeURIComponent(next) } catch { return false }
  if (decodificado.includes('..') || decodificado.includes('\\')) return false
  return true
}

export async function assinarTokenSso({ segredo, email, agora = Math.floor(Date.now() / 1000), jti = randomUUID() }) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SSO_ISSUER)
    .setAudience(SSO_AUDIENCE)
    .setJti(jti)
    .setIssuedAt(agora)
    .setExpirationTime(agora + SSO_TTL_S)
    .sign(new TextEncoder().encode(segredo))
}

export function montarUrlSso(base, token, next) {
  return base.replace(/\/+$/, '') + '/embed/sso?token=' + encodeURIComponent(token) + '&next=' + encodeURIComponent(next)
}
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS (6 testes)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .vercelignore api/_lib/sso.js tests/sso.test.js
git commit -m "feat(api): helpers de SSO para o ShopFloor (JWT e validação de next)"
```

---

### Task 2: Autorização do usuário do dashboard

**Files:**
- Create: `api/_lib/auth.js`
- Test: `tests/auth.test.js`

**Interfaces:**
- Produces:
  - `PERMISSAO_FLUXO = 'shopfloor_fluxo'`
  - `extrairBearer(valor: unknown): string | null`
  - `podeVerFluxo(perfil: {role, active} | null, paginas: string[]): boolean`
  - `autorizarUsuario(authorization: string | undefined, { criarCliente: (token) => SupabaseClient }): Promise<{ ok: true, userId: string } | { ok: false, status: 401|403|503, erro: string }>`
  - `criarClienteSupabase(token: string): SupabaseClient` (usa `SUPABASE_URL`, `SUPABASE_ANON_KEY`)

- [ ] **Step 1: Escrever o teste (falhando)**

`tests/auth.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extrairBearer, podeVerFluxo, autorizarUsuario, PERMISSAO_FLUXO } from '../api/_lib/auth.js'

function fakeCliente({ user = { id: 'u1' }, perfil = { role: 'usuario', active: true }, perms = [], erroUser = false, erroPerms = false } = {}) {
  return {
    auth: {
      getUser: async () => (erroUser ? { data: { user: null }, error: { message: 'jwt' } } : { data: { user }, error: null }),
    },
    from(tabela) {
      const q = {
        select() { return q },
        eq() { return q },
        single: async () => (perfil ? { data: perfil, error: null } : { data: null, error: { message: 'nf' } }),
        then(resolve, reject) {
          const r = erroPerms ? { data: null, error: { message: 'x' } } : { data: perms.map((p) => ({ page_id: p })), error: null }
          return Promise.resolve(tabela === 'user_page_permissions' ? r : { data: null, error: null }).then(resolve, reject)
        },
      }
      return q
    },
  }
}

test('extrairBearer', () => {
  assert.equal(extrairBearer('Bearer abc.def'), 'abc.def')
  assert.equal(extrairBearer('bearer   xyz'), 'xyz')
  assert.equal(extrairBearer('Basic abc'), null)
  assert.equal(extrairBearer(undefined), null)
  assert.equal(extrairBearer('Bearer '), null)
})

test('podeVerFluxo', () => {
  assert.equal(PERMISSAO_FLUXO, 'shopfloor_fluxo')
  assert.equal(podeVerFluxo({ role: 'admin', active: true }, []), true)
  assert.equal(podeVerFluxo({ role: 'moderador', active: true }, []), true)
  assert.equal(podeVerFluxo({ role: 'usuario', active: true }, ['shopfloor_fluxo']), true)
  assert.equal(podeVerFluxo({ role: 'usuario', active: true }, ['vendas']), false)
  assert.equal(podeVerFluxo({ role: 'admin', active: false }, []), false)
  assert.equal(podeVerFluxo(null, []), false)
})

test('autorizarUsuario: sem token → 401', async () => {
  const r = await autorizarUsuario(undefined, { criarCliente: () => fakeCliente() })
  assert.deepEqual(r, { ok: false, status: 401, erro: 'Sessão ausente.' })
})

test('autorizarUsuario: sessão inválida → 401', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ erroUser: true }) })
  assert.equal(r.status, 401)
})

test('autorizarUsuario: sem perfil → 403', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perfil: null }) })
  assert.equal(r.status, 403)
})

test('autorizarUsuario: usuario sem a permissão → 403', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perms: ['vendas'] }) })
  assert.deepEqual(r, { ok: false, status: 403, erro: 'Sem permissão para o Fluxo ShopFloor.' })
})

test('autorizarUsuario: usuario com a permissão → ok', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perms: ['shopfloor_fluxo'] }) })
  assert.deepEqual(r, { ok: true, userId: 'u1' })
})

test('autorizarUsuario: admin → ok sem consultar permissões', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perfil: { role: 'admin', active: true }, erroPerms: true }) })
  assert.equal(r.ok, true)
})

test('autorizarUsuario: erro ao ler permissões → 503', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ erroPerms: true }) })
  assert.equal(r.status, 503)
})

test('autorizarUsuario: usuário desativado → 403', async () => {
  const r = await autorizarUsuario('Bearer t', { criarCliente: () => fakeCliente({ perfil: { role: 'admin', active: false } }) })
  assert.equal(r.status, 403)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../api/_lib/auth.js'`

- [ ] **Step 3: Implementar `api/_lib/auth.js`**

```js
import { createClient } from '@supabase/supabase-js'

export const PERMISSAO_FLUXO = 'shopfloor_fluxo'

export function extrairBearer(valor) {
  if (typeof valor !== 'string') return null
  const m = valor.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

export function podeVerFluxo(perfil, paginas) {
  if (!perfil || perfil.active === false) return false
  if (perfil.role === 'admin' || perfil.role === 'moderador') return true
  return Array.isArray(paginas) && paginas.includes(PERMISSAO_FLUXO)
}

/**
 * Confere a sessão do dashboard (Supabase do dashboard) e a permissão do Fluxo.
 * As consultas usam o token do PRÓPRIO usuário: o RLS já permite ler o próprio perfil e
 * as próprias permissões, então nenhuma chave de serviço é necessária.
 */
export async function autorizarUsuario(authorization, { criarCliente }) {
  const token = extrairBearer(authorization)
  if (!token) return { ok: false, status: 401, erro: 'Sessão ausente.' }

  const sb = criarCliente(token)
  const { data: u, error: erroUser } = await sb.auth.getUser(token)
  if (erroUser || !u || !u.user) return { ok: false, status: 401, erro: 'Sessão inválida.' }
  const userId = u.user.id

  const { data: perfil, error: erroPerfil } = await sb.from('profiles').select('role, active').eq('id', userId).single()
  if (erroPerfil || !perfil) return { ok: false, status: 403, erro: 'Perfil não encontrado.' }

  let paginas = []
  if (perfil.role === 'usuario') {
    const { data: perms, error: erroPerms } = await sb.from('user_page_permissions').select('page_id').eq('user_id', userId)
    if (erroPerms) return { ok: false, status: 503, erro: 'Não foi possível verificar as permissões.' }
    paginas = (perms || []).map((p) => p.page_id)
  }

  if (!podeVerFluxo(perfil, paginas)) return { ok: false, status: 403, erro: 'Sem permissão para o Fluxo ShopFloor.' }
  return { ok: true, userId }
}

export function criarClienteSupabase(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos os testes de `sso` e `auth`)

- [ ] **Step 5: Commit**

```bash
git add api/_lib/auth.js tests/auth.test.js
git commit -m "feat(api): autorização do usuário do dashboard para o Fluxo ShopFloor"
```

---

### Task 3: Lista de OPs + handlers das duas funções

**Files:**
- Create: `api/_lib/ops.js`
- Create: `api/_lib/handlers.js`
- Create: `api/shopfloor-ops.js`
- Create: `api/shopfloor-sso.js`
- Test: `tests/ops.test.js`, `tests/handlers.test.js`

**Interfaces:**
- Consumes: `nextValido`, `assinarTokenSso`, `montarUrlSso` (Task 1); `autorizarUsuario`, `criarClienteSupabase` (Task 2)
- Produces:
  - `montarUrlOps(base: string, dias: unknown): string`
  - `normalizarOps(json: unknown): Array<{ pmo, op, cliente, descricao, ultimoBipe: string|null }>`
  - `criarHandlerOps({ autorizar, fetchFn, env }): (req, res) => Promise`
  - `criarHandlerSso({ autorizar, env, assinar? }): (req, res) => Promise`
  - HTTP: `GET /api/shopfloor-ops` → `200 { ops }` | `401/403/405/502/503 { erro }`
  - HTTP: `POST /api/shopfloor-sso` body `{ next }` → `200 { url }` | `400/401/403/405/503 { erro }`

- [ ] **Step 1: Escrever os testes (falhando)**

`tests/ops.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarUrlOps, normalizarOps } from '../api/_lib/ops.js'

test('montarUrlOps com e sem dias', () => {
  assert.equal(montarUrlOps('https://sf.x.com', '30'), 'https://sf.x.com/api/dashboard/ops-ativas?dias=30')
  assert.equal(montarUrlOps('https://sf.x.com/', ''), 'https://sf.x.com/api/dashboard/ops-ativas')
  assert.equal(montarUrlOps('https://sf.x.com', undefined), 'https://sf.x.com/api/dashboard/ops-ativas')
  assert.equal(montarUrlOps('https://sf.x.com', '0'), 'https://sf.x.com/api/dashboard/ops-ativas')
  assert.equal(montarUrlOps('https://sf.x.com', '999'), 'https://sf.x.com/api/dashboard/ops-ativas')
})

test('normalizarOps filtra itens inválidos e completa campos', () => {
  const r = normalizarOps({ ops: [
    { pmo: 'PMOC13', op: '2340/26', cliente: 'VMI', descricao: 'PLACA', ultimoBipe: '2026-10-06T11:42:10Z' },
    { pmo: 'PMOC50', op: '2239/26' },
    { pmo: '', op: 'x' },
    { op: 'sem-pmo' },
    null,
  ] })
  assert.deepEqual(r, [
    { pmo: 'PMOC13', op: '2340/26', cliente: 'VMI', descricao: 'PLACA', ultimoBipe: '2026-10-06T11:42:10Z' },
    { pmo: 'PMOC50', op: '2239/26', cliente: '', descricao: '', ultimoBipe: null },
  ])
  assert.deepEqual(normalizarOps(null), [])
  assert.deepEqual(normalizarOps({ ops: 'x' }), [])
})
```

`tests/handlers.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarHandlerOps, criarHandlerSso } from '../api/_lib/handlers.js'

function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: undefined }
  r.setHeader = (k, v) => { r.headers[k] = v }
  r.status = (c) => { r.statusCode = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}
const autorizado = async () => ({ ok: true, userId: 'u1' })
const negado = async () => ({ ok: false, status: 403, erro: 'Sem permissão para o Fluxo ShopFloor.' })
const env = {
  SHOPFLOOR_URL: 'https://shopfloor.enterplak.com.br',
  DASHBOARD_API_SECRET: 'api-secret',
  DASHBOARD_SSO_SECRET: 'sso-secret',
  SHOPFLOOR_OPS_DIAS: '30',
}

test('ops: repassa a lista normalizada e usa o segredo', async () => {
  let chamada
  const fetchFn = async (url, opts) => {
    chamada = { url, opts }
    return { ok: true, status: 200, json: async () => ({ ops: [{ pmo: 'P', op: '1/26' }] }) }
  }
  const res = fakeRes()
  await criarHandlerOps({ autorizar: autorizado, fetchFn, env })({ method: 'GET', headers: { authorization: 'Bearer t' } }, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { ops: [{ pmo: 'P', op: '1/26', cliente: '', descricao: '', ultimoBipe: null }] })
  assert.equal(chamada.url, 'https://shopfloor.enterplak.com.br/api/dashboard/ops-ativas?dias=30')
  assert.equal(chamada.opts.headers.Authorization, 'Bearer api-secret')
  assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('ops: sem permissão → status do autorizador, sem chamar o ShopFloor', async () => {
  let chamou = false
  const res = fakeRes()
  await criarHandlerOps({ autorizar: negado, fetchFn: async () => { chamou = true }, env })({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 403)
  assert.equal(chamou, false)
})

test('ops: método errado → 405', async () => {
  const res = fakeRes()
  await criarHandlerOps({ autorizar: autorizado, fetchFn: async () => {}, env })({ method: 'POST', headers: {} }, res)
  assert.equal(res.statusCode, 405)
})

test('ops: ShopFloor com erro HTTP → 502', async () => {
  const res = fakeRes()
  const fetchFn = async () => ({ ok: false, status: 500, json: async () => ({}) })
  await criarHandlerOps({ autorizar: autorizado, fetchFn, env })({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 502)
})

test('ops: ShopFloor fora do ar → 502', async () => {
  const res = fakeRes()
  const fetchFn = async () => { throw new Error('ECONNREFUSED') }
  await criarHandlerOps({ autorizar: autorizado, fetchFn, env })({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 502)
})

test('ops: integração não configurada → 503', async () => {
  const res = fakeRes()
  await criarHandlerOps({ autorizar: autorizado, fetchFn: async () => {}, env: {} })({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 503)
})

test('sso: devolve a URL de SSO com o token assinado', async () => {
  let args
  const assinar = async (a) => { args = a; return 'tok.en.x' }
  const res = fakeRes()
  await criarHandlerSso({ autorizar: autorizado, env, assinar })(
    { method: 'POST', headers: { authorization: 'Bearer t' }, body: { next: '/embed/fluxo/P/1%2F26' } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.url, 'https://shopfloor.enterplak.com.br/embed/sso?token=tok.en.x&next=%2Fembed%2Ffluxo%2FP%2F1%252F26')
  assert.deepEqual(args, { segredo: 'sso-secret', email: 'dashboard@enterplak.com.br' })
})

test('sso: usa DASHBOARD_SSO_EMAIL quando definido', async () => {
  let args
  const res = fakeRes()
  await criarHandlerSso({ autorizar: autorizado, env: { ...env, DASHBOARD_SSO_EMAIL: 'outra@enterplak.com.br' }, assinar: async (a) => { args = a; return 't' } })(
    { method: 'POST', headers: {}, body: { next: '/embed/fluxo/P/1' } }, res)
  assert.equal(args.email, 'outra@enterplak.com.br')
})

test('sso: next inválido → 400', async () => {
  const res = fakeRes()
  await criarHandlerSso({ autorizar: autorizado, env, assinar: async () => 't' })(
    { method: 'POST', headers: {}, body: { next: 'https://evil.com' } }, res)
  assert.equal(res.statusCode, 400)
})

test('sso: sem permissão → 403 e não assina', async () => {
  let assinou = false
  const res = fakeRes()
  await criarHandlerSso({ autorizar: negado, env, assinar: async () => { assinou = true; return 't' } })(
    { method: 'POST', headers: {}, body: { next: '/embed/fluxo/P/1' } }, res)
  assert.equal(res.statusCode, 403)
  assert.equal(assinou, false)
})

test('sso: método errado → 405; não configurado → 503', async () => {
  const r1 = fakeRes()
  await criarHandlerSso({ autorizar: autorizado, env, assinar: async () => 't' })({ method: 'GET', headers: {} }, r1)
  assert.equal(r1.statusCode, 405)
  const r2 = fakeRes()
  await criarHandlerSso({ autorizar: autorizado, env: {}, assinar: async () => 't' })(
    { method: 'POST', headers: {}, body: { next: '/embed/fluxo/P/1' } }, r2)
  assert.equal(r2.statusCode, 503)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `Cannot find module '.../api/_lib/ops.js'` e `handlers.js`

- [ ] **Step 3: Implementar `api/_lib/ops.js`**

```js
export function montarUrlOps(base, dias) {
  const url = new URL('/api/dashboard/ops-ativas', base)
  const n = Number.parseInt(dias, 10)
  if (Number.isInteger(n) && n >= 1 && n <= 365) url.searchParams.set('dias', String(n))
  return url.toString()
}

const texto = (v) => (typeof v === 'string' ? v : '')

export function normalizarOps(json) {
  const lista = json && Array.isArray(json.ops) ? json.ops : []
  return lista
    .filter((o) => o && typeof o.pmo === 'string' && o.pmo !== '' && typeof o.op === 'string' && o.op !== '')
    .map((o) => ({
      pmo: o.pmo,
      op: o.op,
      cliente: texto(o.cliente),
      descricao: texto(o.descricao),
      ultimoBipe: typeof o.ultimoBipe === 'string' ? o.ultimoBipe : null,
    }))
}
```

- [ ] **Step 4: Implementar `api/_lib/handlers.js`**

```js
import { montarUrlOps, normalizarOps } from './ops.js'
import { nextValido, assinarTokenSso, montarUrlSso } from './sso.js'

const EMAIL_PADRAO = 'dashboard@enterplak.com.br'

export function criarHandlerOps({ autorizar, fetchFn, env }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' })

    const a = await autorizar(req.headers.authorization)
    if (!a.ok) return res.status(a.status).json({ erro: a.erro })

    if (!env.SHOPFLOOR_URL || !env.DASHBOARD_API_SECRET) {
      return res.status(503).json({ erro: 'Integração com o ShopFloor não configurada.' })
    }

    try {
      const r = await fetchFn(montarUrlOps(env.SHOPFLOOR_URL, env.SHOPFLOOR_OPS_DIAS), {
        headers: { Authorization: 'Bearer ' + env.DASHBOARD_API_SECRET },
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) return res.status(502).json({ erro: 'ShopFloor respondeu ' + r.status + '.' })
      return res.status(200).json({ ops: normalizarOps(await r.json()) })
    } catch (e) {
      return res.status(502).json({ erro: 'ShopFloor indisponível.' })
    }
  }
}

export function criarHandlerSso({ autorizar, env, assinar = assinarTokenSso }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' })

    const a = await autorizar(req.headers.authorization)
    if (!a.ok) return res.status(a.status).json({ erro: a.erro })

    if (!env.SHOPFLOOR_URL || !env.DASHBOARD_SSO_SECRET) {
      return res.status(503).json({ erro: 'Integração com o ShopFloor não configurada.' })
    }

    const next = req.body && req.body.next
    if (!nextValido(next)) return res.status(400).json({ erro: 'Destino inválido.' })

    const token = await assinar({ segredo: env.DASHBOARD_SSO_SECRET, email: env.DASHBOARD_SSO_EMAIL || EMAIL_PADRAO })
    return res.status(200).json({ url: montarUrlSso(env.SHOPFLOOR_URL, token, next) })
  }
}
```

- [ ] **Step 5: Ligar às dependências reais**

`api/shopfloor-ops.js`:

```js
import { criarHandlerOps } from './_lib/handlers.js'
import { autorizarUsuario, criarClienteSupabase } from './_lib/auth.js'

export default criarHandlerOps({
  autorizar: (authorization) => autorizarUsuario(authorization, { criarCliente: criarClienteSupabase }),
  fetchFn: fetch,
  env: process.env,
})
```

`api/shopfloor-sso.js`:

```js
import { criarHandlerSso } from './_lib/handlers.js'
import { autorizarUsuario, criarClienteSupabase } from './_lib/auth.js'

export default criarHandlerSso({
  autorizar: (authorization) => autorizarUsuario(authorization, { criarCliente: criarClienteSupabase }),
  env: process.env,
})
```

- [ ] **Step 6: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos)

Run: `node -e "import('./api/shopfloor-ops.js').then(m=>console.log(typeof m.default)); import('./api/shopfloor-sso.js').then(m=>console.log(typeof m.default))"`
Expected: `function` duas vezes

- [ ] **Step 7: Commit**

```bash
git add api/ tests/ops.test.js tests/handlers.test.js
git commit -m "feat(api): funções shopfloor-ops e shopfloor-sso"
```

---

### Task 4: Helpers do front (`shopfloor-tabs.js`)

**Files:**
- Create: `shopfloor-tabs.js`
- Test: `tests/shopfloor-tabs.test.js`

**Interfaces:**
- Produces (em `window.SF`):
  - `opPageId(op): string` — `'op:' + enc(pmo) + ':' + enc(op)` (enc também codifica `' ( ) * ! ~`)
  - `isOpPageId(id): boolean`
  - `acharOp(ops, id): op | null`
  - `opLabel(op): string` — `'OP ' + op.op`
  - `opTitle(op): string` — `cliente — descricao` (ignora vazios)
  - `embedPath(op): string` — `'/embed/fluxo/' + enc(pmo) + '/' + enc(op)`
  - `escapeHtml(s): string`
  - `mesmasOps(a, b): boolean` — compara pmo/op/cliente/descricao em ordem
  - `decidirAcao(msg, estado: { ssoTentado }): { acao: 'pronto'|'sso'|'erro'|'ignorar', codigo? }`
  - `mensagemErro(codigo): string`

- [ ] **Step 1: Escrever o teste (falhando)**

`tests/shopfloor-tabs.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(readFileSync(new URL('../shopfloor-tabs.js', import.meta.url), 'utf8'), ctx)
const SF = ctx.window.SF
const plain = (x) => JSON.parse(JSON.stringify(x))

const op = { pmo: 'PMOC13', op: '2340/26', cliente: 'VMI', descricao: 'PLACA MONTADA' }

test('ids e caminhos', () => {
  assert.equal(SF.opPageId(op), 'op:PMOC13:2340%2F26')
  assert.equal(SF.opPageId({ pmo: "A'B", op: 'x(1)' }), 'op:A%27B:x%281%29')
  assert.equal(SF.isOpPageId('op:PMOC13:2340%2F26'), true)
  assert.equal(SF.isOpPageId('dashboard'), false)
  assert.equal(SF.isOpPageId(undefined), false)
  assert.equal(SF.embedPath(op), '/embed/fluxo/PMOC13/2340%2F26')
})

test('acharOp', () => {
  assert.deepEqual(plain(SF.acharOp([op], 'op:PMOC13:2340%2F26')), op)
  assert.equal(SF.acharOp([op], 'op:X:Y'), null)
})

test('rótulo e tooltip', () => {
  assert.equal(SF.opLabel(op), 'OP 2340/26')
  assert.equal(SF.opTitle(op), 'VMI — PLACA MONTADA')
  assert.equal(SF.opTitle({ pmo: 'P', op: '1', cliente: '', descricao: 'D' }), 'D')
})

test('escapeHtml', () => {
  assert.equal(SF.escapeHtml('<b a="1">\'&'), '&lt;b a=&quot;1&quot;&gt;&#39;&amp;')
  assert.equal(SF.escapeHtml(null), '')
})

test('mesmasOps', () => {
  assert.equal(SF.mesmasOps([op], [{ ...op }]), true)
  assert.equal(SF.mesmasOps([op], []), false)
  assert.equal(SF.mesmasOps([op], [{ ...op, descricao: 'outra' }]), false)
})

test('decidirAcao', () => {
  assert.deepEqual(plain(SF.decidirAcao({ type: 'sf-embed:ready' }, { ssoTentado: false })), { acao: 'pronto' })
  assert.deepEqual(plain(SF.decidirAcao({ type: 'sf-embed:login-required' }, { ssoTentado: false })), { acao: 'sso' })
  assert.deepEqual(plain(SF.decidirAcao({ type: 'sf-embed:login-required' }, { ssoTentado: true })), { acao: 'erro', codigo: 'sso-falhou' })
  assert.deepEqual(plain(SF.decidirAcao({ type: 'sf-embed:error', code: 'inactive' }, { ssoTentado: false })), { acao: 'erro', codigo: 'inactive' })
  assert.deepEqual(plain(SF.decidirAcao({ type: 'sf-embed:error' }, { ssoTentado: false })), { acao: 'erro', codigo: 'desconhecido' })
  assert.deepEqual(plain(SF.decidirAcao({ type: 'outra' }, {})), { acao: 'ignorar' })
  assert.deepEqual(plain(SF.decidirAcao('texto', {})), { acao: 'ignorar' })
})

test('mensagemErro', () => {
  assert.equal(SF.mensagemErro('inactive'), 'Acesso ao ShopFloor desativado. Fale com o administrador.')
  assert.equal(SF.mensagemErro('forbidden'), 'Acesso ao ShopFloor desativado. Fale com o administrador.')
  assert.equal(SF.mensagemErro('op-not-found'), 'OP não encontrada no ShopFloor.')
  assert.equal(SF.mensagemErro('timeout'), 'Não foi possível carregar o fluxo da OP.')
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test`
Expected: FAIL — `ENOENT ... shopfloor-tabs.js`

- [ ] **Step 3: Implementar `shopfloor-tabs.js`**

```js
// Helpers puros das abas de OP do ShopFloor (sem DOM). Usados pelo index.html via window.SF.
(function (global) {
    var PREFIXO = 'op:';

    // encodeURIComponent deixa ' ( ) * ! ~ passarem; o id vai dentro de onclick="switchPage('...')".
    function enc(s) {
        return encodeURIComponent(String(s)).replace(/['()*!~]/g, function (c) {
            return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
    }

    function opPageId(op) { return PREFIXO + enc(op.pmo) + ':' + enc(op.op); }
    function isOpPageId(id) { return typeof id === 'string' && id.indexOf(PREFIXO) === 0; }

    function acharOp(ops, id) {
        for (var i = 0; i < (ops || []).length; i++) {
            if (opPageId(ops[i]) === id) return ops[i];
        }
        return null;
    }

    function opLabel(op) { return 'OP ' + op.op; }
    function opTitle(op) { return [op.cliente, op.descricao].filter(Boolean).join(' — '); }
    function embedPath(op) { return '/embed/fluxo/' + enc(op.pmo) + '/' + enc(op.op); }

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function mesmasOps(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var i = 0; i < a.length; i++) {
            if (a[i].pmo !== b[i].pmo || a[i].op !== b[i].op ||
                a[i].cliente !== b[i].cliente || a[i].descricao !== b[i].descricao) return false;
        }
        return true;
    }

    function decidirAcao(msg, estado) {
        if (!msg || typeof msg.type !== 'string') return { acao: 'ignorar' };
        if (msg.type === 'sf-embed:ready') return { acao: 'pronto' };
        if (msg.type === 'sf-embed:login-required') {
            // Uma tentativa de SSO por carga: se o ShopFloor pedir login de novo, é falha, não loop.
            return estado && estado.ssoTentado ? { acao: 'erro', codigo: 'sso-falhou' } : { acao: 'sso' };
        }
        if (msg.type === 'sf-embed:error') return { acao: 'erro', codigo: msg.code || 'desconhecido' };
        return { acao: 'ignorar' };
    }

    function mensagemErro(codigo) {
        if (codigo === 'inactive' || codigo === 'forbidden') return 'Acesso ao ShopFloor desativado. Fale com o administrador.';
        if (codigo === 'op-not-found') return 'OP não encontrada no ShopFloor.';
        return 'Não foi possível carregar o fluxo da OP.';
    }

    global.SF = {
        opPageId: opPageId, isOpPageId: isOpPageId, acharOp: acharOp,
        opLabel: opLabel, opTitle: opTitle, embedPath: embedPath,
        escapeHtml: escapeHtml, mesmasOps: mesmasOps,
        decidirAcao: decidirAcao, mensagemErro: mensagemErro
    };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test`
Expected: PASS (todos)

- [ ] **Step 5: Commit**

```bash
git add shopfloor-tabs.js tests/shopfloor-tabs.test.js
git commit -m "feat: helpers puros das abas de OP do ShopFloor"
```

---

### Task 5: Abas de OP e iframe no `index.html`

**Files:**
- Modify: `index.html` (pontos abaixo; as linhas são as atuais e mudam conforme as edições — localizar pelo trecho citado)

**Interfaces:**
- Consumes: `window.SF` (Task 4); `GET /api/shopfloor-ops`, `POST /api/shopfloor-sso` (Task 3)
- Produces (globais no `index.html`): `shopfloorOps`, `sfFrame`, `loadShopfloorOps()`, `sfMountOp(op)`, `sfUnmountOp()`, `sfShowError(codigo)`, `window.sfRetry()`

- [ ] **Step 1: Incluir o script**

Logo após `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>` (linha 10):

```html
    <script src="shopfloor-tabs.js"></script>
```

- [ ] **Step 2: CSS**

Logo após `.page-content.active { display: block; }` (linha 845):

```css
        /* Abas de OP do ShopFloor (iframe do Fluxo) */
        #page-shopfloor-op .sf-op-wrap { position: relative; width: 100%; height: calc(100vh - 150px); }
        .sf-op-frame { width: 100%; height: 100%; border: 0; border-radius: 16px; background: var(--card); }
        .sf-op-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 15px; pointer-events: none; }
        .sf-op-status.hidden { display: none; }
        .sf-op-erro { padding: 48px 16px; text-align: center; color: var(--text); }
        .sf-op-erro p { margin-bottom: 16px; font-size: 16px; }
        body.fs-mode #page-shopfloor-op .sf-op-wrap { position: fixed; inset: 0; height: 100vh; z-index: 1; }
```

- [ ] **Step 3: Contêiner da página**

Logo após `<div id="customPagesContainer"></div>` (linha 2524):

```html
<!-- Aba de OP do ShopFloor: um único contêiner, o iframe é trocado conforme a OP -->
<div class="page-content" id="page-shopfloor-op"></div>
```

- [ ] **Step 4: Estado global**

Logo após `var allowedPageIds = null; ...` (linha 2610):

```js
var shopfloorOps = [];         // OPs ativas do ShopFloor (abas dinâmicas), vindas de /api/shopfloor-ops
// Iframe da aba de OP aberta. Declarado aqui (e não na seção ShopFloor) porque switchPage o lê.
var sfFrame = { el: null, opId: null, op: null, ssoTentado: false, timer: null };
```

- [ ] **Step 5: Permissão por aba de OP**

Em `canSeePage`, logo após `if (!currentProfile) return false;`:

```js
    // Aba de OP do ShopFloor: exige a permissão do Fluxo E que a OP ainda esteja na lista
    if (SF.isOpPageId(pageId)) return canSeePage('shopfloor_fluxo') && !!SF.acharOp(shopfloorOps, pageId);
```

- [ ] **Step 6: Ordem das abas (rotação e setas)**

Em `getPageIds`, substituir:

```js
    customPages.forEach(function(p) {
        if (canSeePage(p.id)) ids.push(p.id);
    });
    return ids;
```

por:

```js
    shopfloorOps.forEach(function(op) {
        var id = SF.opPageId(op);
        if (canSeePage(id)) ids.push(id);
    });
    customPages.forEach(function(p) {
        if (canSeePage(p.id)) ids.push(p.id);
    });
    return ids;
```

- [ ] **Step 7: Renderizar as abas**

Em `renderPageTabs`, logo após a linha `var html = fixedTab('dashboard') + ... + fixedTab('marketing_pago');`:

```js
    shopfloorOps.forEach(function(op) {
        var id = SF.opPageId(op);
        if (!canSeePage(id)) return;
        html += '<button class="ptab' + (activePage === id ? ' active' : '') +
            '" onclick="switchPage(\'' + id + '\')" title="' + SF.escapeHtml(SF.opTitle(op)) + '">' +
            SF.escapeHtml(SF.opLabel(op)) + '</button>';
    });
```

- [ ] **Step 8: `switchPage`**

Logo após `document.querySelectorAll('.custom-page-wrapper').forEach(function(el) { el.classList.remove('active'); });`:

```js
    var pgSf = document.getElementById('page-shopfloor-op');
    if (pgSf) pgSf.classList.remove('active');
    // Saiu da aba de OP: descarta o iframe (não deixa o Fluxo consultando o ShopFloor em segundo plano)
    if (!SF.isOpPageId(pageId) && sfFrame.opId) sfUnmountOp();
```

E substituir o início do bloco final:

```js
    } else {
        var el = document.getElementById('page-' + pageId);
```

por:

```js
    } else if (SF.isOpPageId(pageId)) {
        if (pgSf) pgSf.classList.add('active');
        var opSel = SF.acharOp(shopfloorOps, pageId);
        if (opSel && sfFrame.opId !== pageId) sfMountOp(opSel);
    } else {
        var el = document.getElementById('page-' + pageId);
```

- [ ] **Step 9: Botão "Atualizar"**

Em `window.refreshPaginaAtiva`, logo antes de `} else if (activePage && activePage.indexOf('p_') === 0) {`:

```js
        } else if (SF.isOpPageId(activePage)) {
            await loadShopfloorOps();
            if (sfFrame.op && activePage === sfFrame.opId) sfMountOp(sfFrame.op);
```

- [ ] **Step 10: Seção ShopFloor (carga das OPs, iframe, mensagens)**

Logo após `setInterval(syncPagesFromAPI, 5 * 60 * 1000);`:

```js
// ============================================
// === ABAS DE OP DO SHOPFLOOR (Fluxo embutido)
// ============================================
// Cada OP ativa vira uma aba. A lista e o SSO passam pelas funções da Vercel
// (/api/shopfloor-ops e /api/shopfloor-sso), que conferem login + permissão
// 'shopfloor_fluxo' e guardam os segredos. Um iframe por vez.
var SHOPFLOOR_ORIGIN = 'https://shopfloor.enterplak.com.br';
var SF_TIMEOUT_MS = 20000;

async function sfAuthHeaders() {
    var { data: { session } } = await supabase.auth.getSession();
    return session ? { 'Authorization': 'Bearer ' + session.access_token } : null;
}

async function loadShopfloorOps() {
    if (!canSeePage('shopfloor_fluxo')) return;
    try {
        var headers = await sfAuthHeaders();
        if (!headers) return;
        var resp = await fetch('/api/shopfloor-ops', { headers: headers, cache: 'no-store' });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var json = await resp.json();
        var novas = Array.isArray(json.ops) ? json.ops : [];
        if (SF.mesmasOps(shopfloorOps, novas)) return;
        shopfloorOps = novas;
        renderPageTabs();
        // A OP aberta foi finalizada: switchPage cai na primeira aba permitida
        if (SF.isOpPageId(activePage) && !SF.acharOp(shopfloorOps, activePage)) switchPage(activePage);
    } catch (e) {
        console.warn('Falha ao carregar OPs do ShopFloor:', e.message);
    }
}

function sfUnmountOp() {
    if (sfFrame.timer) clearTimeout(sfFrame.timer);
    var page = document.getElementById('page-shopfloor-op');
    if (page) page.innerHTML = '';
    sfFrame = { el: null, opId: null, op: null, ssoTentado: false, timer: null };
}

function sfMountOp(op) {
    sfUnmountOp();
    var page = document.getElementById('page-shopfloor-op');
    page.innerHTML = '<div class="sf-op-wrap"><div class="sf-op-status" id="sfOpStatus">Carregando fluxo da OP...</div></div>';
    var iframe = document.createElement('iframe');
    iframe.className = 'sf-op-frame';
    iframe.title = SF.opLabel(op);
    iframe.setAttribute('allow', 'fullscreen');
    iframe.src = SHOPFLOOR_ORIGIN + SF.embedPath(op);
    page.querySelector('.sf-op-wrap').appendChild(iframe);
    sfFrame = {
        el: iframe, opId: SF.opPageId(op), op: op, ssoTentado: false,
        timer: setTimeout(function() { sfShowError('timeout'); }, SF_TIMEOUT_MS)
    };
}

function sfShowError(codigo) {
    if (sfFrame.timer) { clearTimeout(sfFrame.timer); sfFrame.timer = null; }
    sfFrame.el = null; // mantém op/opId para o "Tentar novamente"
    var page = document.getElementById('page-shopfloor-op');
    if (!page) return;
    page.innerHTML = '<div class="sf-op-erro"><p>' + SF.escapeHtml(SF.mensagemErro(codigo)) + '</p>' +
        '<button class="btn-refresh" onclick="sfRetry()">Tentar novamente</button></div>';
}

window.sfRetry = function() {
    if (sfFrame.op) sfMountOp(sfFrame.op);
};

async function sfFazerSso(alvo) {
    alvo.ssoTentado = true;
    try {
        var headers = await sfAuthHeaders();
        if (!headers) throw new Error('sem sessão');
        headers['Content-Type'] = 'application/json';
        var resp = await fetch('/api/shopfloor-sso', {
            method: 'POST', headers: headers, cache: 'no-store',
            body: JSON.stringify({ next: SF.embedPath(alvo.op) })
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        var json = await resp.json();
        // O usuário pode ter trocado de aba enquanto esperava
        if (sfFrame === alvo && alvo.el) alvo.el.src = json.url;
    } catch (e) {
        console.warn('SSO do ShopFloor falhou:', e.message);
        if (sfFrame === alvo) sfShowError(e.message === 'HTTP 403' ? 'forbidden' : 'sso-falhou');
    }
}

window.addEventListener('message', function(ev) {
    if (ev.origin !== SHOPFLOOR_ORIGIN) return;
    if (!sfFrame.el || ev.source !== sfFrame.el.contentWindow) return;
    var d = SF.decidirAcao(ev.data, sfFrame);
    if (d.acao === 'pronto') {
        if (sfFrame.timer) { clearTimeout(sfFrame.timer); sfFrame.timer = null; }
        var st = document.getElementById('sfOpStatus');
        if (st) st.classList.add('hidden');
    } else if (d.acao === 'sso') {
        sfFazerSso(sfFrame);
    } else if (d.acao === 'erro') {
        sfShowError(d.codigo);
    }
});

setInterval(loadShopfloorOps, 5 * 60 * 1000);
```

- [ ] **Step 11: Carregar no início**

Em `bootApp`, logo após `await initPages();`:

```js
    loadShopfloorOps(); // abas de OP do ShopFloor (não bloqueia o resto)
```

- [ ] **Step 12: Verificar sintaxe**

Run:

```bash
node -e '
const fs=require("fs");const h=fs.readFileSync("index.html","utf8");
const blocos=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
fs.writeFileSync(process.env.TMPDIR+"/inline.js",blocos.join("\n;\n"));
console.log("blocos:",blocos.length);' && node --check "$TMPDIR/inline.js" && echo SINTAXE-OK
```

(use o diretório de scratchpad da sessão como `TMPDIR`)
Expected: `SINTAXE-OK`

- [ ] **Step 13: Teste manual local (regressão + UI das abas)**

Run: `python3 -m http.server 8765` e abrir `http://localhost:8765`.
- Logar como admin. Todas as abas atuais funcionam; console mostra `Falha ao carregar OPs do ShopFloor: HTTP 404` (esperado: não há `/api` no servidor estático) e nenhuma aba de OP aparece.
- No console do navegador:

```js
shopfloorOps = [{ pmo: 'PMOC13', op: '2340/26', cliente: 'VMI', descricao: 'PLACA <b>teste</b>' }]; renderPageTabs();
```

Expected: aba `OP 2340/26` depois das fixas e antes das de imagem; tooltip mostra `VMI — PLACA <b>teste</b>` como texto. Clicar: aparece "Carregando fluxo da OP..."; após 20 s, card "Não foi possível carregar o fluxo da OP." com **Tentar novamente**. Trocar para Compras e voltar funciona; rotação automática passa pela aba de OP.

- [ ] **Step 14: Commit**

```bash
git add index.html
git commit -m "feat: abas de OP do ShopFloor com o Fluxo embutido"
```

---

### Task 6: Configuração e publicação (com o usuário)

Passos manuais; o agente prepara e confere, o usuário executa nos painéis.

- [ ] **Step 1: Permissão no Supabase do dashboard** (SQL Editor, projeto `hmkqqxyahevautnmbbdu`)

```sql
insert into public.pages (id, name, type, order_idx)
values ('shopfloor_fluxo', 'Fluxo ShopFloor (OPs)', 'fixed', 70)
on conflict (id) do nothing;
```

Conferir: painel Admin → "Criar Novo Usuário" lista o checkbox **Fluxo ShopFloor (OPs)**; nenhuma aba nova aparece por isso.

- [ ] **Step 2: Gerar os segredos**

Run (duas vezes): `openssl rand -base64 48`
Um vira `DASHBOARD_SSO_SECRET`, o outro `DASHBOARD_API_SECRET`. Entregar à equipe do ShopFloor por canal privado (não por e-mail aberto nem git).

- [ ] **Step 3: Variáveis de ambiente na Vercel** (Project → Settings → Environment Variables, Production e Preview)

| Nome | Valor |
|---|---|
| `SHOPFLOOR_URL` | `https://shopfloor.enterplak.com.br` |
| `DASHBOARD_SSO_SECRET` | segredo 1 |
| `DASHBOARD_API_SECRET` | segredo 2 |
| `DASHBOARD_SSO_EMAIL` | `dashboard@enterplak.com.br` |
| `SHOPFLOOR_OPS_DIAS` | `30` |
| `SUPABASE_URL` | `https://hmkqqxyahevautnmbbdu.supabase.co` |
| `SUPABASE_ANON_KEY` | a anon key (a mesma do `index.html`) |

- [ ] **Step 4: Domínio**

Vercel → Project → Settings → Domains → Add `dashboard.enterplak.com.br`. Criar no DNS de `enterplak.com.br` o registro que a Vercel indicar (CNAME `dashboard` → valor mostrado). Esperar o certificado ficar válido.

Run: `curl -sI https://dashboard.enterplak.com.br/ | head -1`
Expected: `HTTP/2 200`

- [ ] **Step 5: Push e conferência das funções**

```bash
npm test && git push
```

Após o deploy:

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://dashboard.enterplak.com.br/api/shopfloor-ops`
Expected: `401`

Run: `curl -s -o /dev/null -w '%{http_code}\n' https://dashboard.enterplak.com.br/tests/sso.test.js`
Expected: `404`

---

### Task 7: Smoke de ponta a ponta (depois do ShopFloor pronto)

Depende da Parte A do spec publicada no ShopFloor (Dev ou Produção). Executar em `https://dashboard.enterplak.com.br`.

- [ ] Usuário com `shopfloor_fluxo` vê uma aba por OP ativa com bipe ≤ 30 dias; usuário sem a permissão não vê nenhuma (e `/api/shopfloor-ops` responde 403 para ele).
- [ ] Abrir a aba mostra o Fluxo real da OP, sem menu do ShopFloor e sem seletor de OP.
- [ ] Supervisor logado no ShopFloor com a própria conta em outra aba continua logado como ele após abrir OPs no dashboard.
- [ ] Rotação automática passa pelas abas de OP; setas funcionam fora do iframe.
- [ ] Modo TV do ShopFloor abre em tela cheia dentro do dashboard.
- [ ] Finalizar uma OP no ShopFloor → a aba some em até 5 min.
- [ ] ShopFloor fora do ar (ou URL errada no env) → card de erro com "Tentar novamente"; resto do dashboard funciona.
- [ ] `/embed/fluxo/...` embutido a partir de outro site é bloqueado (`frame-ancestors`).
- [ ] Token de SSO reutilizado → recusado pelo ShopFloor.
- [ ] Liberar a permissão **Fluxo ShopFloor (OPs)** para os usuários que devem ver.
