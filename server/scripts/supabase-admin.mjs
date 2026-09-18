// Small helper around the Supabase Management API (used by `npm run supabase:*`).
// Reads SUPABASE_ACCESS_TOKEN from server/.env — never prints it.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const BASE = "https://api.supabase.com/v1";
export async function api(path, init = {}) {
  const r = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await r.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  if (!r.ok) throw new Error(`${init.method || "GET"} ${path} → ${r.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  return body;
}

const [cmd, ...args] = process.argv.slice(2);
const show = (x) => console.log(JSON.stringify(x, null, 2));

if (cmd === "orgs") show(await api("/organizations"));
else if (cmd === "projects") show((await api("/projects")).map((p) => ({ id: p.id, name: p.name, region: p.region, status: p.status, org: p.organization_id, created: p.created_at })));
else if (cmd === "project") show(await api(`/projects/${args[0]}`));
else if (cmd === "keys") show((await api(`/projects/${args[0]}/api-keys?reveal=false`)).map((k) => ({ name: k.name, type: k.type, prefix: String(k.api_key || "").slice(0, 12) + "…" })));
else if (cmd === "sql") show(await api(`/projects/${args[0]}/database/query`, { method: "POST", body: JSON.stringify({ query: args.slice(1).join(" ") }) }));
else if (cmd === "sqlfile") show(await api(`/projects/${args[0]}/database/query`, { method: "POST", body: JSON.stringify({ query: readFileSync(args[1], "utf8") }) }));
else if (cmd === "create") {
  const [org, name, region, pass] = args;
  show(await api("/projects", { method: "POST", body: JSON.stringify({ organization_id: org, name, region, db_pass: pass, plan: "free" }) }));
} else if (cmd === "pooler") show(await api(`/projects/${args[0]}/config/database/pooler`));
else {
  console.log("usage: node scripts/supabase-admin.mjs orgs | projects | project <ref> | keys <ref> | sql <ref> <query> | sqlfile <ref> <file> | create <org> <name> <region> <db_pass> | pooler <ref>");
}
