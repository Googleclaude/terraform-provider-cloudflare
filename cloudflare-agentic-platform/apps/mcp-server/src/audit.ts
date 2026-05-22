/**
 * Audit log — toda tool destrutiva ou que altera estado registra aqui.
 * Schema em migrations/0001_audit_log.sql.
 */

export interface AuditEntry {
  actor: string;            // OAuth sub
  tool: string;             // nome da tool
  input: unknown;           // input bruto (será hasheado)
  output: unknown;          // output bruto (será hasheado)
  approvedBy?: string;      // se passou por HITL
  status: "success" | "failure" | "denied";
}

async function sha256(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function logAction(db: D1Database, entry: AuditEntry): Promise<void> {
  const id = crypto.randomUUID();
  const ts = Date.now();
  const inputHash = await sha256(JSON.stringify(entry.input ?? null));
  const outputHash = await sha256(JSON.stringify(entry.output ?? null));

  await db
    .prepare(
      `INSERT INTO audit_log (id, ts, actor, tool, input_hash, output_hash, approved_by, status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
    )
    .bind(id, ts, entry.actor, entry.tool, inputHash, outputHash, entry.approvedBy ?? null, entry.status)
    .run();
}

/**
 * Wrapper que executa uma operação e registra automaticamente o resultado.
 */
export async function withAudit<T>(
  db: D1Database,
  actor: string,
  tool: string,
  input: unknown,
  fn: () => Promise<T>,
  opts: { approvedBy?: string } = {}
): Promise<T> {
  try {
    const output = await fn();
    await logAction(db, { actor, tool, input, output, status: "success", approvedBy: opts.approvedBy });
    return output;
  } catch (err) {
    await logAction(db, { actor, tool, input, output: { error: String(err) }, status: "failure", approvedBy: opts.approvedBy });
    throw err;
  }
}
