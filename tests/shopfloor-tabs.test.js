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
