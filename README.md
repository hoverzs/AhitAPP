# Napi ÁhitAPP

Minimalista Next.js alkalmazás napi keresztény áhítatok kezelésére és megjelenítésére. Helyi JSON adatbázis, Google AI (Gemini + Imagen) generálással.

## Tech stack

- **Next.js 15** (App Router)
- **Tailwind CSS**
- **`data/devotionals.json`** — helyi adattár
- **Google AI Studio** — beépített API kulcs (`src/lib/config.ts`)

## Útvonalak

| Útvonal | Leírás |
|---------|--------|
| `/` | Archívum — összes nap listája |
| `/nap/[id]` | Nyilvános áhítat oldal (nap száma) |
| `/admin` | Jelszóval védett generátor panel |
| `GET /api/cron/generate-daily` | Napi automatikus generálás (Vercel Cron) |

## Telepítés

```bash
npm install
```

Opcionális `.env.local` (csak admin jelszó és publikus URL):

```env
ADMIN_PASSWORD=erős-jelszó
CRON_SECRET=hosszú-véletlen-string
NEXT_PUBLIC_SITE_URL=https://a-te-domainod.hu
```

Az admin jelszót a `.env.local` fájlban állítsd be (`ADMIN_PASSWORD`). Ha nincs megadva, a kód alapértelmezése: `devotional-admin` — élesben mindig használj saját, erős jelszót.

Fejlesztői szerver:

```bash
npm run dev
```

## Admin használat

1. Menj a `/admin` oldalra.
2. Add meg az admin jelszót.
3. Kattints a **KÖVETKEZŐ NAP GENERÁLÁSA** gombra.
4. A rendszer párhuzamosan generál magyar szöveget (Gemini) és képet (Imagen), majd menti a `data/devotionals.json` fájlba.

## Automatikus napi generálás (Vercel Cron)

A `vercel.json` minden nap **03:00 UTC**-kor futtatja a cron-t (≈ **04:00** magyar téli idő, CET).

1. Állíts be `CRON_SECRET` értéket a Vercel projekt **Environment Variables** között.
2. Deploy után a Vercel automatikusan `Authorization: Bearer <CRON_SECRET>` fejlécet küld.
3. A cron a következő sorozat-napot generálja (ugyanaz a logika, mint az admin gomb).

Kézi teszt (fejlesztés):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/generate-daily
```

**Fontos (Vercel):** a szerverless futtatókban a `data/devotionals.json` és a `public/images` módosításai **nem maradnak meg** újraindítás után. Éles Vercel-deployhoz tartós tároló kell (pl. Vercel Blob, adatbázis, vagy git-alapú deploy workflow). Helyi gépen / VPS-en a cron teljes egészében működik.

## Dinamikus memória és téma-tervezés (Gemini 1.5 Pro)

A napi generálás **nem** statikus 30 napos fájlt követ — a teljes `data/devotionals.json` előzményt beolvassa, és a Gemini 1.5 Pro:

- kiválasztja a következő sorszámú napot (`max + 1`),
- **soha nem ismétel** korábbi verset/címet,
- fenntartja a heti/témakör logikát (Békesség → Reménység stb.),
- egy hívásban generálja: `dayNumber`, `title`, `verse`, `content`, `category`, kép prompt.

Cron: `GET/POST /api/cron/generate-daily` + `CRON_SECRET`.

Opcionális kezdeti terv sablon: `src/config/readingPlan.json` (csak UI/fallback, nem köti a generátort).

## Testreszabás

- **API kulcs:** `src/lib/config.ts` → `GOOGLE_AI_API_KEY`
- **Rendszerprompt:** `src/lib/prompts.ts` → `DEVOTIONAL_SYSTEM_PROMPT`
- **Olvasási terv prompt:** `src/lib/prompts/reading-plan-prompt.ts`
- **Fix terv fájl:** `src/config/readingPlan.json`

## Megjegyzések

- A generált képek a `public/images/devotionals/` mappába kerülnek.
- Az API kulcs csak szerveroldali route-okban fut; ne tedd `NEXT_PUBLIC_` prefix alá.
- Ha a repót nyilvánosan osztod meg, a kulcsot érdemes a Google Cloud Console-ban rotálni.
