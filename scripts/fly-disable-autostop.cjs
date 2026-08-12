#!/usr/bin/env node
// One-off script: disable auto-stop on all Fundi production machines
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const FLY_API = "https://api.machines.dev/v1";
const FUNDI_ORGS = ["myfundi-27", "bursaries-co-za", "fundi-shop"];

function parseOrgTokens() {
  const map = new Map();
  for (const pair of (process.env.FLY_ORG_TOKENS ?? "").split("|")) {
    const idx = pair.indexOf(":");
    if (idx > 0) map.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
  return map;
}

function isProduction(name) {
  const n = name.toLowerCase();
  return !["staging", "-db", "db-", "db-gd", "db-small"].some(s => n.includes(s));
}

async function api(path, token, opts = {}) {
  const res = await fetch(`${FLY_API}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const tokens = parseOrgTokens();
  let updated = 0, skipped = 0, errors = 0;

  for (const org of FUNDI_ORGS) {
    const token = tokens.get(org);
    if (!token) { console.log(`\n⚠  No token for ${org}`); continue; }

    console.log(`\n── ${org} ──`);
    let apps;
    try { apps = (await api(`/apps?org_slug=${org}`, token)).apps ?? []; }
    catch (e) { console.log(`  ✗ listApps: ${e.message}`); errors++; continue; }

    for (const app of apps) {
      if (!isProduction(app.name)) {
        console.log(`  skip  ${app.name}`);
        skipped++;
        continue;
      }

      let machines;
      try { machines = await api(`/apps/${app.name}/machines`, token); }
      catch { machines = []; }

      if (!machines.length) { console.log(`  empty ${app.name}`); continue; }

      for (const m of machines) {
        const services = m.config?.services ?? [];
        if (!services.length) {
          console.log(`  no-svc ${app.name}/${m.id.slice(0,8)} (no http services — skipping)`);
          skipped++;
          continue;
        }

        const alreadyOk = services.every(s =>
          s.auto_stop_machines === false && (s.min_machines_running ?? 0) >= 1
        );
        if (alreadyOk) {
          console.log(`  ok     ${app.name}/${m.id.slice(0,8)} (already always-on)`);
          skipped++;
          continue;
        }

        const updatedServices = services.map(s => ({
          ...s,
          auto_stop_machines: false,
          min_machines_running: 1,
        }));

        try {
          await api(`/apps/${app.name}/machines/${m.id}`, token, {
            method: "POST",
            body: JSON.stringify({ config: { ...m.config, services: updatedServices } }),
          });
          console.log(`  ✓      ${app.name}/${m.id.slice(0,8)} — auto-stop disabled`);
          updated++;
        } catch (e) {
          console.log(`  ✗      ${app.name}/${m.id.slice(0,8)}: ${e.message}`);
          errors++;
        }
      }
    }
  }

  console.log(`\n✅ Done — ${updated} updated, ${skipped} skipped, ${errors} errors`);
}

main().catch(e => { console.error(e); process.exit(1); });
