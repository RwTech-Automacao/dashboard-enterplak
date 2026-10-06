import { criarHandlerOps } from './_lib/handlers.js'
import { autorizarUsuario, criarClienteSupabase } from './_lib/auth.js'

export default criarHandlerOps({
  autorizar: (authorization) => autorizarUsuario(authorization, { criarCliente: criarClienteSupabase }),
  fetchFn: fetch,
  env: process.env,
})
