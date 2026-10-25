import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidIsoDate } from "../src/lib/app-date";
import { buildDevotionalMemory } from "../src/lib/devotional-memory";
import { getPublicDevotionalUrl } from "../src/lib/facebook";
import {
  resolveAutoGenerationTarget,
  resolveManualGenerationTarget,
  resolveRegenerateTarget,
} from "../src/lib/generation-target";
import type { Devotional } from "../src/lib/types";

function devotional(date: string, overrides: Partial<Devotional> = {}): Devotional {
  return {
    date,
    title: `Cím ${date}`,
    verse: "Róma 8:28 — minden javukra szolgál",
    content: "## Szöveg\n\nTartalom.",
    imageUrl: "",
    createdAt: `${date}T08:00:00.000Z`,
    status: "published",
    category: "Hit",
    ...overrides,
  };
}

test("a Devotional rekordban nincs napszám mező", () => {
  assert.equal("dayNumber" in devotional("2026-10-24"), false);
});

test("isValidIsoDate: csak valós naptári nap fogadható el", () => {
  assert.equal(isValidIsoDate("2026-10-24"), true);
  assert.equal(isValidIsoDate("2026-02-30"), false);
  assert.equal(isValidIsoDate("12"), false);
  assert.equal(isValidIsoDate("2026-1-1"), false);
  assert.equal(isValidIsoDate(""), false);
});

test("nyilvános URL: dátum alapú, soha nem /nap/<szám>", () => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";
  const url = getPublicDevotionalUrl("2026-10-24");
  assert.equal(url, "https://ahitapp.example/devotional/2026-10-24");
  assert.equal(url.includes("/nap/"), false);
});

test("generálási cél: dátum alapú, nem függ korábbi napszámtól", () => {
  const today = resolveManualGenerationTarget([]).date;
  assert.equal(isValidIsoDate(today), true);
  assert.equal(resolveManualGenerationTarget([]).action, "create");

  const target = resolveAutoGenerationTarget([], "2026-11-02");
  assert.deepEqual({ action: target.action, date: target.date }, { action: "create", date: "2026-11-02" });

  const skip = resolveAutoGenerationTarget([devotional("2026-11-02")], "2026-11-02");
  assert.equal(skip.action, "skip");

  // Hiányzó korábbi napok nem akadályozzák a mai generálását.
  const gap = resolveAutoGenerationTarget([devotional("2026-01-01")], "2026-11-02");
  assert.equal(gap.action, "create");

  assert.equal(resolveRegenerateTarget([devotional("2026-11-02")], "2026-11-02").action, "update");
  assert.throws(() => resolveRegenerateTarget([], "2026-11-02"), /nem található/);
});

test("generálási memória: üres előzménnyel is működik, a cél a dátum", () => {
  const memory = buildDevotionalMemory([], { targetDate: "2026-11-02" });
  assert.equal(memory.targetDate, "2026-11-02");
  assert.equal(memory.totalPublished, 0);
  assert.equal("nextDayNumber" in memory, false);
});

test("a /nap/<szám> oldal statikus tájékoztató: nem olvas tárolót, nem indexelhető", () => {
  const source = readFileSync("src/app/nap/[id]/page.tsx", "utf-8");
  assert.match(source, /robots:\s*\{\s*index:\s*false/);
  assert.doesNotMatch(source, /getDevotional|devotionals|getDevotionalStorage|redis|blob/i);
  assert.match(source, /href="\/mai"/);
});

test("a forráskódban nincs többé napszám-alapú azonosítás", () => {
  for (const file of [
    "src/lib/types.ts",
    "src/lib/devotionals.ts",
    "src/lib/storage/types.ts",
    "src/lib/facebook.ts",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf-8"), /dayNumber|DayNumber/, file);
  }
});
