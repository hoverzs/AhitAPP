/** Vercel production deploy — cron csak itt fut automatikusan. */
export function isProductionDeployment(): boolean {
  if (process.env.VERCEL_ENV === "production") return true;
  if (process.env.VERCEL_ENV) return false;
  return process.env.NODE_ENV === "production";
}

export function isVercelPreviewOrDev(): boolean {
  const env = process.env.VERCEL_ENV;
  return env === "preview" || env === "development";
}
