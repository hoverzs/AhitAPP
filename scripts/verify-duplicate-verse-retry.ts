/**
 * Futtatás: npx tsx scripts/verify-duplicate-verse-retry.ts
 */
import {
  DUPLICATE_VERSE_MAX_ATTEMPTS,
  DUPLICATE_VERSE_EXHAUSTED_MESSAGE,
  buildDuplicateVerseRetryPromptBlock,
  isForbiddenVerseReference,
} from "../src/lib/duplicate-verse-retry";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error("FAIL:", message);
    process.exit(1);
  }
  console.log("OK:", message);
}

const memory = {
  usedVerseReferences: ["Zsoltárok 23:1", "Róma 12:1-2"],
} as Parameters<typeof isForbiddenVerseReference>[1];

assert(
  isForbiddenVerseReference("Zsoltárok 23:1 — Az Úr az én pásztorom", memory),
  "detects used Psalm 23:1"
);
assert(
  !isForbiddenVerseReference("Filippi 4:6-7 — ne aggodalmaskodjatok", memory),
  "allows new reference"
);

const block = buildDuplicateVerseRetryPromptBlock("Zsoltárok 23:1");
assert(
  block.includes("Zsoltárok 23:1") && block.includes("already been used"),
  "retry prompt mentions reference"
);

assert(DUPLICATE_VERSE_MAX_ATTEMPTS === 3, "max 3 attempts");
assert(
  DUPLICATE_VERSE_EXHAUSTED_MESSAGE.includes("friss alapigét"),
  "friendly exhausted message"
);

console.log("\nAll duplicate-verse checks passed.");
