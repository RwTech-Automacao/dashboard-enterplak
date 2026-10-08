// Converte a resposta do Kanban PRO nas linhas que o dashboard já lê da planilha
// (previsto = "Plan entregas", realizado = "Faturamento", vendas = "Comercial").
// Os nomes de campo são os da planilha de propósito: parseFaturamentoData no index.html não muda.

export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const pad2 = (n) => String(n).padStart(2, '0')
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/

/** "outubro/26" → { ano: 2026, mes: 10 }; qualquer outra coisa → null. */
export function parseMesParam(s) {
  if (typeof s !== 'string') return null
  const m = s.trim().toLowerCase().match(/^([a-zç]+)\/(\d{2})$/)
  if (!m) return null
  const mes = MESES.indexOf(m[1]) + 1
  if (mes === 0) return null
  return { ano: 2000 + Number(m[2]), mes }
}

export function intervaloDeMeses(lista) {
  const chave = (x) => x.ano * 12 + (x.mes - 1)
  const ord = [...lista].sort((a, b) => chave(a) - chave(b))
  const fmt = (x) => x.ano + '-' + pad2(x.mes)
  return { de: fmt(ord[0]), ate: fmt(ord[ord.length - 1]) }
}

function partesData(ymd) {
  const m = typeof ymd === 'string' ? ymd.match(RE_DATA) : null
  if (!m) return null
  const mes = Number(m[2])
  const dia = Number(m[3])
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? { ano: Number(m[1]), mes, dia } : null
}
const dataBR = (p) => pad2(p.dia) + '/' + pad2(p.mes) + '/' + p.ano
const mesLabel = (p) => MESES[p.mes - 1] + '/' + String(p.ano).slice(-2)
const noMes = (p, alvo) => p.ano === alvo.ano && p.mes === alvo.mes
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : [])

/** Nome de exibição por cliente: mesmo nome com clienteId diferente ganha " (2)", " (3)"… */
function criarNomeador() {
  const porChave = new Map()
  const usados = new Map() // nome base → quantidade de chaves que já o usam
  return function nomeDe(item) {
    const base = (typeof item.cliente === 'string' && item.cliente.trim()) || '(sem cliente)'
    const chave = item.clienteId != null ? 'id:' + item.clienteId : 'nome:' + base
    if (porChave.has(chave)) return porChave.get(chave)
    const n = (usados.get(base) || 0) + 1
    usados.set(base, n)
    const nome = n === 1 ? base : base + ' (' + n + ')'
    porChave.set(chave, nome)
    return nome
  }
}

export function converterKanban(json, alvo) {
  const fonte = json && typeof json === 'object' ? json : {}
  const nomeDe = criarNomeador()
  const linhas = []

  for (const e of lista(fonte.entregas)) {
    const p = partesData(e.data)
    if (!p || !noMes(p, alvo)) continue
    linhas.push({
      ID: e.acp || e.pedido || '',
      Cliente: nomeDe(e),
      PMO: e.acp || '',
      'Descrição': e.produtoDescricao || '',
      'Qtde planejada': num(e.quantidade),
      'Data entrega planejada': dataBR(p),
      'Mês entrega planejada': mesLabel(p),
      'Total fat. Estimado': num(e.valorEstimadoBRL),
      _source: 'previsto',
    })
  }

  for (const n of lista(fonte.notas)) {
    const p = partesData(n.data)
    if (!p || !noMes(p, alvo)) continue
    linhas.push({
      ID: n.acp || n.pedido || '',
      'Mês': mesLabel(p),
      Cliente: nomeDe(n),
      PMO: n.acp || '',
      'Descrição': n.produtoDescricao || '',
      'Qtde Faturada': num(n.quantidade),
      'Data faturada': dataBR(p),
      'Dólar': num(n.cambio),
      'Valor total': num(n.valorBRL),
      'Nota Fiscal': n.numeroNF != null ? n.numeroNF : '',
      _source: 'realizado',
    })
  }

  // Vendas: todo o intervalo pedido (o dashboard separa por mês/trimestre). Só BRL, igual à tela do Kanban.
  for (const v of lista(fonte.vendas)) {
    if (v.moeda !== 'BRL') continue
    const p = partesData(v.dataAprovacao)
    if (!p) continue
    const d = dataBR(p)
    const m = mesLabel(p)
    linhas.push({
      col_2: v.pedido || '',
      col_3: num(v.valor),
      col_4: v.acp || '',
      col_6: 'Aprovado',
      col_8: d, col_9: m, col_10: d, col_11: m, col_14: m,
      cliente: nomeDe(v),
      dataAprovacaoOrigem: v.dataAprovacaoOrigem || '',
      _source: 'vendas',
    })
  }

  return linhas
}
