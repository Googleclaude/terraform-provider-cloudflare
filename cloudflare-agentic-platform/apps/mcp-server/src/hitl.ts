/**
 * Human-in-the-loop: tools destrutivas devem confirmar com o usuário
 * antes de executar, usando elicitation do MCP SDK.
 *
 * Prefixos destrutivos: delete_, disable_, rotate_, purge_, drop_
 */

const DESTRUCTIVE_PREFIXES = ["delete_", "disable_", "rotate_", "purge_", "drop_"];

export function isDestructive(toolName: string): boolean {
  return DESTRUCTIVE_PREFIXES.some((p) => toolName.startsWith(p));
}

export interface ApprovalRequest {
  tool: string;
  args: unknown;
  reason: string;
  /** O que será afetado, em linguagem natural */
  impact: string;
}

/**
 * Em produção, isto deveria usar server.server.elicitInput() do SDK MCP
 * para abrir prompt no cliente. Por enquanto, encapsulamos a checagem.
 */
export function requireApproval(req: ApprovalRequest): {
  message: string;
  promptForApproval: true;
} {
  return {
    message:
      `⚠️  Operação destrutiva — confirmação obrigatória\n` +
      `Tool: ${req.tool}\n` +
      `Impacto: ${req.impact}\n` +
      `Args: ${JSON.stringify(req.args, null, 2)}\n\n` +
      `Reenvie com "approved: true" no input para prosseguir.`,
    promptForApproval: true,
  };
}
