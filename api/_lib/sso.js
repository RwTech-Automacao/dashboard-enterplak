import { SignJWT } from 'jose'
import { randomUUID } from 'node:crypto'

export const SSO_ISSUER = 'enterplak-dashboard'
export const SSO_AUDIENCE = 'shopfloor-embed'
export const SSO_TTL_S = 60

/** Só aceita caminho relativo dentro de /embed/ (nunca o próprio /embed/sso). Evita open redirect. */
export function nextValido(next) {
  if (typeof next !== 'string' || next === '' || next.length > 500) return false
  if (!next.startsWith('/embed/') || next.startsWith('/embed/sso')) return false
  if (next.includes('//') || next.includes('\\') || next.includes('..')) return false
  let decodificado
  try { decodificado = decodeURIComponent(next) } catch { return false }
  if (decodificado.includes('..') || decodificado.includes('\\')) return false
  return true
}

export async function assinarTokenSso({ segredo, email, agora = Math.floor(Date.now() / 1000), jti = randomUUID() }) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SSO_ISSUER)
    .setAudience(SSO_AUDIENCE)
    .setJti(jti)
    .setIssuedAt(agora)
    .setExpirationTime(agora + SSO_TTL_S)
    .sign(new TextEncoder().encode(segredo))
}

export function montarUrlSso(base, token, next) {
  return base.replace(/\/+$/, '') + '/embed/sso?token=' + encodeURIComponent(token) + '&next=' + encodeURIComponent(next)
}
