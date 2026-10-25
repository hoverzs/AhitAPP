process.env.STORAGE_DRIVER = "blob";
process.env.NEXT_PUBLIC_SITE_URL = "https://ahitapp.example";
process.env.GEMINI_API_KEY = "test-key";
delete process.env.GOOGLE_API_KEY;
delete process.env.PEXELS_API_KEY;

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  GEMINI_BODY_MAX_OUTPUT_TOKENS,
  GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS,
  GEMINI_BODY_RETRY_THINKING_BUDGET,
  GEMINI_BODY_THINKING_BUDGET,
} from "../src/lib/config";
import { getAppTodayIso } from "../src/lib/app-date";
import { setBlobClientForTesting } from "../src/lib/storage";
import { MemoryBlobClient } from "../src/lib/storage/blob/memory-client";
import { isRetriableCronGenerationError } from "../src/lib/generation-job-runner";
import { toGeminiErrorDetails } from "../src/lib/gemini-errors";
import { setOutboundFetchForTesting } from "../src/lib/outbound-fetch";

interface GeminiCall {
  kind: "metadata" | "body";
  maxOutputTokens?: number;
  thinkingBudget?: number;
}

const SENTENCE =
  "Isten csendes jelenléte nem a nagy események zajában, hanem a hétköznapok apró pillanataiban lesz világossá számunkra. ";
const FULL_BODY = [
  "### Elmélkedés",
  "",
  SENTENCE.repeat(9).trim(),
  "",
  "### Mai imádság",
  "",
  "Uram, taníts meg figyelni a te csendes hangodra ma és minden nap. Ámen.",
  "",
  "### Gondolatébresztő kérdés",
  "",
  "Hol vetted észre ma Isten jelenlétét a hétköznapokban?",
].join("\n");
const TRUNCATED_BODY = "### Elmélkedés\n\nHányszor érezzük úgy, hogy egy útkereszteződésnél állunk, és nem tudjuk, merre";

const METADATA = JSON.stringify({
  title: "Csendes jelenlét",
  scripture: "Példabeszédek 4:18 — Az igazak ösvénye olyan, mint a felkelő nap fénye.",
  category: "Önreflexió",
  excerpt: "Isten csendes jelenléte.",
  imageKeywords: "sunrise, path",
});

type BodyReply = { text: string; finishReason: string };

let calls: GeminiCall[] = [];
let bodyReplies: BodyReply[] = [];

beforeEach(() => {
  calls = [];
  bodyReplies = [];
  setBlobClientForTesting(new MemoryBlobClient());
  setOutboundFetchForTesting(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const cfg = body.generationConfig ?? {};
    const isMetadata = cfg.responseMimeType === "application/json";
    calls.push({
      kind: isMetadata ? "metadata" : "body",
      maxOutputTokens: cfg.maxOutputTokens,
      thinkingBudget: cfg.thinkingConfig?.thinkingBudget,
    });
    const reply: BodyReply = isMetadata
      ? { text: METADATA, finishReason: "STOP" }
      : (bodyReplies.shift() ?? { text: FULL_BODY, finishReason: "STOP" });
    return new Response(
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: reply.text }] }, finishReason: reply.finishReason },
        ],
        usageMetadata: {
          promptTokenCount: 900,
          candidatesTokenCount: 120,
          thoughtsTokenCount: 700,
          totalTokenCount: 1720,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });
});

afterEach(() => {
  setOutboundFetchForTesting(null);
});

const metadata = {
  title: "Csendes jelenlét",
  scripture: "Példabeszédek 4:18 — x",
  category: "Önreflexió",
  excerpt: "x",
};
const memory = { targetDate: "2026-10-25" } as never;

test("teljes válasz: egy hívás, korlátozott thinking és nagyobb kimeneti keret", async () => {
  const { fetchDevotionalMarkdown } = await import("../src/lib/gemini-planner");
  const result = await fetchDevotionalMarkdown(metadata, memory);

  assert.equal(result.textComplete, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].maxOutputTokens, GEMINI_BODY_MAX_OUTPUT_TOKENS);
  assert.equal(calls[0].thinkingBudget, GEMINI_BODY_THINKING_BUDGET);
  assert.ok(GEMINI_BODY_THINKING_BUDGET > 0, "a gondolkodás nincs kikapcsolva");
  assert.ok(
    GEMINI_BODY_MAX_OUTPUT_TOKENS >= GEMINI_BODY_THINKING_BUDGET + 2000,
    "a thinking után is marad hely a teljes szövegnek"
  );
});

test("megszakadt válasz után újrapróbálás kisebb gondolkodással és nagyobb kerettel", async () => {
  bodyReplies = [
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
    { text: FULL_BODY, finishReason: "STOP" },
  ];
  const { fetchDevotionalMarkdown } = await import("../src/lib/gemini-planner");
  const result = await fetchDevotionalMarkdown(metadata, memory);

  assert.equal(result.textComplete, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].maxOutputTokens, GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS);
  assert.equal(calls[1].thinkingBudget, GEMINI_BODY_RETRY_THINKING_BUDGET);
  assert.ok(GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS > GEMINI_BODY_MAX_OUTPUT_TOKENS);
  assert.ok(GEMINI_BODY_RETRY_THINKING_BUDGET < GEMINI_BODY_THINKING_BUDGET);
});

test("kétszer megszakadt válasz hiányosnak jelölt, a hívások száma korlátos", async () => {
  bodyReplies = [
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
  ];
  const { fetchDevotionalMarkdown } = await import("../src/lib/gemini-planner");
  const result = await fetchDevotionalMarkdown(metadata, memory);

  assert.equal(result.textComplete, false);
  assert.ok(result.incompleteReasons.includes("gemini_token_cutoff"));
  assert.equal(calls.length, 2);
});

test("a tokenhasználat naplózódik, titkos adat nélkül", async () => {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    const { fetchDevotionalMarkdown } = await import("../src/lib/gemini-planner");
    await fetchDevotionalMarkdown(metadata, memory);
  } finally {
    console.log = original;
  }
  const line = lines.find((l) => l.includes("[devotional-generation]"));
  assert.ok(line, "van generálási diagnosztikai sor");
  assert.match(line!, /"finishReason":"STOP"/);
  assert.match(line!, /"thoughtsTokens":700/);
  assert.match(line!, /"thinkingBudget":1024/);
  assert.equal(line!.includes("test-key"), false);
});

test("automatikus generálás: a teljes szöveg mentődik", async () => {
  const { autoGenerateDailyDevotional } = await import("../src/lib/generate-devotional");
  const date = getAppTodayIso();
  const result = await autoGenerateDailyDevotional(date, { forcePublished: true });

  assert.equal(result.devotional.date, date);
  assert.equal(result.devotional.status, "published");
  assert.equal(result.devotional.lastApiError, undefined);
});

test("automatikus generálás: a hiányos szöveg nem mentődik, újrapróbálható hibát ad", async () => {
  bodyReplies = [
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
  ];
  const { autoGenerateDailyDevotional, INCOMPLETE_AUTO_GENERATION_MESSAGE } = await import(
    "../src/lib/generate-devotional"
  );
  const { getDevotionalByDate } = await import("../src/lib/devotionals");
  const date = getAppTodayIso();

  await assert.rejects(autoGenerateDailyDevotional(date, { forcePublished: true }), (error) => {
    assert.equal(toGeminiErrorDetails(error).code, "MAX_TOKENS");
    assert.equal((error as Error).message, INCOMPLETE_AUTO_GENERATION_MESSAGE);
    assert.equal(isRetriableCronGenerationError(error), true);
    return true;
  });
  assert.equal(await getDevotionalByDate(date), undefined, "hiányos áhítat nem kerül a tárolóba");
});

test("a futtató hiányos szöveg után nem 'sikeres', hanem pending_retry állapotot ad", async () => {
  bodyReplies = [
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
    { text: TRUNCATED_BODY, finishReason: "MAX_TOKENS" },
  ];
  const { runGenerationAttempt } = await import("../src/lib/generation-job-runner");
  const { getDevotionalByDate } = await import("../src/lib/devotionals");
  const date = getAppTodayIso();

  const result = await runGenerationAttempt(date, { trigger: "cron" });
  assert.equal(result.success, false);
  assert.equal(result.job.status, "pending_retry");
  assert.ok(result.job.next_retry_at);
  assert.equal(await getDevotionalByDate(date), undefined);

  // Az óránkénti újrapróba nem esedékes azonnal: nem fut le újra.
  const tooEarly = await runGenerationAttempt(date, { trigger: "retry_processor" });
  assert.equal(tooEarly.success, false);
  assert.equal(calls.filter((c) => c.kind === "body").length, 2);

  // Esedékességkor (itt: kézi indítás) a teljes válasz létrehozza és közzéteszi.
  const retry = await runGenerationAttempt(date, { trigger: "manual" });
  assert.equal(retry.success, true);
  assert.equal(retry.devotional?.status, "published");
});
