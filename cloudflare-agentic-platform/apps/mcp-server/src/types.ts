export type Scope =
  | "dns:read" | "dns:write"
  | "waf:read" | "waf:write"
  | "access:read" | "access:write"
  | "observability"
  | "github:write"
  | "emergency:write";

export interface Props extends Record<string, unknown> {
  /** OAuth subject — identidade do usuário */
  sub: string;
  /** E-mail (se disponível) */
  email?: string;
  /** Scopes/capabilities aprovados nesta sessão */
  scopes: Scope[];
  /** Token Cloudflare downscoped para esta sessão */
  cfToken: string;
}
