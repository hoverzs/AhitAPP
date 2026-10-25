/** Napi dinamikus tervezés + teljes áhítat szöveg */
export const GEMINI_PLANNER_MODEL = "gemini-2.5-flash";

/** Kisebb/fallback szöveghívások, ping teszt */
export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";

/** 1. lépés — metadata JSON (rövid) */
export const GEMINI_METADATA_MAX_OUTPUT_TOKENS = 4096;

/**
 * 2. lépés — áhítat markdown (plain text).
 * A gemini-2.5-flash gondolkodási (thinking) tokenjei ugyanebből a keretből
 * fogynak, ezért a keret = korlátozott thinking + a teljes szöveg + tartalék.
 */
export const GEMINI_BODY_MAX_OUTPUT_TOKENS = 4096;

/** Korlátozott gondolkodás a szöveghívásnál (nem kikapcsolva: a szövegminőségért). */
export const GEMINI_BODY_THINKING_BUDGET = 1024;

/** Retry — rövidebb prompt, kisebb gondolkodás, nagyobb kimeneti keret. */
export const GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS = 6144;
export const GEMINI_BODY_RETRY_THINKING_BUDGET = 256;

/** Heti terv (JSON, 7 nap): kimeneti keret és korlátozott gondolkodás. */
export const GEMINI_WEEK_PLAN_MAX_OUTPUT_TOKENS = 8192;
export const GEMINI_WEEK_PLAN_RETRY_MAX_OUTPUT_TOKENS = 12288;
export const GEMINI_WEEK_PLAN_THINKING_BUDGET = 1024;
export const GEMINI_WEEK_PLAN_RETRY_THINKING_BUDGET = 256;

/** Planner temperature */
export const GEMINI_PLANNER_TEMPERATURE = 0.65;

export const GEMINI_PLANNER_RETRY_TEMPERATURE = 0.55;

/** @deprecated — egylépcsős */
export const GEMINI_PLANNER_MAX_OUTPUT_TOKENS = GEMINI_METADATA_MAX_OUTPUT_TOKENS;
export const GEMINI_PLANNER_RETRY_MAX_OUTPUT_TOKENS = GEMINI_BODY_RETRY_MAX_OUTPUT_TOKENS;

export const GEMINI_MAX_OUTPUT_TOKENS = 1200;

/** Csak ENABLE_IMAGE_GENERATION=true esetén — lásd src/lib/features.ts */
export const IMAGEN_MODEL = "imagen-3.0-generate-002";
