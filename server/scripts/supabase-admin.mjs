// Small helper around the Supabase Management API.
// Reads SUPABASE_ACCESS_TOKEN from server/.env — never prints secrets.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const NL = String.fromCharCode(10);
const splitLines = (s) => s.split(/\r?\n/);
if (existsSync(envPath)) {
  for (const line of splitLines(readFileSync(envPath, "utf8"))) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
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
} else if (cmd === "env") {
  // Write server/.env for a project (session pooler on 5432 + service_role key).
  const [ref, dbPass] = args;
  const [pool] = await api(`/projects/${ref}/config/database/pooler`);
  const keys = await api(`/projects/${ref}/api-keys?reveal=true`);
  const service = keys.find((k) => k.name === "service_role")?.api_key || keys.find((k) => k.type === "secret")?.api_key;
  const anon = keys.find((k) => k.name === "anon")?.api_key || keys.find((k) => k.type === "publishable")?.api_key;
  const url = `postgresql://${pool.db_user}:${encodeURIComponent(dbPass)}@${pool.db_host}:5432/${pool.db_name}`;
  const keep = existsSync(envPath) ? splitLines(readFileSync(envPath, "utf8")).filter((l) => !/^(DATABASE_URL|SUPABASE_URL|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY|SUPABASE_BUCKET)=/.test(l) && l.trim()) : [];
  writeFileSync(envPath, [...keep, `DATABASE_URL=${url}`, `SUPABASE_URL=https://${ref}.supabase.co`, `SUPABASE_SERVICE_KEY=${service}`, `SUPABASE_ANON_KEY=${anon}`, `SUPABASE_BUCKET=gioka`, ""].join(NL));
  console.log(`.env escrito: host ${pool.db_host}:5432 (session pooler), usuario ${pool.db_user}, service key ${service ? "OK" : "NO ENCONTRADA"}, anon key ${anon ? "OK" : "NO ENCONTRADA"}`);
} else if (cmd === "anon") {
  // Print the public (anon) key: goes to SUPABASE_ANON_KEY (browsers use it for Realtime; RLS blocks everything else).
  const keys = await api(`/projects/${args[0]}/api-keys?reveal=true`);
  console.log(keys.find((k) => k.name === "anon")?.api_key || keys.find((k) => k.type === "publishable")?.api_key || "");
} else if (cmd === "pooler") show(await api(`/projects/${args[0]}/config/database/pooler`));
else {
  console.log("usage: node scripts/supabase-admin.mjs orgs | projects | project <ref> | keys <ref> | sql <ref> <query> | sqlfile <ref> <file> | create <org> <name> <region> <db_pass> | env <ref> <db_pass> | anon <ref> | pooler <ref>");
}
