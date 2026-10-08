import { createClient } from '@supabase/supabase-js'

export const PERMISSAO_FLUXO = 'shopfloor_fluxo'

export function extrairBearer(valor) {
  if (typeof valor !== 'string') return null
  const m = valor.match(/^Bearer\s+(\S+)$/i)
  return m ? m[1] : null
}

export function podeVerAlguma(perfil, paginas, exigidas) {
  if (!perfil || perfil.active === false) return false
  if (perfil.role === 'admin' || perfil.role === 'moderador') return true
  return Array.isArray(paginas) && exigidas.some((p) => paginas.includes(p))
}

export function podeVerFluxo(perfil, paginas) {
  return podeVerAlguma(perfil, paginas, [PERMISSAO_FLUXO])
}

/**
 * Confere a sessão do dashboard (Supabase do dashboard) e a permissão exigida (por padrão, a do Fluxo ShopFloor).
 * As consultas usam o token do PRÓPRIO usuário: o RLS já permite ler o próprio perfil e
 * as próprias permissões, então nenhuma chave de serviço é necessária.
 */
export async function autorizarUsuario(authorization, {
  criarCliente,
  paginasExigidas = [PERMISSAO_FLUXO],
  erroSemPermissao = 'Sem permissão para o Fluxo ShopFloor.',
}) {
  const token = extrairBearer(authorization)
  if (!token) return { ok: false, status: 401, erro: 'Sessão ausente.' }

  const sb = criarCliente(token)
  const { data: u, error: erroUser } = await sb.auth.getUser(token)
  if (erroUser || !u || !u.user) return { ok: false, status: 401, erro: 'Sessão inválida.' }
  const userId = u.user.id

  const { data: perfil, error: erroPerfil } = await sb.from('profiles').select('role, active').eq('id', userId).single()
  if (erroPerfil || !perfil) return { ok: false, status: 403, erro: 'Perfil não encontrado.' }

  let paginas = []
  if (perfil.role === 'usuario') {
    const { data: perms, error: erroPerms } = await sb.from('user_page_permissions').select('page_id').eq('user_id', userId)
    if (erroPerms) return { ok: false, status: 503, erro: 'Não foi possível verificar as permissões.' }
    paginas = (perms || []).map((p) => p.page_id)
  }

  if (!podeVerAlguma(perfil, paginas, paginasExigidas)) return { ok: false, status: 403, erro: erroSemPermissao }
  return { ok: true, userId }
}

export function criarClienteSupabase(token) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
