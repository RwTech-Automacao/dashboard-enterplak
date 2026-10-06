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
