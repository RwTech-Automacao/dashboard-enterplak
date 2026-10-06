export function montarUrlOps(base, dias) {
  const url = new URL('/api/dashboard/ops-ativas', base)
  const n = Number.parseInt(dias, 10)
  if (Number.isInteger(n) && n >= 1 && n <= 365) url.searchParams.set('dias', String(n))
  return url.toString()
}

const texto = (v) => (typeof v === 'string' ? v : '')

export function normalizarOps(json) {
  const lista = json && Array.isArray(json.ops) ? json.ops : []
  return lista
    .filter((o) => o && typeof o.pmo === 'string' && o.pmo !== '' && typeof o.op === 'string' && o.op !== '')
    .map((o) => ({
      pmo: o.pmo,
      op: o.op,
      cliente: texto(o.cliente),
      descricao: texto(o.descricao),
      ultimoBipe: typeof o.ultimoBipe === 'string' ? o.ultimoBipe : null,
    }))
}
