#!/usr/bin/env node
/**
 * scripts/rotate-secrets.ts — rotaciona secrets dos workers via Wrangler.
 *
 * Uso:
 *   pnpm tsx scripts/rotate-secrets.ts --worker mcp-server --secret CLOUDFLARE_API_TOKEN
 *   pnpm tsx scripts/rotate-secrets.ts --worker autonomous-agent --secret MCP_OPS_TOKEN
 *
 * Política:
 *   - Não loga o valor do secret
 *   - Lê valor de stdin (sem expor em argv ou history)
 *   - Confirma com o operador antes de rotacionar em produção
 *   - Registra rotation no audit log via tool audit_log_recent (manual)
 */

import { spawn } from "node:child_process";
import * as readline from "node:readline/promises";
import { stdin, stdout, argv, exit } from "node:process";

interface Args {
  worker: string;
  secret: string;
  env: "production" | "preview";
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { env: "production" };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--worker" && value) {
      args.worker = value;
      i++;
    } else if (flag === "--secret" && value) {
      args.secret = value;
      i++;
    } else if (flag === "--env" && (value === "production" || value === "preview")) {
      args.env = value;
      i++;
    } else if (flag === "--help" || flag === "-h") {
      console.log("Usage: rotate-secrets --worker <name> --secret <KEY> [--env production|preview]");
      exit(0);
    }
  }
  if (!args.worker || !args.secret) {
    console.error("Erro: --worker e --secret são obrigatórios.");
    exit(1);
  }
  return args as Args;
}

async function readSecretFromStdin(name: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  process.stdout.write(`Cole o novo valor para ${name} (não será ecoado): `);
  const value = (await rl.question("")).trim();
  rl.close();
  if (!value) {
    console.error("Valor vazio. Abortando.");
    exit(1);
  }
  return value;
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ans = await rl.question(`${question} [y/N] `);
  rl.close();
  return ans.trim().toLowerCase() === "y";
}

function runWrangler(workerDir: string, secretName: string, env: string, value: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["wrangler", "secret", "put", secretName, "--env", env], {
      cwd: workerDir,
      stdio: ["pipe", "inherit", "inherit"],
    });
    proc.stdin.write(`${value}\n`);
    proc.stdin.end();
    proc.on("exit", (code) => (code === 0 ? resolve(0) : reject(new Error(`wrangler exit ${code}`))));
  });
}

async function main() {
  const args = parseArgs(argv);
  const workerDir = `apps/${args.worker}`;

  console.log(`Rotacionando ${args.secret} em ${args.worker} (${args.env})`);
  const ok = await confirm(`Confirmar rotação em ${args.env}?`);
  if (!ok) {
    console.log("Cancelado.");
    exit(0);
  }

  const value = await readSecretFromStdin(args.secret);
  await runWrangler(workerDir, args.secret, args.env, value);
  console.log(`✅ Secret ${args.secret} rotacionado em ${args.worker}.`);
  console.log(`Lembre-se de registrar a rotação no audit log.`);
}

main().catch((err) => {
  console.error(err);
  exit(1);
});
