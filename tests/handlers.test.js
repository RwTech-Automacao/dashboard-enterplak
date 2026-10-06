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
