import { montarUrlOps, normalizarOps } from './ops.js'
import { nextValido, assinarTokenSso, montarUrlSso } from './sso.js'

const EMAIL_PADRAO = 'dashboard@enterplak.com.br'

export function criarHandlerOps({ autorizar, fetchFn, env }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' })

    let a
    try {
      a = await autorizar(req.headers.authorization)
    } catch (e) {
      console.error('[shopfloor-ops] falha ao verificar a sessão:', e.message)
      return res.status(503).json({ erro: 'Não foi possível verificar a sessão agora.' })
    }
    if (!a.ok) return res.status(a.status).json({ erro: a.erro })

    if (!env.SHOPFLOOR_URL || !env.DASHBOARD_API_SECRET) {
      return res.status(503).json({ erro: 'Integração com o ShopFloor não configurada.' })
    }

    try {
      const origin = new URL(env.SHOPFLOOR_URL).origin
      const r = await fetchFn(montarUrlOps(env.SHOPFLOOR_URL, env.SHOPFLOOR_OPS_DIAS), {
        headers: { Authorization: 'Bearer ' + env.DASHBOARD_API_SECRET },
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) return res.status(502).json({ erro: 'ShopFloor respondeu ' + r.status + '.' })
      return res.status(200).json({ origin, ops: normalizarOps(await r.json()) })
    } catch (e) {
      console.error('[shopfloor-ops] falha ao consultar o ShopFloor:', e.message)
      return res.status(502).json({ erro: 'ShopFloor indisponível.' })
    }
  }
}

export function criarHandlerSso({ autorizar, env, assinar = assinarTokenSso }) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido.' })

    let a
    try {
      a = await autorizar(req.headers.authorization)
    } catch (e) {
      console.error('[shopfloor-sso] falha ao verificar a sessão:', e.message)
      return res.status(503).json({ erro: 'Não foi possível verificar a sessão agora.' })
    }
    if (!a.ok) return res.status(a.status).json({ erro: a.erro })

    if (!env.SHOPFLOOR_URL || !env.DASHBOARD_SSO_SECRET) {
      return res.status(503).json({ erro: 'Integração com o ShopFloor não configurada.' })
    }

    const next = req.body && req.body.next
    if (!nextValido(next)) return res.status(400).json({ erro: 'Destino inválido.' })

    try {
      const token = await assinar({ segredo: env.DASHBOARD_SSO_SECRET, email: env.DASHBOARD_SSO_EMAIL || EMAIL_PADRAO })
      return res.status(200).json({ url: montarUrlSso(env.SHOPFLOOR_URL, token, next) })
    } catch (e) {
      console.error('[shopfloor-sso] falha ao gerar o acesso:', e.message)
      return res.status(503).json({ erro: 'Não foi possível gerar o acesso ao ShopFloor agora.' })
    }
  }
}
