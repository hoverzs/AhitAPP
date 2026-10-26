import type { PlanIssues, WeeklyPlan } from "./types";

/** A kért művelet bemenete érvénytelen (HTTP 400). */
export class WeeklyPlanInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeeklyPlanInputError";
  }
}

/** A terv közben megváltozott (más szerkesztette): a friss állapot mellékelve (HTTP 409). */
export class WeeklyPlanConflictError extends Error {
  constructor(public readonly current: WeeklyPlan) {
    super("A terv időközben megváltozott. Töltsd újra, és próbáld újra a módosítást.");
    this.name = "WeeklyPlanConflictError";
  }
}

/** A művelet a terv jelenlegi állapotában nem engedélyezett (HTTP 409). */
export class WeeklyPlanLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeeklyPlanLockedError";
  }
}

/** A jóváhagyás feltételei nem teljesülnek (HTTP 422). */
export class WeeklyPlanNotApprovableError extends Error {
  constructor(public readonly issues: PlanIssues) {
    super("A terv még nem hagyható jóvá.");
    this.name = "WeeklyPlanNotApprovableError";
  }
}

/** A Gemini válaszából nem sikerült érvényes tervet kapni. */
export class WeeklyPlanGenerationError extends Error {
  constructor(message: string, public readonly problems: string[] = []) {
    super(message);
    this.name = "WeeklyPlanGenerationError";
  }
}

/** Napi generálás: a nap már folyamatban van (kettős kattintás / párhuzamos kérés). */
export class DayBusyError extends Error {
  constructor(date: string) {
    super(`A(z) ${date} napi áhítat generálása már folyamatban van.`);
    this.name = "DayBusyError";
  }
}

/** Napi generálás: a nap már kész; újragenerálás csak kifejezett kéréssel. */
export class DayAlreadyReadyError extends Error {
  constructor(date: string) {
    super(`A(z) ${date} napi áhítat már elkészült. Újragenerálásához kérd kifejezetten.`);
    this.name = "DayAlreadyReadyError";
  }
}

/** Napi generálás: az adott napon már van, nem ebből a tervből származó áhítat. */
export class DayConflictError extends Error {
  constructor(date: string, status: string) {
    super(
      `A(z) ${date} napon már van egy másik (nem ebből a heti tervből származó) áhítat (${status}). A felülírását nem engedjük — előbb rendezd kézzel.`
    );
    this.name = "DayConflictError";
  }
}

/** A Gemini szövege hiányos / megszakadt: nem mentettük el. */
export class DayIncompleteError extends Error {
  constructor(date: string) {
    super(
      `A(z) ${date} napi áhítat szövege hiányos vagy félbeszakadt, ezért nem mentettük el. Próbáld újra.`
    );
    this.name = "DayIncompleteError";
  }
}

/** A nap egy jóváhagyott heti tervhez tartozik: a napi (régi) folyamat nem generálhat rá. */
export class ManagedByWeeklyPlanError extends Error {
  constructor(public readonly date: string, public readonly weekId: string) {
    super(
      `A(z) ${date} napot jóváhagyott heti terv kezeli (${weekId}). A napi generálás itt ki van hagyva — használd a heti műhelyt.`
    );
    this.name = "ManagedByWeeklyPlanError";
  }
}

/**
 * Heti sorozatból származó áhítat védett: státusza csak a heti műhely
 * műveleteivel változhat, jóváhagyott állapotban pedig semmilyen szerkesztés
 * nem engedett — a régi admin API-n át sem.
 */
export class WeeklyRecordProtectedError extends Error {
  constructor(
    public readonly date: string,
    public readonly reason: "locked" | "status" | "weekId" | "regenerate"
  ) {
    super(
      reason === "locked"
        ? `A(z) ${date} áhítat jóváhagyott heti áhítat, ezért csak olvasható. A szerkesztéshez előbb vond vissza a jóváhagyást a heti műhelyben.`
        : reason === "status"
          ? `A(z) ${date} áhítat heti sorozat része: a jóváhagyását, közzétételét és visszavonását csak a heti műhely végezheti.`
          : reason === "regenerate"
            ? `A(z) ${date} áhítat heti sorozat része: az újragenerálás a heti műhelyből indítható.`
            : `A(z) ${date} áhítat heti azonosítója nem módosítható.`
    );
    this.name = "WeeklyRecordProtectedError";
  }
}
