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
