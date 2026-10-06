import { createECDH, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

const projectRef = "xevhawcjknatepvsigyf";
const sensitiveValues = [];
const linked = (await readFile(new URL("../supabase/.temp/project-ref", import.meta.url), "utf8")).trim();
if (linked !== projectRef) throw new Error("The linked project must be Routine Command.");

async function cli(args, input = "") {
  return await new Promise((resolve, reject) => {
    // Pin the credential command to the stable Go CLI, and keep npm flags
    // separate from CLI flags. A shell pipe gives /dev/stdin a reopenable pipe
    // descriptor (Node's direct child stdin is a Unix socket on Linux).
    const executable = args[0] === "secrets" ? "supabase@2.75.0" : "supabase";
    const cliArgs = ["--yes", "--", executable, ...args, "--project-ref", projectRef];
    const child = input
      ? spawn("bash", ["-o", "pipefail", "-c", 'cat | npx "$@"', "routine-push-stdin", ...cliArgs], { stdio: ["pipe", "pipe", "pipe"] })
      : spawn("npx", cliArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let output = "", errors = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    // Capture credentials-bearing errors without exposing command input or SQL.
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      let detail = errors;
      for (const value of sensitiveValues) detail = detail.replaceAll(value, "[redacted]");
      return code === 0 ? resolve(output) : reject(new Error(`Supabase ${args.slice(0, 2).join(" ")} failed (exit ${code}): ${detail.slice(0, 2000)}`));
    });
    child.stdin.end(input);
  });
}

const secrets = JSON.parse(await cli(["secrets", "list", "-o", "json"]));
const names = new Set(secrets.map((item) => item.name));
const hasPublic = names.has("ROUTINE_PUSH_PUBLIC_KEY");
const hasPrivate = names.has("ROUTINE_PUSH_PRIVATE_KEY");
if (hasPublic !== hasPrivate) throw new Error("Only one VAPID key exists. Resolve the partial setup before changing it.");
const vaultStatus = await cli(["db", "query", "--linked", "-o", "json", "select exists(select 1 from vault.secrets where name = 'routine_command_push_cron') as configured"]);
const vaultResult = JSON.parse(vaultStatus);
if (hasPublic && names.has("ROUTINE_PUSH_CRON_SECRET") && (vaultResult.rows ?? vaultResult)[0]?.configured) {
  console.log("Existing push keys and scheduler credential preserved.");
  process.exit(0);
}
const cronSecret = randomBytes(32).toString("hex");
sensitiveValues.push(cronSecret);
let input = `ROUTINE_PUSH_CRON_SECRET=${cronSecret}\n`;
if (!hasPublic) {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const publicKey = key.getPublicKey().toString("base64url"), privateKey = key.getPrivateKey().toString("base64url");
  sensitiveValues.push(publicKey, privateKey);
  input += `ROUTINE_PUSH_PUBLIC_KEY=${publicKey}\nROUTINE_PUSH_PRIVATE_KEY=${privateKey}\n`;
}
await cli(["secrets", "set", "--env-file", "/dev/stdin"], input);
const sql = `do $setup$ declare secret_id uuid; begin
  select id into secret_id from vault.secrets where name = 'routine_command_push_cron' limit 1;
  if secret_id is null then perform vault.create_secret('${cronSecret}', 'routine_command_push_cron', 'Routine Command notification scheduler');
  else perform vault.update_secret(secret_id, '${cronSecret}'); end if;
end $setup$;`;
await cli(["db", "query", "--linked", "--file", "/dev/stdin"], sql);
console.log("Push credentials configured securely in Supabase and Vault. No private keys written locally.");
