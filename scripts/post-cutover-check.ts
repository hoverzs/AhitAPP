/**
 * Átállás utáni gyors ellenőrzés az ÉLES oldalon (csak olvasó GET kérések).
 *
 *   npx tsx scripts/post-cutover-check.ts https://ahit-app.vercel.app
 *
 * Ellenőrzi: a főoldal és az /api/devotionals nem ad tárolóhibát, a nyilvános
 * API csak közzétett napokat ad, a cron végpontok hitelesítés nélkül 401-et
 * adnak, a lejárt/ismeretlen nap érthető oldalt ad. Az admin és a generálás
 * ellenőrzéséhez bejelentkezés kell — azt kézzel (lásd az ellenőrzőlistát).
 */
interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

const base = (process.argv[2] ?? "https://ahit-app.vercel.app").replace(/\/$/, "");

async function get(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, { redirect: "manual", ...init });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const home = await get("/");
  add("főoldal: 200", home.status === 200, `HTTP ${home.status}`);
  add(
    "főoldal: nincs hibaoldal",
    !/Valami nem sikerült/.test(home.text),
    undefined
  );
  add("főoldal: megvan a nyolcnapos választó", /elmult-napok/.test(home.text));

  const api = await get("/api/devotionals");
  let parsed: { devotionals?: { status?: string }[]; code?: string; reason?: string } = {};
  try {
    parsed = JSON.parse(api.text);
  } catch {
    /* nem JSON */
  }
  add(
    "/api/devotionals: 200 és nincs tárolóhiba",
    api.status === 200 && Array.isArray(parsed.devotionals),
    api.status === 200 ? undefined : `HTTP ${api.status} ${parsed.code ?? ""} ${parsed.reason ?? ""}`.trim()
  );
  if (Array.isArray(parsed.devotionals)) {
    add(
      "/api/devotionals: csak közzétett napok",
      parsed.devotionals.every((d) => !d.status || d.status === "published"),
      `${parsed.devotionals.length} nap`
    );
  }

  for (const path of ["/api/cron/generate-devotional", "/api/cron/prune-devotionals"]) {
    const res = await get(path);
    add(`${path}: hitelesítés nélkül 401`, res.status === 401, `HTTP ${res.status}`);
  }

  const expired = await get("/nap/1");
  add("/nap/1: érthető oldal (nem 5xx)", expired.status < 500, `HTTP ${expired.status}`);

  const admin = await get("/api/admin/devotionals");
  add("admin lista: hitelesítés nélkül 401", admin.status === 401, `HTTP ${admin.status}`);

  for (const c of checks) console.log(`${c.ok ? "OK  " : "HIBA"} ${c.name}${c.detail ? " — " + c.detail : ""}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${failed === 0 ? "Minden ellenőrzés rendben." : `${failed} ellenőrzés sikertelen.`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
