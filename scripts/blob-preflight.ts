/**
 * Átállás előtti ellenőrzés a Vercel Blobhoz.
 *
 *   npx tsx scripts/blob-preflight.ts --env-file=.env.blob.local
 *       Konfiguráció-ellenőrzés (nem csinál hálózati hívást, nem ír semmit).
 *
 *   npx tsx scripts/blob-preflight.ts --env-file=.env.blob.local --probe
 *       Élő próba az ÚJ (üres) store-okon, csak a `_preflight/` útvonalon:
 *       létrehozás / „már létezik" hibaszöveg, ifMatch-ütközés, friss olvasás,
 *       list, törlés; a privát store anonim elérése tiltott, a képtár képe
 *       nyilvános. ~8 összetett és ~4 egyszerű műveletet fogyaszt (Hobby keret:
 *       2 000 / 10 000). Éles adatútvonalhoz nem nyúl.
 *
 * Kilépési kód: 1, ha bármi HIBA.
 */
import { put } from "@vercel/blob";
import { existsSync, readFileSync } from "fs";
import {
  evaluatePreflight,
  preflightHasFailures,
  type PreflightItem,
} from "../src/lib/migration/preflight";
import {
  BlobAlreadyExistsError,
  BlobPreconditionError,
} from "../src/lib/storage/blob/client";
import {
  BLOB_ACCESS,
  getDataBlobAuth,
  getImagesBlobAuth,
  isBlobStorageConfigured,
  isImageBlobConfigured,
} from "../src/lib/storage/blob/config";
import { createVercelBlobClient } from "../src/lib/storage/blob/vercel-client";
import { createVercelImageStore } from "../src/lib/storage/blob/vercel-image-store";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function loadEnv() {
  const explicit = arg("env-file");
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`Env fájl nem található: ${explicit}`);
    process.loadEnvFile(explicit);
  } else if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
  }
}

function cronPaths(): string[] | undefined {
  try {
    const parsed = JSON.parse(readFileSync("vercel.json", "utf-8")) as {
      crons?: { path: string }[];
    };
    return (parsed.crons ?? []).map((c) => c.path);
  } catch {
    return undefined;
  }
}

const ICON = { ok: "OK  ", warn: "FIGY", fail: "HIBA" } as const;

function print(items: PreflightItem[]) {
  for (const i of items) console.log(`${ICON[i.status]}  ${i.message}`);
}

// 1x1 átlátszó PNG
const TINY_PNG = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64"
  )
);

async function probe(): Promise<PreflightItem[]> {
  const items: PreflightItem[] = [];
  const add = (status: PreflightItem["status"], message: string) =>
    items.push({ id: `probe-${items.length}`, status, message });

  const stamp = Date.now();
  const probePath = `_preflight/probe-${stamp}.json`;

  if (isBlobStorageConfigured()) {
    const auth = getDataBlobAuth();
    const client = createVercelBlobClient({ access: BLOB_ACCESS.data, ...auth });
    try {
      const first = await client.putText(probePath, JSON.stringify({ v: 1 }), { overwrite: false });
      add("ok", "Adat store: írás (létrehozás) működik.");

      try {
        await client.putText(probePath, "{}", { overwrite: false });
        add("fail", "Adat store: a második létrehozás nem bukott el — az overwrite:false nem működik.");
      } catch (error) {
        if (error instanceof BlobAlreadyExistsError) {
          add("ok", "Adat store: a „már létezik” hiba felismerhető (BlobAlreadyExistsError).");
        } else {
          add("warn", `Adat store: a „már létezik” hiba más típusú: ${error instanceof Error ? error.message : error} — a vercel-client.ts regexét igazítani kell.`);
        }
      }

      try {
        await client.putText(probePath, "{}", { ifMatch: '"nem-ez-az-etag"' });
        add("fail", "Adat store: az elavult ifMatch nem bukott el — az optimista zárolás nem működik.");
      } catch (error) {
        add(
          error instanceof BlobPreconditionError ? "ok" : "warn",
          error instanceof BlobPreconditionError
            ? "Adat store: az elavult ifMatch elutasított (BlobPreconditionError)."
            : `Adat store: az ifMatch hibája más típusú: ${error instanceof Error ? error.message : error}`
        );
      }

      const second = await client.putText(probePath, JSON.stringify({ v: 2 }), { ifMatch: first.etag });
      add("ok", "Adat store: a helyes ifMatch-csel az írás sikeres.");

      const fresh = await client.getText(probePath, { fresh: true });
      add(
        fresh?.text === JSON.stringify({ v: 2 }) && fresh.etag === second.etag ? "ok" : "fail",
        "Adat store: a friss olvasás (useCache:false) a legutóbbi írást adja."
      );

      const listed = await client.list("_preflight/");
      add(listed.includes(probePath) ? "ok" : "fail", "Adat store: a list működik.");

      // Privát-e? Közvetlen SDK-put, majd névtelen letöltés.
      const direct = await put(`_preflight/anon-${stamp}.txt`, "titok", {
        access: BLOB_ACCESS.data,
        addRandomSuffix: false,
        allowOverwrite: true,
        ...(auth.storeId ? { storeId: auth.storeId } : {}),
      });
      const anon = await fetch(direct.url);
      add(
        anon.status === 200 ? "fail" : "ok",
        anon.status === 200
          ? "Adat store: a blob NÉVTELENÜL letölthető — a store nem privát! Hozz létre privát store-t."
          : `Adat store: névtelen elérés tiltott (HTTP ${anon.status}) — privát.`
      );
      await client.del([probePath, `_preflight/anon-${stamp}.txt`]);
      add("ok", "Adat store: a törlés lefutott, a próbablobok eltávolítva.");
    } catch (error) {
      add("fail", `Adat store próba megszakadt: ${error instanceof Error ? error.message : error}`);
      try {
        await client.del([probePath, `_preflight/anon-${stamp}.txt`]);
      } catch {
        /* a takarítás best effort */
      }
    }
  } else {
    add("warn", "Adat store nincs konfigurálva — a próba kihagyva.");
  }

  if (isImageBlobConfigured()) {
    const store = createVercelImageStore(getImagesBlobAuth());
    let url: string | undefined;
    try {
      ({ url } = await store.put(`images/_preflight/probe-${stamp}.png`, TINY_PNG, "image/png"));
      const res = await fetch(url);
      add(
        res.status === 200 && (res.headers.get("content-type") ?? "").startsWith("image/")
          ? "ok"
          : "fail",
        res.status === 200
          ? "Képtár: a feltöltött kép névtelenül, képként elérhető (nyilvános)."
          : `Képtár: a kép nem érhető el névtelenül (HTTP ${res.status}) — a képtárnak NYILVÁNOS storenak kell lennie.`
      );
      await store.del([url]);
      add("ok", "Képtár: a törlés lefutott.");
    } catch (error) {
      add("fail", `Képtár próba megszakadt: ${error instanceof Error ? error.message : error}`);
      if (url) {
        try {
          await store.del([url]);
        } catch {
          /* best effort */
        }
      }
    }
  } else {
    add("warn", "Képtár nincs konfigurálva — a próba kihagyva.");
  }

  return items;
}

async function main() {
  loadEnv();

  const items = evaluatePreflight(process.env, { cronPaths: cronPaths() });
  console.log("Konfiguráció:");
  print(items);

  let all = items;
  if (flag("probe")) {
    console.log("\nÉlő próba (csak _preflight/ útvonalon):");
    const probed = await probe();
    print(probed);
    all = [...items, ...probed];
  } else {
    console.log("\nÉlő próba nem futott (--probe kapcsolóval indítható).");
  }

  const failures = all.filter((i) => i.status === "fail").length;
  const warnings = all.filter((i) => i.status === "warn").length;
  console.log(`\nÖsszesen: ${failures} hiba, ${warnings} figyelmeztetés.`);
  process.exit(preflightHasFailures(all) ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
