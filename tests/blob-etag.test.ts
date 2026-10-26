import assert from "node:assert/strict";
import test from "node:test";
import { mutateJsonDocument } from "../src/lib/storage/blob/json-cas";
import { normalizeBlobEtag } from "../src/lib/storage/blob/vercel-client";
import type { BlobGetOptions, BlobPutOptions, JsonBlobClient } from "../src/lib/storage/blob/client";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";

test("ETag normalizálás: a CDN gyenge / tömörített ETag-je erős alakra hozva (valódi megfigyelt értékekkel)", () => {
  const strong = '"05272684121a831391e80c0743e91ace"';
  assert.equal(normalizeBlobEtag(`W/${strong}`), strong, "gyenge előtag (brotli)");
  assert.equal(normalizeBlobEtag(strong), strong, "az erős változatlan");
  assert.equal(normalizeBlobEtag('"05272684121a831391e80c0743e91ace-br"'), strong, "-br utótag");
  assert.equal(normalizeBlobEtag('W/"05272684121a831391e80c0743e91ace-gzip"'), strong, "gyenge + -gzip");
  assert.equal(normalizeBlobEtag(`  ${strong} `), strong, "szóközök");
  assert.equal(normalizeBlobEtag(""), "");
});

/**
 * A Blob CDN viselkedésének szimulációja: a ~1 KB-nál nagyobb dokumentum
 * olvasásakor gyenge ETag-et (`W/"…"`) ad, az írás feltétele viszont az erős
 * ETag. `normalize` = az éles adapter viselkedése.
 */
function edgeClient(inner: MemoryBlobClient, normalize: boolean): JsonBlobClient {
  const norm = (etag: string) => (normalize ? normalizeBlobEtag(etag) : etag);
  return {
    async getText(pathname: string, options?: BlobGetOptions) {
      const result = await inner.getText(pathname, options);
      if (!result) return null;
      const weak = result.text.length > 1000 ? `W/${result.etag}` : result.etag;
      return { text: result.text, etag: norm(weak) };
    },
    async putText(pathname: string, text: string, options?: BlobPutOptions) {
      return inner.putText(pathname, text, {
        ...options,
        ...(options?.ifMatch ? { ifMatch: norm(options.ifMatch) } : {}),
      });
    },
    del: (paths) => inner.del(paths),
    list: (prefix) => inner.list(prefix),
  };
}

const parse = (text: string) => JSON.parse(text) as { items: string[] };
const BIG = "x".repeat(1500);

test("regresszió: nagyobb dokumentum ütközésbiztos újraírása a gyenge ETag miatt normalizálás nélkül elbukik", async () => {
  const inner = new MemoryBlobClient();
  const broken = edgeClient(inner, false);
  await broken.putText("doc.json", JSON.stringify({ items: [BIG] }), { overwrite: false });

  await assert.rejects(
    mutateJsonDocument(broken, "doc.json", parse, (cur) => ({ items: [...(cur?.items ?? []), "új"] }), { backoffMs: 0 }),
    /Egyidejű módosítás miatt nem sikerült menteni/
  );
});

test("javítva: normalizált ETag-gel a nagy dokumentum is újraírható, ismételten és egyidejűleg is", async () => {
  const inner = new MemoryBlobClient();
  const client = edgeClient(inner, true);
  await client.putText("doc.json", JSON.stringify({ items: [BIG] }), { overwrite: false });

  const first = await mutateJsonDocument(client, "doc.json", parse, (cur) => ({
    items: [...(cur?.items ?? []), "a"],
  }));
  assert.deepEqual(first.items, [BIG, "a"]);

  await Promise.all(
    ["b", "c", "d"].map((item) =>
      mutateJsonDocument(client, "doc.json", parse, (cur) => ({ items: [...(cur?.items ?? []), item] }), {
        backoffMs: 0,
      })
    )
  );
  const final = parse((await client.getText("doc.json"))!.text);
  assert.equal(final.items.length, 5, "egyetlen módosítás sem veszett el");
  assert.ok(["b", "c", "d"].every((i) => final.items.includes(i)));
});

test("a kis dokumentum (erős ETag) továbbra is működik", async () => {
  const client = edgeClient(new MemoryBlobClient(), true);
  await client.putText("small.json", JSON.stringify({ items: ["a"] }), { overwrite: false });
  const next = await mutateJsonDocument(client, "small.json", parse, (cur) => ({ items: [...(cur?.items ?? []), "b"] }));
  assert.deepEqual(next.items, ["a", "b"]);
});
