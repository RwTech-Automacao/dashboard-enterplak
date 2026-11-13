import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Simula o index.html: variáveis globais declaradas com let/var (como na tela) + o script do painel.
function carregar(estado) {
  const ctx = { window: {}, document: { getElementById: () => null } }
  vm.createContext(ctx)
  vm.runInContext(estado, ctx)
  vm.runInContext(readFileSync(new URL('../ajuda-contas.js', import.meta.url), 'utf8'), ctx)
  return ctx.window.AJUDA
}
const texto = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

test('diasUteis conta seg–sex e para em "hoje"', () => {
  const A = carregar('')
  const d = A._fmt.diasUteis(new Date(2026, 2, 1), new Date(2026, 2, 31), new Date(2026, 2, 10))
  assert.equal(d.total, 22)
  assert.equal(d.ateHoje, 7)
})

test('Produção explica % produzido, meta e ATRASADO com os números da tela (mês passado = meta 100%)', () => {
  const A = carregar(`
    var MESES_NOMES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    let faturamentoMesAtual = 'março/26';
    let faturamentoProjetoSelecionado = null;
    let faturamentoData = { metaProducao: 1000, producao: 400, metaFaturamento: 200000, faturado: 100000,
      projetos: [{ nome: 'Cliente A', metaProducao: 1000, producao: 400, metaFaturamento: 200000, faturado: 100000 }] };
  `)
  const c = A.montar('faturamento')
  const t = texto(c.html)
  assert.equal(c.sub, 'Março/26')
  assert.match(t, /400 ÷ 1\.000 × 100 = 40,0%/)
  assert.match(t, /22 de 22/)
  assert.match(t, /ATRASADO/)
  assert.match(t, /R\$ 100\.000,00 ÷ R\$ 200\.000,00 × 100 = 50,0%/)
  assert.match(t, /Cliente A/)
})

test('Compras: lê let allData/filteredData e avisa status fora dos 3 cartões', () => {
  const A = carregar(`
    let allData = [{}, {}, {}, {}];
    let filteredData = [{ Status: 'OK' }, { Status: 'PROBLEMA NO PRAZO' }, { Status: 'NENHUMA RESPOSTA' }];
  `)
  const t = texto(A.montar('dashboard').html)
  assert.match(t, /Linhas na planilha: 4 · depois dos filtros: 3/)
  assert.match(t, /1 ÷ 3 × 100 = 33\.3%/)
  assert.match(t, /1 pedido\(s\) têm outro status/)
})

test('Almoxarifado mostra filtro, meta proporcional e acuracidade', () => {
  const A = carregar(`
    function almMetaMensal() { return 150; }
    var almState = { activePreset: 'mes_anterior', startDate: '2026-10-01', endDate: '2026-10-31', estoque: 'MATERIA PRIMA',
      data: { period: { days: 31 }, previousPeriod: { startDate: '2026-08-31', endDate: '2026-09-30' }, previous: { itens: { contados: 50 } },
        current: { itens: { contados: 66, semDivergencia: 65, divPositiva: 1, divNegativa: 0, ajusteAbsoluto: 1, acuracidadePct: 98.4848 },
          pecas: {}, valor: {} } } };
  `)
  const t = texto(A.montar('almoxarifado').html)
  assert.match(t, /Estoque: MATERIA PRIMA/)
  assert.match(t, /Meta: 150 ÷ 30 × 31 = 155/)
  assert.match(t, /65 ÷ 66 × 100 = 98,48%/)
})

test('Almoxarifado: cada cartão explica o número e o selo de variação, igual à tela', () => {
  const A = carregar(`
    function almMetaMensal() { return 150; }
    var almState = { activePreset: '30d', startDate: '2026-10-15', endDate: '2026-11-13', estoque: '',
      data: { period: { days: 30 }, previousPeriod: { startDate: '2026-09-15', endDate: '2026-10-14' },
        previous: { itens: { contados: 167, divPositiva: 3, divNegativa: 0 }, pecas: {}, valor: {} },
        current: { itens: { contados: 75, semDivergencia: 74, divPositiva: 1, divNegativa: 0, ajusteAbsoluto: 1, acuracidadePct: 98.67 },
          pecas: {}, valor: {} } } };
  `)
  const t = texto(A.montar('almoxarifado').html)
  assert.match(t, /Selo ▼ -55\.1% — vermelho \(piorou\)/)
  assert.match(t, /\(75 − 167\) ÷ 167 × 100 = -55,1%/)
  assert.match(t, /Selo ▲ -66\.7% — verde \(melhorou\)/)
  assert.match(t, /Selo ● 0\.0% — cinza \(igual\)/)
  assert.match(t, /Meta: 150 ÷ 30 × 30 = 150/)
})

test('Sem dados carregados, pede para esperar a tela carregar', () => {
  const A = carregar('')
  assert.match(texto(A.montar('almoxarifado').html), /ainda não carregaram/)
  assert.match(texto(A.montar('aba-personalizada').html), /imagem fixa/)
})
