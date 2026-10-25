/**
 * Átállás előtti konfigurációs ellenőrzés (tiszta függvény — a környezeti
 * változókat paraméterként kapja, így bármely env-fájl vizsgálható).
 * A hálózati próbát a scripts/blob-preflight.ts --probe végzi.
 */
export type PreflightStatus = "ok" | "warn" | "fail";

export interface PreflightItem {
  id: string;
  status: PreflightStatus;
  message: string;
}

export interface PreflightContext {
  /** A vercel.json crons listája (útvonalak). */
  cronPaths?: string[];
}

type Env = Record<string, string | undefined>;

const DEFAULT_ADMIN_PASSWORD = "devotional-admin";

function val(env: Env, key: string): string | undefined {
  const v = env[key]?.trim();
  return v ? v : undefined;
}

export function evaluatePreflight(env: Env, context: PreflightContext = {}): PreflightItem[] {
  const items: PreflightItem[] = [];
  const add = (id: string, status: PreflightStatus, message: string) =>
    items.push({ id, status, message });

  // --- Blob store-ok ---
  const dataId = val(env, "BLOB_DATA_STORE_ID") ?? val(env, "BLOB_STORE_ID");
  const dataToken = val(env, "BLOB_READ_WRITE_TOKEN");
  const imgId = val(env, "BLOB_IMAGES_STORE_ID");
  const imgToken = val(env, "BLOB_IMAGES_READ_WRITE_TOKEN");

  if (dataId || dataToken) {
    add("data-store", "ok", "Az adat store hitelesítése be van állítva.");
  } else {
    add(
      "data-store",
      "fail",
      "Hiányzik az adat store: BLOB_DATA_STORE_ID (vagy BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN)."
    );
  }

  if (imgId || imgToken) {
    add("images-store", "ok", "A képtár hitelesítése be van állítva.");
  } else {
    add(
      "images-store",
      "warn",
      "Nincs képtár (BLOB_IMAGES_STORE_ID / BLOB_IMAGES_READ_WRITE_TOKEN): a képfeltöltés nem lesz elérhető (a Pexels-képek működnek)."
    );
  }

  const sameId = dataId && imgId && dataId === imgId;
  const sameToken = dataToken && imgToken && dataToken === imgToken;
  if (sameId || sameToken) {
    add(
      "stores-distinct",
      "fail",
      "Az adat store és a képtár azonos — a privát adatok és a nyilvános képek nem keverhetők egy storeban."
    );
  } else if ((dataId || dataToken) && (imgId || imgToken)) {
    add("stores-distinct", "ok", "Az adat store és a képtár külön store.");
  }

  // --- Meghajtó és visszaút ---
  const driver = val(env, "STORAGE_DRIVER")?.toLowerCase();
  if (driver === "blob") {
    add("driver", "ok", "STORAGE_DRIVER=blob (a Blob az aktív meghajtó).");
  } else {
    add(
      "driver",
      "ok",
      `STORAGE_DRIVER=${driver ?? "(nincs)"} — a Blob még nem aktív (ez az átállás utolsó lépése).`
    );
  }

  const hasRedis =
    Boolean(val(env, "KV_REST_API_URL") ?? val(env, "UPSTASH_REDIS_REST_URL")) &&
    Boolean(val(env, "KV_REST_API_TOKEN") ?? val(env, "UPSTASH_REDIS_REST_TOKEN"));
  add(
    "rollback",
    hasRedis ? "ok" : "warn",
    hasRedis
      ? "A Redis hitelesítése megvan: a visszaút (STORAGE_DRIVER=redis) lehetséges."
      : "A Redis hitelesítése nincs ebben a környezetben — a visszaút nem lesz azonnali."
  );

  // --- Titkok és alapok ---
  if (val(env, "CRON_SECRET")) add("cron-secret", "ok", "CRON_SECRET beállítva.");
  else add("cron-secret", "fail", "CRON_SECRET hiányzik — a cron végpontok nem hitelesíthetők.");

  const password = val(env, "ADMIN_PASSWORD");
  if (!password) {
    add("admin-password", "fail", "ADMIN_PASSWORD hiányzik — a kód alapértelmezett jelszavát használná.");
  } else if (password === DEFAULT_ADMIN_PASSWORD) {
    add("admin-password", "fail", "Az ADMIN_PASSWORD az alapértelmezett érték.");
  } else if (password.length < 12) {
    add("admin-password", "warn", "Az ADMIN_PASSWORD rövid (<12 karakter).");
  } else {
    add("admin-password", "ok", "ADMIN_PASSWORD beállítva.");
  }

  if (val(env, "NEXT_PUBLIC_SITE_URL")) add("site-url", "ok", "NEXT_PUBLIC_SITE_URL beállítva (Facebook-linkek).");
  else add("site-url", "fail", "NEXT_PUBLIC_SITE_URL hiányzik — a megosztási linkek hibásak lesznek.");

  // --- Retention ---
  const days = val(env, "DEVOTIONAL_RETENTION_DAYS");
  if (!days || days === "7") add("retention-days", "ok", "A megőrzés 7 nap.");
  else add("retention-days", "warn", `A DEVOTIONAL_RETENTION_DAYS=${days} eltér a tervezett 7-től.`);

  if (val(env, "DEVOTIONAL_RETENTION_AUTO_DELETE")?.toLowerCase() === "true") {
    add(
      "auto-delete",
      "warn",
      "DEVOTIONAL_RETENTION_AUTO_DELETE=true: az automatikus törlés BE van kapcsolva. Átállás előtt legyen kikapcsolva; csak előnézet és jóváhagyás után kapcsold be."
    );
  } else {
    add("auto-delete", "ok", "Az automatikus törlés ki van kapcsolva (a cron csak előnézetet ad).");
  }

  // --- Cron ---
  if (context.cronPaths) {
    for (const path of ["/api/cron/generate-devotional", "/api/cron/prune-devotionals"]) {
      add(
        `cron:${path}`,
        context.cronPaths.includes(path) ? "ok" : "fail",
        context.cronPaths.includes(path)
          ? `vercel.json: ${path} ütemezve.`
          : `vercel.json: ${path} hiányzik az ütemezésből.`
      );
    }
  }

  return items;
}

export function preflightHasFailures(items: PreflightItem[]): boolean {
  return items.some((i) => i.status === "fail");
}
