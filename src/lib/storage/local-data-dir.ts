import path from "path";

/**
 * A helyi (local) meghajtó adatmappája. Alapértelmezés: `<projekt>/data`.
 * `AHIT_LOCAL_DATA_DIR` felülbírálja — fejlesztéshez / böngészős teszthez,
 * hogy a próbaadat ne a repóban lévő mintafájlokba kerüljön.
 */
export function getLocalDataDir(): string {
  const configured = process.env.AHIT_LOCAL_DATA_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "data");
}
