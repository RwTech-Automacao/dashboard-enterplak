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

test('datas com mês ou dia inválido são descartadas', () => {
  const ruins = ['2026-13-05', '2026-00-10', '2026-09-32', '2026-02-00']
  const kanban = {
    entregas: ruins.map((d, i) => ({ id: 'e' + i, pedido: 'P' + i, cliente: 'A', quantidade: 1, data: d })),
    notas: ruins.map((d, i) => ({ id: 'n' + i, pedido: 'P' + i, cliente: 'A', quantidade: 1, data: d })),
    vendas: ruins.map((d, i) => ({ pedidoId: 'v' + i, pedido: 'V' + i, cliente: 'A', valor: 1, moeda: 'BRL', dataAprovacao: d })),
  }
  for (const mes of [9, 2, 1, 12]) {
    assert.deepEqual(converterKanban(kanban, { ano: 2026, mes }), [])
  }
})
