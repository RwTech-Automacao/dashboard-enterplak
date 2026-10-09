import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jwtVerify } from 'jose'
import { nextValido, assinarTokenSso, montarUrlSso, SSO_ISSUER, SSO_AUDIENCE, SSO_TTL_S } from '../api/_lib/sso.js'

test('nextValido aceita caminhos /embed/ e codificação da OP', () => {
  assert.equal(nextValido('/embed/fluxo/PMOC13/2340%2F26'), true)
  assert.equal(nextValido('/embed/fluxo/x/y'), true)
  assert.equal(nextValido('/embed/fluxo/PMOG14/8559?modo=tv'), true)
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
