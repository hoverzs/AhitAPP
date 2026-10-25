import { setOutboundFetchForTesting } from "../../src/lib/outbound-fetch";

export interface RecordedGeminiCall {
  kind: "plan" | "body";
  system: string;
  user: string;
  maxOutputTokens?: number;
  thinkingBudget?: number;
}

export interface StubReply {
  text?: string;
  finishReason?: string;
  /** Teljes HTTP-hiba szimulálása (pl. 500). */
  httpStatus?: number;
}

/**
 * Gemini-válaszok sorból (tervező és szöveg-hívás külön sorral). A hívások
 * rögzítődnek, hogy a promptok és a beállítások ellenőrizhetők legyenek.
 */
export function installGeminiStub() {
  const calls: RecordedGeminiCall[] = [];
  const planReplies: StubReply[] = [];
  const bodyReplies: StubReply[] = [];
  const hooks: { beforePlanReply: (() => Promise<void>) | null } = { beforePlanReply: null };

  setOutboundFetchForTesting(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const system: string = body.systemInstruction?.parts?.[0]?.text ?? "";
    const user: string = body.contents?.[0]?.parts?.[0]?.text ?? "";
    const cfg = body.generationConfig ?? {};
    const kind = system.includes("áhítatsorozatát tervezed") ? "plan" : "body";
    calls.push({
      kind,
      system,
      user,
      maxOutputTokens: cfg.maxOutputTokens,
      thinkingBudget: cfg.thinkingConfig?.thinkingBudget,
    });

    if (kind === "plan" && hooks.beforePlanReply) await hooks.beforePlanReply();

    const queue = kind === "plan" ? planReplies : bodyReplies;
    const reply = queue.shift();
    if (!reply) {
      return new Response(
        JSON.stringify({ error: { code: 500, message: `Nincs előkészített ${kind} válasz.`, status: "INTERNAL" } }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
    if (reply.httpStatus) {
      return new Response(
        JSON.stringify({ error: { code: reply.httpStatus, message: "Szimulált hiba", status: "INTERNAL" } }),
        { status: reply.httpStatus, headers: { "content-type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: reply.text ?? "" }] },
            finishReason: reply.finishReason ?? "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 800,
          candidatesTokenCount: 600,
          thoughtsTokenCount: 300,
          totalTokenCount: 1700,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  return {
    calls,
    planReplies,
    bodyReplies,
    hooks,
    planCalls: () => calls.filter((c) => c.kind === "plan"),
    bodyCalls: () => calls.filter((c) => c.kind === "body"),
    reset() {
      calls.length = 0;
      planReplies.length = 0;
      bodyReplies.length = 0;
      hooks.beforePlanReply = null;
    },
    uninstall() {
      setOutboundFetchForTesting(null);
    },
  };
}

const VERSES = [
  "Zsoltárok 23:1",
  "Máté 6:26",
  "Filippi 4:6-7",
  "Ézsaiás 41:10",
  "Róma 8:28",
  "János 14:27",
  "Zsoltárok 46:2",
];

/** Érvényes heti terv JSON a Gemini válaszához (vagy beillesztett briefhez). */
export function planJson(
  overrides: { theme?: string; verses?: string[]; titlePrefix?: string } = {}
): string {
  const verses = overrides.verses ?? VERSES;
  const weekdays = ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"];
  return JSON.stringify({
    theme: overrides.theme ?? "Csendes bizalom",
    arc: "A nyugtalanságtól a bizalomig.",
    days: weekdays.map((weekday, i) => ({
      weekday,
      title: `${overrides.titlePrefix ?? "Cím"} ${i + 1}`,
      verse: `${verses[i]} — rövid ige ${i + 1}`,
      role: `Szerep ${i + 1}`,
      category: "Bizalom",
      excerpt: `Kivonat ${i + 1}`,
      imageKeywords: "sunrise, path",
    })),
  });
}

const SENTENCE =
  "Isten csendes jelenléte nem a nagy események zajában, hanem a hétköznapok apró pillanataiban lesz világossá számunkra. ";

export const FULL_BODY = [
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

export const TRUNCATED_BODY =
  "### Elmélkedés\n\nHányszor érezzük úgy, hogy egy útkereszteződésnél állunk, és nem tudjuk, merre";
