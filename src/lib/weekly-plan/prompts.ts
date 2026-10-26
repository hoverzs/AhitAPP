import { addDaysToIsoDate } from "../app-date";
import { SCRIPTURE_SELECTION_GUIDELINES } from "../prompts/gemini-system-prompt";
import { REGISTRY_RETENTION_DAYS } from "./registry";
import { getWeekDates, type PlanRegistry, type WeeklyPlan } from "./types";

/**
 * Heti terv promptjai. A napi áhítat szövegét író (BODY) prompt és a teológiai
 * irányelvek változatlanok — itt csak a TERVEZÉS szövege van.
 */

export const WEEKDAY_NAMES_HU = [
  "Hétfő",
  "Kedd",
  "Szerda",
  "Csütörtök",
  "Péntek",
  "Szombat",
  "Vasárnap",
] as const;

export const WEEK_PLAN_SYSTEM_PROMPT = `Te keresztény áhítat-szerkesztő vagy. Egy hét (hétfőtől vasárnapig, 7 nap) áhítatsorozatát tervezed meg. NEM írsz áhítat szöveget — csak a tervet.

A hét legyen közös teológiai és gondolati ív mentén felépítve, de MINDEN nap legyen önállóan is érthető és értékes: aki csak egy napot olvas el, annak is teljes legyen. A napok ne ismételjék egymás központi gondolatát; az ív fejlődjön (például kiindulás → elmélyítés → gyakorlati élet → hála/reménység).

${SCRIPTURE_SELECTION_GUIDELINES}
- A hét 7 igehelye MIND különbözzön egymástól (más hivatkozás, ne ugyanaz a vers vagy szakasz).
- Ne válassz olyan igehelyet, amely a megadott „már használt” listán szerepel.

Az igehely (verse) formátuma: „Könyv fejezet:vers — rövid magyar szöveg” (1–3 mondat, szó szerinti vagy közérthető fordítás).

KIMENET — egyetlen JSON objektum, { kezdet } { vég }, NINCS kódblokk, NINCS más szöveg:
{
  "theme": "a hét témája (rövid)",
  "arc": "a heti gondolati ív 2–4 mondatban",
  "days": [
    {
      "title": "rövid cím",
      "verse": "Zsoltárok 23:1 — rövid ige",
      "role": "a nap szerepe az ívben, egy mondat",
      "category": "Békesség",
      "excerpt": "max 2 mondat, Facebook-ajánlónak is jó",
      "imageKeywords": "lake, soft light, quiet path"
    }
  ]
}

SZABÁLYOK:
- A "days" tömb PONTOSAN 7 elem, sorrendben hétfő, kedd, szerda, csütörtök, péntek, szombat, vasárnap
- imageKeywords: max. 4 rövid angol szó, vesszővel
- Minden mező kitöltött szöveg legyen`;

/** Ezt a formátumot kérheti a szerkesztő a ChatGPT-től — közvetlenül betölthető. */
export const BRIEF_FORMAT_EXAMPLE = `{
  "theme": "Csendes bizalom",
  "arc": "A hét a nyugtalanságtól a bizalomig vezet: ...",
  "days": [
    {
      "weekday": "Hétfő",
      "title": "Az Úr az én pásztorom",
      "verse": "Zsoltárok 23:1 — Az Úr az én pásztorom, nem szűkölködöm.",
      "role": "Kiindulás: Isten gondoskodása",
      "category": "Bizalom",
      "excerpt": "Rövid, Facebook-ajánlónak is alkalmas kivonat.",
      "imageKeywords": "meadow, sheep, soft light"
    }
  ]
}
// A "days" tömb 7 elemű (hétfőtől vasárnapig). A "verse", "title" kötelező.`;

function usedBlock(registry: PlanRegistry, weekId: string): string {
  const entries = registry.entries.filter((e) => e.weekId !== weekId);
  if (entries.length === 0) {
    return "Az elmúlt időszakból nincs nyilvántartott igehely — válassz erős, friss igéket.";
  }
  const refs = [...new Set(entries.map((e) => e.reference.split(/\s+[—–-]\s+/)[0].trim()))];
  const themes = [
    ...new Set(entries.map((e) => e.theme).filter((t): t is string => Boolean(t))),
  ];
  return [
    `MÁR HASZNÁLT IGEHELYEK (az elmúlt ${REGISTRY_RETENTION_DAYS} napból — kerüld őket):`,
    refs.map((r) => `- ${r}`).join("\n"),
    themes.length
      ? `\nAz elmúlt hetek témái (ne ismételd): ${themes.join("; ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function weekHeader(weekId: string): string {
  return `A hét: ${weekId} (hétfő) – ${addDaysToIsoDate(weekId, 6)} (vasárnap).`;
}

/** A terv szerkeszthető tartalma (állapot és időbélyeg nélkül) — a finomító prompt kiinduló pontja. */
export function planContentForPrompt(plan: WeeklyPlan): string {
  const dates = getWeekDates(plan.weekId);
  return JSON.stringify(
    {
      theme: plan.theme,
      arc: plan.arc,
      days: plan.days.map((d, i) => ({
        weekday: WEEKDAY_NAMES_HU[i],
        date: dates[i],
        title: d.title,
        verse: d.verse,
        role: d.role,
        category: d.category,
        excerpt: d.excerpt,
        imageKeywords: d.imageKeywords ?? "",
      })),
    },
    null,
    2
  );
}

export function buildProposeUserPrompt(params: {
  weekId: string;
  theme?: string;
  brief?: string;
  registry: PlanRegistry;
  /** Autopilot: nincs szerkesztői irány — változatos, a naptárhoz illő téma kell. */
  auto?: boolean;
}): string {
  const direction = params.theme?.trim()
    ? `Téma / irány a szerkesztőtől: ${params.theme.trim()}`
    : params.auto
      ? "Nincs szerkesztői irány: válassz a korábbiaktól eltérő, ívelő és teológiailag összefüggő heti témát. Ha a hétre jelentős keresztény ünnep vagy emléknap esik (pl. reformáció emléknapja, advent, karácsony, húsvét, pünkösd), vedd figyelembe, de a hét maradjon általánosan is érthető."
      : "A szerkesztő nem adott témát: javasolj ívelő, a korábbiaktól eltérő heti témát.";
  const brief = params.brief?.trim()
    ? `\nSZERKESZTŐI BRIEF (tartsd magad hozzá: ha konkrét igéket, sorrendet vagy megkötéseket tartalmaz, azokat vedd át; ami hiányzik, azt egészítsd ki):\n"""\n${params.brief.trim()}\n"""\n`
    : "";

  return `${weekHeader(params.weekId)}

${direction}
${brief}
${usedBlock(params.registry, params.weekId)}

Tervezd meg a hetet a megadott JSON formátumban.`;
}

export function buildRevisePromptUser(params: {
  plan: WeeklyPlan;
  instruction: string;
  registry: PlanRegistry;
}): string {
  return `${weekHeader(params.plan.weekId)}

JELENLEGI TERV (ebből indulj ki — ne kezdd elölről):
${planContentForPrompt(params.plan)}

SZERKESZTŐI MÓDOSÍTÁSI UTASÍTÁS:
"""
${params.instruction.trim()}
"""

Módosítsd a tervet az utasításnak megfelelően. Ami nincs érintve, maradjon SZÓ SZERINT változatlan (ugyanaz a cím, ige, szerep, kivonat). Ha egy igehelyet cserélsz, az új ige különbözzön a hét többi igéjétől és a már használtaktól. Add vissza a TELJES tervet ugyanabban a JSON formátumban.

${usedBlock(params.registry, params.plan.weekId)}`;
}

export function buildRepairUserPrompt(params: {
  weekId: string;
  candidateJson: string;
  problems: string[];
  registry: PlanRegistry;
}): string {
  return `${weekHeader(params.weekId)}

A TERV JAVÍTÁSRA SZORUL:
${params.candidateJson}

PROBLÉMÁK:
${params.problems.map((p) => `- ${p}`).join("\n")}

Cseréld ki CSAK a problémás napok igehelyét (és ha kell, az ahhoz tartozó címet, szerepet, kivonatot) úgy, hogy a hét 7 igehelye különböző legyen, és ne szerepeljen a már használtak között. A többi napot ne változtasd. Add vissza a TELJES tervet ugyanabban a JSON formátumban.

${usedBlock(params.registry, params.weekId)}`;
}

/** Kiegészítő kontextus a napi szöveg-hívás felhasználói részéhez (a rendszer-prompt változatlan). */
export function buildDayExtraContext(plan: WeeklyPlan, date: string): string {
  const index = plan.days.findIndex((d) => d.date === date);
  const day = plan.days[index];
  const others = plan.days
    .map((d, i) =>
      d.date === date
        ? null
        : `- ${WEEKDAY_NAMES_HU[i]}: ${d.title || "(még nincs cím)"}${d.role ? ` — ${d.role}` : ""}`
    )
    .filter(Boolean)
    .join("\n");
  const verseIsOnlyReference = !/[—–]/.test(day.verse) && day.verse.length < 60;

  return [
    "HETI SOROZAT KONTEXTUSA (az áhítat ettől még önállóan is teljes és érthető legyen; ne hivatkozz más napokra):",
    `- A hét témája: ${plan.theme}`,
    plan.arc.trim() ? `- A hét íve: ${plan.arc.trim()}` : null,
    `- Ez a nap: ${WEEKDAY_NAMES_HU[index]}${day.role ? ` — ${day.role}` : ""}`,
    "- A hét többi napja (ezek központi gondolatát ne ismételd):",
    others,
    verseIsOnlyReference
      ? "- Az alapige csak hivatkozásként van megadva: az ### Alapige szekcióban idézd a vers szövegét pontosan, magyarul."
      : null,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
