import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const ctx = { window: {} }
vm.createContext(ctx)
vm.runInContext(readFileSync(new URL('../almoxarifado-ano.js', import.meta.url), 'utf8'), ctx)
const ALM = ctx.window.ALM
const plain = (x) => JSON.parse(JSON.stringify(x))

test('mesesDoAno vai de janeiro até o mês de hoje, com o último mês cortado em hoje', () => {
  const m = plain(ALM.mesesDoAno('2026-10-15'))
  assert.equal(m.length, 10)
  assert.deepEqual(m[0], { mes: '2026-01', inicio: '2026-01-01', fim: '2026-01-31' })
  assert.deepEqual(m[1], { mes: '2026-02', inicio: '2026-02-01', fim: '2026-02-28' })
  assert.deepEqual(m[9], { mes: '2026-10', inicio: '2026-10-01', fim: '2026-10-15' })
})

test('mesesDoAno em janeiro e em ano bissexto', () => {
  assert.deepEqual(plain(ALM.mesesDoAno('2027-01-03')), [{ mes: '2027-01', inicio: '2027-01-01', fim: '2027-01-03' }])
  assert.equal(plain(ALM.mesesDoAno('2028-03-01'))[1].fim, '2028-02-29')
})

test('rotuloMes', () => {
  assert.equal(ALM.rotuloMes('2026-01'), 'jan/26')
  assert.equal(ALM.rotuloMes('2026-12'), 'dez/26')
})

test('pontoMensal monta o ponto do gráfico a partir do resumo do mês', () => {
  const current = {
    itens: { contados: 140, divPositiva: 3, divNegativa: 2, acuracidadePct: 96.4 },
    pecas: { divPositiva: 10, divNegativa: 4, acuracidadePct: 100.2 },
    valor: { ajustePositivo: 500.5, ajusteNegativo: 120, acuracidadePct: 99.9 },
  }
  assert.deepEqual(plain(ALM.pontoMensal('2026-01', current)), {
    date: '2026-01', itensContados: 140, itensDivPositiva: 3, itensDivNegativa: 2, itensAcuracidadePct: 96.4,
    pecasDivPositiva: 10, pecasDivNegativa: 4, pecasAcuracidadePct: 100.2,
    valorDivPositiva: 500.5, valorDivNegativa: 120, valorAcuracidadePct: 99.9,
  })
})

test('pontoMensal com mês vazio ou resposta incompleta vira zeros', () => {
  const p = plain(ALM.pontoMensal('2026-02', null))
  assert.equal(p.date, '2026-02')
  assert.equal(p.itensContados, 0)
  assert.equal(p.valorAcuracidadePct, 0)
})

test('serieMensal: um ponto por mês do ano, com zeros nos meses sem contagem', () => {
  const meses = ALM.mesesDoAno('2026-03-10')
  const mensal = [
    { mes: '2026-01', itens: { contados: 140, acuracidadePct: 75 }, pecas: {}, valor: {} },
    { mes: '2026-03', itens: { contados: 144, acuracidadePct: 81.3 }, pecas: {}, valor: {} },
  ]
  const s = plain(ALM.serieMensal(meses, mensal))
  assert.deepEqual(s.map((p) => p.date), ['2026-01', '2026-02', '2026-03'])
  assert.deepEqual(s.map((p) => p.itensContados), [140, 0, 144])
  assert.equal(s[2].itensAcuracidadePct, 81.3)
})

test('serieMensal sem resumo mensal devolve null (n8n ainda sem o campo)', () => {
  assert.equal(ALM.serieMensal(ALM.mesesDoAno('2026-03-10'), undefined), null)
})
