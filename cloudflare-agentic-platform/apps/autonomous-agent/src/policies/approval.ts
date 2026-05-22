export type ApprovalMode = "auto" | "async" | "sync";

/**
 * Categoriza uma ação para decidir o caminho de aprovação.
 *
 * - auto:  read-only, idempotente, baixo blast radius
 * - async: mudanças reversíveis (notifica humano; executa após N min se não vetar)
 * - sync:  destrutivo / segurança (precisa confirmação ativa antes de executar)
 */
export function classify(tool: string): ApprovalMode {
  if (tool.startsWith("delete_") || tool.startsWith("purge_") || tool.startsWith("drop_")) {
    return "sync";
  }
  if (tool.startsWith("disable_") || tool.startsWith("rotate_") || tool.includes("security_level")) {
    return "sync";
  }
  if (tool.includes("_create_") || tool.includes("_update_") || tool.includes("_set_")) {
    return "async";
  }
  return "auto";
}
