# Redis → Vercel Blob áttérés: ellenőrzőlista (E fázis, B forgatókönyv)

**Kiindulópont:** a régi Redis-adatokat nem hozzuk át, új tartalommal indulunk, a korábbi képeket
sem másoljuk. Az áhítatok szövege és az admin adatok **privát** Blob store-ban vannak, a feltöltött
képek **nyilvános** Blob store-ban. A Redis-adatbázist nem töröljük.

Jelölés: **TE** = te végzed · **KÓD** = én futtatom, jóváhagyásod után · 🛑 megállási pont ·
✅ kész · ☐ hátra van. A Blob meghajtó csak a `STORAGE_DRIVER=blob` beállítással kapcsol be;
addig az éles oldal változatlan.

---

## 1. Állapot (2026-10-25)

| Elem | Állapot |
|---|---|
| `ahit-data` store | ✅ **Private**, `iad1`, `store_V387hX4CachqfIao`, a projekt Production környezetéhez kötve |
| `ahit-images` store | ✅ **Public**, `iad1`, `store_7vD7Lezpgn7HQRFk`, a projekthez kötve (Preview, Production), prefix `BLOB_IMAGES` |
| Csomag | ✅ Hobby (nincs fizetős szolgáltatás) |
| Adat store élő próba (valódi Blob) | ✅ 8/8: írás, „már létezik” hiba, `ifMatch`, friss olvasás, `list`, **névtelen elérés tiltott (403)**, törlés |
| Képtár élő próba | ☐ **nem futtatható helyből** (lásd 2. pont) |
| `STORAGE_DRIVER` | ✅ **nincs beállítva** (a Redis az aktív tároló) |
| `DEVOTIONAL_RETENTION_AUTO_DELETE` | ✅ **nincs beállítva** |
| Napszámozás | ✅ megszűnt: az azonosító a dátum (`/devotional/YYYY-MM-DD`), nincs mit beállítani |

### Production környezeti változók (a Vercel `env ls` szerint, értékek nélkül)

| Változó | Típus | Megjegyzés |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Config, Production | az **adat store** tokenje; az alkalmazás ezt használja az adatokhoz |
| `BLOB_IMAGES_STORE_ID` | Config, Preview+Production | a képtár azonosítója |
| `BLOB_IMAGES_READ_WRITE_TOKEN` | Secret, Preview+Production | a képtár tokenje (nem olvasható vissza) |
| `BLOB_IMAGES_WEBHOOK_PUBLIC_KEY` | Config | a Vercel hozza létre, az app nem használja |
| `ADMIN_PASSWORD`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY`, `PEXELS_API_KEY` | Secret | megvannak |
| `KV_REST_API_*`, `KV_URL`, `REDIS_URL` | Secret | maradnak (a Redis-visszaút) |
| `STORAGE_DRIVER` | – | **még nincs** (ez az átállás utolsó lépése) |

Az alkalmazás pontosan ezeket a neveket olvassa (`BLOB_READ_WRITE_TOKEN` az adathoz,
`BLOB_IMAGES_STORE_ID` + `BLOB_IMAGES_READ_WRITE_TOKEN` a képekhez), további változó nem kell.
A konfiguráció-ellenőrző a Production változónevekre nem jelez hibát.

## 2. Ismert hiány: a képtár élő próbája

A helyi `vercel` CLI mindig **development** OIDC-tokent ad, a Blob API pedig ezt nem fogadja el
(*„OIDC is enabled for this project, but not for the development environment”*), a képtár tokenje
pedig Secret, így nem húzható le helyre. Ezért a képtár **élő** próbája (feltöltés → névtelen letöltés
→ törlés) csak a Production futásban végezhető el. Lehetőségek:

- **A) (ajánlott, nincs extra beállítás):** az átállás utáni első lépésként az adminban feltöltesz egy
  tesztképet egy tesztnapra (lásd az 5. pont). A képfeltöltés hibája **nem érinti** a szövegeket,
  a közzétételt vagy a generálást; ha a képtár nem működik, a Pexels-képek változatlanul mennek,
  és a visszaút (a `STORAGE_DRIVER` törlése) bármikor megvan.
- **B)** A projekt Settings → Security → OIDC beállításánál a development környezetet is engedélyezed,
  és a képtár bekötését kiterjeszted a Developmentre; akkor helyből is lefut a próba.

## 3. Előkészített átállás (semmit nem kapcsol be)

### 3.1 Tiszta lap (B forgatókönyv)

- ✔ Napszám nincs: a Blob üresen indul, a generálás nem igényel korábbi napot. A régi `/nap/<szám>`
  linkek **soha nem** nyitnak meg áhítatot, mindig tájékoztató oldalt kapnak a mai áhítat gombjával.
- ☐ **TE** (opcionális) — A már használt igehelyek listája soronként egy szövegfájlban.
- ☐ **KÓD** — Száraz próba, majd éles (jóváhagyásod után):
  ```bash
  npx tsx scripts/redis-to-blob.ts --seed-meta [--used-verses-file=igek.txt] --env-file=.env.blob.local
  npx tsx scripts/redis-to-blob.ts --seed-meta [--used-verses-file=igek.txt] --confirm=SEED --env-file=.env.blob.local
  ```
  (A `.env.blob.local` helyi, gitignore-olt fájl az adat store tokenjével; a seed csak az adat store metáját írja.)

### 3.2 Az átállás (a Production átkapcsolása)

- ☐ **TE** — Időpont: nem generálás közben. A napi generálás cronja 00:05 UTC, de a Hobby cron
  **±59 percet** késhet; az újrapróbákat külső ütemező hívja.
- ☐ **KÓD/TE** — Átkapcsolás (jóváhagyásod után):
  ```bash
  vercel env add STORAGE_DRIVER production --value blob --yes
  vercel deploy --prod          # vagy: üres commit + push, vagy a Vercel felületén Redeploy
  ```
  A környezeti változó csak új deployjal lép életbe.
- ☐ **KÓD** — Azonnali ellenőrzés az éles oldalon (csak olvasó):
  ```bash
  npx tsx scripts/post-cutover-check.ts https://ahit-app.vercel.app
  ```
  Ellenőrzi: főoldal 200 és nincs hibaoldal, `/api/devotionals` 200 (nincs tárolóhiba), csak közzétett
  napok, a cron és az admin végpontok hitelesítés nélkül 401, a régi nap érthető oldalt ad.

## 4. Visszaút

1. `vercel env rm STORAGE_DRIVER production --yes` (vagy `redis` értékre állítás), majd újabb deploy.
   A Redis-adat és -kód érintetlen; a visszaút csak akkor ad tartalmat, ha az Upstash újra válaszol.
2. A Blob store-okat és a bennük lévő adatot **ne töröld**, amíg a hibát nem értettük meg.

## 5. Átállás utáni kézi ellenőrzés (TE, az adminban)

- ☐ Belépés; nincs tárolóhiba-üzenet; a lista üres, „Új áhítat készítése” látszik
- ☐ „Új áhítat készítése” (Gemini) → a mai nap megjelenik; szerkesztés, mentés, közzététel
- ☐ Főoldal: a közzétett áhítat és a nyolcnapos választó; a közzététel után azonnal frissül
- ☐ **Képtár-teszt:** egy (akár piszkozat) napnál kép feltöltése, cseréje, eltávolítása; a feltöltött
  kép URL-je `…public.blob.vercel-storage.com/images/…`, böngészőből megnyitható; a csere/eltávolítás
  után a régi kép 404-et ad (legfeljebb ~60 mp késéssel)
- ☐ Facebook: a `/devotional/<dátum>` link és az előnézet (cím, leírás, kép)
- ☐ `GET /api/cron/prune-devotionals` Bearer `CRON_SECRET`-tel: **csak előnézetet ad**
- ☐ Másnap: a napi cron legenerálta-e a mai áhítatot? **A Hobby runtime naplók csak 1 óráig maradnak
  meg**, ezért az admin „Diagnosztika” → „Mai automatikus generálás” állapotát nézd (vagy a cron
  időpontja után egy órán belül a Vercel naplót). Elakadásnál: „Mai áhítat generálása most”.
- ☐ Egy hétig: Vercel → Storage → Blob → **Observability** (becslés: ~700 összetett és ~3 000 egyszerű/hó)

## 6. Automatikus törlés bekapcsolása (csak külön jóváhagyással)

- ☐ **KÓD** — Előnézet: `npx tsx scripts/blob-retention.ts --env-file=.env.blob.local`
- ☐ **TE** — Átnézed a törlendő dátumokat és képeket, jóváhagyod.
- ☐ **KÓD** — Első törlés mentéssel: `npx tsx scripts/blob-retention.ts --apply --confirm=DELETE-<n> --env-file=.env.blob.local`
- ☐ **TE/KÓD** — Csak ezután: `DEVOTIONAL_RETENTION_AUTO_DELETE=true` a Productionben (napi cron ~03:00 UTC).
- ☐ A Redis-kód és a `KV_*` változók kivezetése: csak hosszabb, hibátlan működés és a te jóváhagyásod után.

---

## Hobby keretek — amit a mérés és a dokumentáció mutat

**Vercel Blob (Hobby):** 1 GB tárhely · 10 000 egyszerű művelet/hó · 2 000 összetett művelet/hó ·
10 GB adatforgalom/hó. Törlés ingyenes. **A keret túllépésekor a Blob 30 napra elérhetetlen**, nem fizettet.

**Mért becslés (30 nap, konzervatív, memóriabeli Blobbal, `tests/blob-budget.test.ts`):**

| Folyamat | Egyszerű | Összetett |
|---|---|---|
| Sikeres napi generálás (tárolási lépései) | 30 | 10 |
| Sikertelen kísérlet + újrapróba rögzítése | 11 | 2 |
| Admin munkamenet (2 betöltés, 2 nap megnyitása, szerkesztés, visszavonás + közzététel, képfeltöltés) | 38 | 16 |
| Nyilvános gyorsítótár-frissítés | 1 | 0 |
| Retry-hívás / napi retention | 1 / 3 | 0 / 2 |
| **Havi összeg** (30 generálás, 3 újrapróba-nap, 20 admin-nap, óránkénti nyilvános frissítés) | **~2 950 (30%)** | **~690 (34%)** |

A nyilvános pillanatkép ~38 KB, a becsült havi forgalom ~40 MB a 10 GB-ból.

**Egyéb Hobby tényezők:** a cron napi egyszeri futású lehet, pontossága ±59 perc, projektenként 100
engedélyezett · a függvény maximális futásideje 300 s · runtime naplók: **1 óra** · képoptimalizálás:
5 000 átalakítás/hó · a Hobby **nem kereskedelmi, személyes használatra** szól.

**Emulátorral és tesztekkel ellenőrizve (80 teszt):** az írás sorrendje, az egyidejű írások, a
pillanatkép és az index kezelése, a retention minden ága, a képek életciklusa, a konfiguráció-ellenőrzés.
**Valódi Blobbal ellenőrizve (adat store):** `ifMatch`, „már létezik” hiba, friss olvasás, `list`,
privát hozzáférés, törlés. **Még nem ellenőrzött valódi Blobbal:** a képtár nyilvános elérése és
feltöltése, a CDN-gyorsítótár késése felülíráskor (legfeljebb 60 mp).

**Ismert korlátok:** a piszkozatokhoz feltöltött képek a nyilvános képtárban vannak (kitalálhatatlan,
véletlen utótagú URL-lel, de technikailag nyilvánosak). A több objektumot érintő írások nem atomiak;
a `rebuild()` helyreállítja az indexet és a pillanatképet a rekordokból.
