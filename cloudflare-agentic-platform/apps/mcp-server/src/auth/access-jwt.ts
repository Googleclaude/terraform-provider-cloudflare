/**
 * Verifica Cloudflare Access JWT (Cf-Access-Jwt-Assertion header).
 * Documentação: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 *
 * Faz fetch da JWKS do team uma vez por instância do worker (cacheia em memória).
 * Não usa biblioteca externa — apenas crypto.subtle nativo do Workers.
 */

interface JwtHeader { alg: string; kid: string; typ?: string }
interface JwtPayload { iss: string; aud: string | string[]; sub: string; email?: string; exp: number; nbf?: number }
interface Jwk { kty: string; kid: string; n: string; e: string; alg?: string; use?: string }

export interface AccessClaims { sub: string; email: string; exp: number }

const jwksCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchJwks(teamDomain: string): Promise<Jwk[]> {
  const cached = jwksCache.get(teamDomain);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: Jwk[] };
  jwksCache.set(teamDomain, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
}

function base64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function base64UrlDecodeText(s: string): string {
  return new TextDecoder().decode(base64UrlDecode(s));
}

async function importRsaPublicKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true } as JsonWebKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

export async function verifyAccessJwt(
  token: string,
  teamDomain: string,
  expectedAud: string,
): Promise<AccessClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = JSON.parse(base64UrlDecodeText(headerB64));
    payload = JSON.parse(base64UrlDecodeText(payloadB64));
  } catch { return null; }

  if (header.alg !== "RS256") return null;

  const expectedIss = `https://${teamDomain}`;
  if (payload.iss !== expectedIss) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(expectedAud)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp <= now) return null;
  if (payload.nbf && payload.nbf > now) return null;

  const keys = await fetchJwks(teamDomain);
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const key = await importRsaPublicKey(jwk);
  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(sigB64);

  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signingInput);
  if (!valid) return null;

  const email = payload.email ?? payload.sub;
  return { sub: payload.sub, email, exp: payload.exp };
}

export function clearJwksCache() {
  jwksCache.clear();
}
