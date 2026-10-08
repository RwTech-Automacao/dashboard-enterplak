import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarHandlerOps, criarHandlerSso, criarHandlerFaturamento } from '../api/_lib/handlers.js'

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

test('ops: repassa a lista normalizada e usa o segredo', async () => {
  let chamada
  const fetchFn = async (url, opts) => {
    chamada = { url, opts }
    return { ok: true, status: 200, json: async () => ({ ops: [{ pmo: 'P', op: '1/26' }] }) }
  }
  const res = fakeRes()
  await criarHandlerOps({ autorizar: autorizado, fetchFn, env })({ method: 'GET', headers: { authorization: 'Bearer t' } }, res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body, { origin: 'https://shopfloor.enterplak.com.br', ops: [{ pmo: 'P', op: '1/26', cliente: '', descricao: '', ultimoBipe: null }] })
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
  const oldError = console.error
  console.error = () => {}
  try {
    await criarHandlerOps({ autorizar: autorizado, fetchFn, env })({ method: 'GET', headers: {} }, res)
  } finally {
    console.error = oldError
  }
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

test('ops: autorizar lança erro → 503 com mensagem de sessão', async () => {
  const res = fakeRes()
  const autorizar = async () => { throw new Error('SUPABASE_URL not set') }
  let fetchChamou = false
  const fetchFn = async () => { fetchChamou = true; return { ok: true } }
  const oldError = console.error
  console.error = () => {}
  try {
    await criarHandlerOps({ autorizar, fetchFn, env })({ method: 'GET', headers: {} }, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.erro, 'Não foi possível verificar a sessão agora.')
    assert.equal(fetchChamou, false)
  } finally {
    console.error = oldError
  }
})

test('sso: autorizar lança erro → 503 com mensagem de sessão', async () => {
  const res = fakeRes()
  const autorizar = async () => { throw new Error('network error') }
  let assinouChamou = false
  const assinar = async () => { assinouChamou = true; return 't' }
  const oldError = console.error
  console.error = () => {}
  try {
    await criarHandlerSso({ autorizar, env, assinar })({ method: 'POST', headers: {}, body: { next: '/embed/fluxo/P/1' } }, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.erro, 'Não foi possível verificar a sessão agora.')
    assert.equal(assinouChamou, false)
  } finally {
    console.error = oldError
  }
})

test('sso: assinar lança erro → 503 com mensagem de acesso', async () => {
  const res = fakeRes()
  const assinar = async () => { throw new Error('key derivation failed') }
  const oldError = console.error
  console.error = () => {}
  try {
    await criarHandlerSso({ autorizar: autorizado, env, assinar })(
      { method: 'POST', headers: {}, body: { next: '/embed/fluxo/P/1' } }, res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.body.erro, 'Não foi possível gerar o acesso ao ShopFloor agora.')
  } finally {
    console.error = oldError
  }
})
