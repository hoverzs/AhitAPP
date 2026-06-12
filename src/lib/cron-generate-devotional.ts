import { toGeminiErrorDetails } from "./gemini-errors";
import type { GeminiErrorDebugInfo } from "./gemini-error-labels";
import { isCronGenerationEnabled } from "./dev-review";
import { isProductionDeployment } from "./cron-env";
import { readDevotionals } from "./devotionals";
import { GenerationSkippedError } from "./generate-devotional";
import { TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE } from "./devotional-text-complete";
import { getDevotionalByDate, getTodayDateIso } from "./generation-target";
import {
  processDueGenerationRetries,
  runGenerationAttempt,
} from "./generation-job-runner";
import { MAX_AUTO_RETRIES } from "./generation-job-schedule";
import { toAdminJobSummary } from "./generation-job-types";
import { isPexelsConfigured } from "./pexels";
import { getAppTodayIso, logAppDateDebug } from "./app-date";

export type CronGenerateOutcome =
  | "created"
  | "skipped"
  | "blocked_env"
  | "error"
  | "pending_retry";

export interface CronGenerateResult {
  outcome: CronGenerateOutcome;
  message: string;
  date: string;
  timestamp: string;
  devotional?: {
    dayNumber: number;
    date: string;
    title: string;
    status?: string;
    imageUrl?: string;
    imageSource?: string;
    pexelsPhotoId?: number;
  };
  error?: string;
  code?: string;
  hint?: string;
  debug?: GeminiErrorDebugInfo;
  generationJob?: ReturnType<typeof toAdminJobSummary>;
}

function cronLog(message: string, meta?: Record<string, unknown>): void {
  console.log(`[cron/generate-devotional] ${new Date().toISOString()} — ${message}`, meta ?? "");
}

function cronWarn(message: string, meta?: Record<string, unknown>): void {
  console.warn(`[cron/generate-devotional] ${new Date().toISOString()} — ${message}`, meta ?? "");
}

function logPexelsResult(devotional: {
  dayNumber: number;
  imageUrl?: string;
  imageSource?: string;
  pexelsPhotoId?: number;
}): void {
  if (devotional.imageUrl && devotional.imageSource?.startsWith("pexels")) {
    cronLog("Pexels kép sikeresen hozzárendelve", {
      dayNumber: devotional.dayNumber,
      imageSource: devotional.imageSource,
      pexelsPhotoId: devotional.pexelsPhotoId,
    });
    return;
  }

  if (isPexelsConfigured()) {
    cronWarn("Pexels: nincs megfelelő kép — fallback kép lesz a publikus oldalon", {
      dayNumber: devotional.dayNumber,
    });
  } else {
    cronWarn("Pexels: API kulcs nincs beállítva — fallback kép lesz a publikus oldalon", {
      dayNumber: devotional.dayNumber,
    });
  }
}

export async function runDailyCronGeneration(options?: {
  force?: boolean;
}): Promise<CronGenerateResult> {
  const force = options?.force === true;
  const timestamp = new Date().toISOString();
  const date = getAppTodayIso();

  logAppDateDebug("cron/generate-devotional:start", { date, force });
  cronLog("Generálás indítva", {
    date,
    appToday: getTodayDateIso(),
    force,
    vercelEnv: process.env.VERCEL_ENV ?? "local",
    nodeEnv: process.env.NODE_ENV,
  });

  if (!force && !isProductionDeployment()) {
    const message =
      "Cron generálás csak production környezetben fut (VERCEL_ENV=production). Teszthez: ?force=1";
    cronLog(message);
    return { outcome: "blocked_env", message, date, timestamp };
  }

  if (!isCronGenerationEnabled()) {
    const message = "Automatikus generálás kikapcsolva.";
    cronLog(message);
    return { outcome: "blocked_env", message, date, timestamp };
  }

  try {
    const dueRetry = await processDueGenerationRetries();
    if (!("processed" in dueRetry) && dueRetry.success && dueRetry.devotional) {
      const d = dueRetry.devotional;
      logPexelsResult(d);
      cronLog("Esedékes óránkénti retry sikeres", {
        dayNumber: d.dayNumber,
        retry_count: dueRetry.job.retry_count,
      });
      return {
        outcome: dueRetry.skipped ? "skipped" : "created",
        message: `A ${d.dayNumber}. nap (${d.date}) sikeresen generálva (ütemezett retry).`,
        date,
        timestamp,
        devotional: {
          dayNumber: d.dayNumber,
          date: d.date,
          title: d.title,
          status: d.status,
          imageUrl: d.imageUrl,
          imageSource: d.imageSource,
          pexelsPhotoId: d.pexelsPhotoId,
        },
        generationJob: toAdminJobSummary(dueRetry.job),
      };
    }

    const attempt = await runGenerationAttempt(date, { trigger: "cron" });
    const jobSummary = toAdminJobSummary(attempt.job);

    if (attempt.success && attempt.devotional) {
      const d = attempt.devotional;
      logPexelsResult(d);

      const truncated = d.status === "needs_review";

      cronLog(
        truncated ? "Generálás kész — félbeszakadt, ellenőrzés szükséges" : "Sikeres generálás és közzététel",
        {
          dayNumber: d.dayNumber,
          date: d.date,
          status: d.status,
          title: d.title,
          retry_count: attempt.job.retry_count,
        }
      );

      return {
        outcome: attempt.skipped ? "skipped" : "created",
        message: truncated
          ? `A ${d.dayNumber}. nap (${d.date}) generálva — ${TRUNCATED_DEVOTIONAL_REVIEW_MESSAGE}`
          : attempt.skipped
            ? `Már van áhítat: ${d.dayNumber}. nap — „${d.title}”.`
            : `A ${d.dayNumber}. nap (${d.date}) sikeresen generálva és közzétéve.`,
        date,
        timestamp,
        devotional: {
          dayNumber: d.dayNumber,
          date: d.date,
          title: d.title,
          status: d.status,
          imageUrl: d.imageUrl,
          imageSource: d.imageSource,
          pexelsPhotoId: d.pexelsPhotoId,
        },
        generationJob: jobSummary,
      };
    }

    if (attempt.success && attempt.skipped) {
      const history = await readDevotionals();
      const existing = getDevotionalByDate(history, date);
      return {
        outcome: "skipped",
        message: existing
          ? `Már van áhítat: ${existing.dayNumber}. nap — „${existing.title}”.`
          : "Generálás kihagyva.",
        date,
        timestamp,
        devotional: existing
          ? {
              dayNumber: existing.dayNumber,
              date: existing.date,
              title: existing.title,
              status: existing.status,
              imageUrl: existing.imageUrl,
              imageSource: existing.imageSource,
              pexelsPhotoId: existing.pexelsPhotoId,
            }
          : undefined,
        generationJob: jobSummary,
      };
    }

    if (attempt.job.status === "pending_retry") {
      return {
        outcome: "pending_retry",
        message:
          attempt.error ??
          "Az első generálási kísérlet sikertelen — automatikus újrapróbák ütemezve.",
        date,
        timestamp,
        error: attempt.error,
        code: attempt.code,
        hint: `Legfeljebb ${MAX_AUTO_RETRIES} óránkénti automatikus újrapróba (+1h, +2h, +3h az első hiba után). Hobby plan: külső ütemező vagy admin hívás szükséges az esedékes retry-khoz.`,
        generationJob: jobSummary,
      };
    }

    const details = toGeminiErrorDetails(
      new Error(attempt.error ?? "Generálás sikertelen.")
    );

    return {
      outcome: "error",
      message: details.message,
      date,
      timestamp,
      error: details.message,
      code: attempt.code ?? details.code,
      hint: details.hint,
      generationJob: jobSummary,
    };
  } catch (error) {
    if (error instanceof GenerationSkippedError) {
      const history = await readDevotionals();
      const existing = getDevotionalByDate(history, date);

      cronLog("Már létezik áhítat erre a napra — kihagyva (nincs felülírás)", {
        date,
        reason: error.reason,
        dayNumber: existing?.dayNumber,
        title: existing?.title,
      });

      return {
        outcome: "skipped",
        message: existing
          ? `Már van áhítat: ${existing.dayNumber}. nap — „${existing.title}”.`
          : error.reason,
        date,
        timestamp,
        devotional: existing
          ? {
              dayNumber: existing.dayNumber,
              date: existing.date,
              title: existing.title,
              status: existing.status,
              imageUrl: existing.imageUrl,
              imageSource: existing.imageSource,
              pexelsPhotoId: existing.pexelsPhotoId,
            }
          : undefined,
      };
    }

    const details = toGeminiErrorDetails(error);
    return {
      outcome: "error",
      message: details.message,
      date,
      timestamp,
      error: details.message,
      code: details.code,
      hint: details.hint,
      ...(details.debug ? { debug: details.debug } : {}),
    };
  }
}
