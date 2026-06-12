import type { AdminDailyGenerationJobSummary } from "./types";
import type { GenerationJobStatus } from "./generation-job-types";

export function generationJobStatusLabel(
  status: GenerationJobStatus | AdminDailyGenerationJobSummary["status"]
): string {
  switch (status) {
    case "running":
      return "Folyamatban";
    case "pending_retry":
      return "Újrapróba ütemezve";
    case "published":
      return "Sikeres (publikálva)";
    case "failed":
      return "Sikertelen";
    default:
      return status;
  }
}

export function formatGenerationJobTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("hu-HU", {
      timeZone: "Europe/Bucharest",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
