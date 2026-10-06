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
