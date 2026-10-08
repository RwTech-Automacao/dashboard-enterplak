import { criarHandlerFaturamento } from './_lib/handlers.js'
import { autorizarUsuario, criarClienteSupabase } from './_lib/auth.js'

export default criarHandlerFaturamento({
  autorizar: (authorization) => autorizarUsuario(authorization, {
    criarCliente: criarClienteSupabase,
    paginasExigidas: ['faturamento', 'vendas'],
    erroSemPermissao: 'Sem permissão para Produção/Vendas.',
  }),
  fetchFn: fetch,
  env: process.env,
})
