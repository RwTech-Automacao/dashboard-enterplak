import { criarHandlerSso } from './_lib/handlers.js'
import { autorizarUsuario, criarClienteSupabase } from './_lib/auth.js'

export default criarHandlerSso({
  autorizar: (authorization) => autorizarUsuario(authorization, { criarCliente: criarClienteSupabase }),
  env: process.env,
})
