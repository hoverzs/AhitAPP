# Redis → Vercel Blob áttérés: ellenőrzőlista (E fázis, B forgatókönyv)

**Kiindulópont:** a régi Redis-adatokat nem hozzuk át, új tartalommal indulunk, a korábbi képeket
sem másoljuk. Az áhítatok szövege és az admin adatok **privát** Blob store-ban vannak, a feltöltött
képek **nyilvános** Blob store-ban. A Redis-adatbázist nem töröljük.

Jelölés: **TE** = te végzed a Vercel felületén · **KÓD** = én futtatom, jóváhagyásod után ·
🛑 megállási pont (jóváhagyás nélkül nem lépünk tovább). A Blob meghajtó csak a
`STORAGE_DRIVER=blob` beállítással kapcsol be; addig az éles oldal változatlan.

---

## 0. Döntések

- ☐ **TE** — **Az utolsó használt napszám.** Az új áhítatok napszáma onnan folytatódjon, ahol a
  régi abbahagyta (a becslés kb. 149, de nem biztos). Ez azért fontos, mert a korábban megosztott
  Facebook-linkek `/nap/<szám>` alakúak: ha az új tartalom 1-től indulna, a régi linkek az **új**
  napok szövegét mutatnák. Folytatólagos számozásnál a régi linkek „már nem érhető el” oldalt adnak.
  Honnan: a legutóbbi Facebook-poszt `/nap/<szám>` linkje, vagy az utolsó éles oldal napszáma.
- ☐ **TE** — Tudomásul veszed a Hobby keretet és feltételeket (lásd alább).
- ☐ **TE** — A használt igehelyek listája (opcionális): ha megvan, soronként egy igehelyet egy
  szövegfájlba teszel, és a generálás nem ismétli őket. Ha nincs, az első hetekben ismétlődhet ige.

## 1. A két Blob store létrehozása

**Mindkét store Vercelen, a te fiókodban jön létre; a hozzáférési mód és a régió utólag nem
módosítható** — létrehozás előtt ellenőrizd.

| | Név (javasolt) | Hozzáférés | Mi kerül bele |
|---|---|---|---|
| 1. | `ahit-data` | **Private** | áhítatok (piszkozatok is), index, nyilvános pillanatkép, meta, generálási feladatok |
| 2. | `ahit-images` | **Public** | csak az admin által feltöltött képek (`images/…`) |

**Régió:** ugyanaz mindkettőnél, és lehetőleg ugyanaz, mint a projekt Function régiója (Project →
Settings → Functions → Function Region; alapértelmezés `iad1`, Washington). Európai olvasóknál a
`fra1` (Frankfurt) jobb késleltetést ad — ilyenkor a Function régiót is állítsd `fra1`-re.

### Út A — Vercel felület

1. Vercel → **Storage** (a projekt vagy a fiók oldalán) → **Create** → **Blob**.
2. Add meg a nevet, állítsd a hozzáférést **Private**-ra, válaszd ki a régiót, **Create**.
3. Ismételd meg a másodikkal: név `ahit-images`, hozzáférés **Public**, ugyanaz a régió.
4. Kösd a projekthez mindkettőt: az adott store oldalán **Projects** fül → **Connect to Project** →
   válaszd az **ahit-app** projektet → környezet: **Production** (a Preview-t most ne).
5. Írd fel mindkét store azonosítóját (store oldalán látható, `store_…` alakú; CLI-ből:
   `vercel blob list-stores --all`).

### Út B — Vercel CLI (a linkelt projekt mappájában)

```bash
vercel blob create-store ahit-data   --access private --region fra1 --yes --environment production
vercel blob create-store ahit-images --access public  --region fra1 --yes --environment production
vercel blob list-stores
```

A `--yes` a linkelt projekthez köti, a `--environment production` csak a Productionhöz.
(Régió megadása nélkül `iad1` az alapértelmezés.)

## 2. Környezeti változók (Vercel → Project → Settings → Environment Variables, csak Production)

A store-ok bekötésekor a Vercel automatikusan beállít néhány változót (`BLOB_STORE_ID`,
`VERCEL_OIDC_TOKEN` — ez utóbbit a Vercel kezeli, `BLOB_READ_WRITE_TOKEN` is megjelenhet). **Két
store esetén ezek a nevek csak az egyik store-ra mutathatnak**, ezért az alkalmazás két külön, kifejezett
változót olvas. Ezeket te adod hozzá:

| Változó | Érték |
|---|---|
| `BLOB_DATA_STORE_ID` | az `ahit-data` store azonosítója |
| `BLOB_IMAGES_STORE_ID` | az `ahit-images` store azonosítója |
| `ADMIN_PASSWORD` | erős, nem alapértelmezett jelszó (≥12 karakter) |
| `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`, `GEMINI_API_KEY`, `PEXELS_API_KEY` | a meglévők maradnak |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | **maradnak** (a Redis-visszaúthoz) |
| `DEVOTIONAL_RETENTION_AUTO_DELETE` | **nincs beállítva** (az automatikus törlést később, külön jóváhagyással kapcsoljuk be) |
| `STORAGE_DRIVER` | **még NEM állítod be** — ez az átállás utolsó lépése |

Hitelesítés: az alkalmazás OIDC-vel éri el a store-okat (nincs hosszú életű titok a kódban). Helyi
futtatáshoz: `vercel env pull .env.local` (a `VERCEL_OIDC_TOKEN` ideiglenes, kb. 12 óra).

## 3. Ellenőrzés a store-ok létrehozása után (KÓD)

- ☐ **KÓD** — Konfiguráció-ellenőrzés (nem csinál hálózati hívást, nem ír):
  ```bash
  npx tsx scripts/blob-preflight.ts --env-file=.env.local
  ```
- ☐ **KÓD** — Élő próba a két store-on (csak a `_preflight/` útvonalon, ~8 összetett és ~4 egyszerű művelet;
  utána törli a próbafájlokat):
  ```bash
  npx tsx scripts/blob-preflight.ts --env-file=.env.local --probe
  ```
  Ez azt ellenőrzi, amit emulátorral nem lehetett: az `ifMatch`-ütközést, a „már létezik” hibaszöveget,
  a friss olvasást, a `list`-et, hogy az **adat store névtelenül nem érhető el**, és hogy a **képtár képe nyilvános**.
  🛑 Minden sor OK legyen. **HIBA esetén megállunk** (pl. ha az adat store véletlenül Public lett: törölni és
  újra Private-ként létrehozni kell).

## 4. Tiszta lap beállítása (KÓD)

- ☐ **KÓD** — Száraz próba, majd éles (jóváhagyásod után):
  ```bash
  npx tsx scripts/redis-to-blob.ts --seed-meta --max-day=<utolsó napszám> --used-verses-file=igek.txt --env-file=.env.local
  npx tsx scripts/redis-to-blob.ts --seed-meta --max-day=<utolsó napszám> --used-verses-file=igek.txt --confirm=SEED-<utolsó napszám> --env-file=.env.local
  ```
  (A `--used-verses-file` elhagyható.) A következő generált nap napszáma `<utolsó napszám>+1` lesz.

## 5. Átállás (a Production átkapcsolása)

- ☐ **TE** — Időpont: nem generálás közben. A napi generálás cronja `00:05 UTC`-re van ütemezve, de a
  Vercel Hobby cron **±59 percet** késhet; az újrapróbákat külső ütemező hívja (01:05–03:05 Bucharest).
- ☐ **TE** — Production: `STORAGE_DRIVER=blob`, majd **redeploy** (a környezeti változó csak új deployjal lép életbe).
- ☐ **TE/KÓD** — Azonnali ellenőrzés:
  - ☐ Admin belépés; nincs tárolóhiba-üzenet; a lista üres, „Új áhítat készítése” látszik
  - ☐ „Új áhítat készítése” (Gemini) → a mai nap megjelenik; szerkesztés, mentés, közzététel
  - ☐ Főoldal: a közzétett mai áhítat és a nyolcnapos választó; a közzététel után azonnal frissül
  - ☐ Kép feltöltése, cseréje, eltávolítása működik; a régi kép eltűnik a képtárból
  - ☐ Facebook: a `/nap/<n>` link és az előnézet (cím, leírás, kép) megjelenik
  - ☐ `GET /api/cron/prune-devotionals` (Bearer `CRON_SECRET`): **csak előnézetet ad**, nem töröl
- ☐ **TE** — Másnap: a napi cron legenerálta a mai áhítatot? **A Hobby runtime naplók csak 1 óráig
  maradnak meg**, ezért ne a naplóból, hanem az admin „Diagnosztika” panelén a „Mai automatikus
  generálás” állapotból ellenőrizd (vagy a cron időpontja után egy órán belül a Vercel naplóból).
  Elakadás esetén az admin „Mai áhítat generálása most” gombja.
- ☐ **TE** — Egy hétig: Vercel → Storage → Blob → **Observability**: az egyszerű és összetett műveletek
  száma (becslés: lásd a Hobby fejezetet).

## 6. Visszaút

1. Production: `STORAGE_DRIVER` törlése (vagy `redis`), redeploy. A Redis-adat és -kód érintetlen;
   a visszaút csak akkor ad tartalmat, ha az Upstash újra válaszol.
2. A Blob store-okat és a bennük lévő adatot **ne töröld**, amíg a hibát nem értettük meg.

## 7. Automatikus törlés bekapcsolása (csak külön jóváhagyással)

- ☐ **KÓD** — Előnézet: `npx tsx scripts/blob-retention.ts --env-file=.env.local`
- ☐ **TE** — Átnézed a törlendő dátumokat és képeket, jóváhagyod.
- ☐ **KÓD** — Első törlés mentéssel: `npx tsx scripts/blob-retention.ts --apply --confirm=DELETE-<n> --env-file=.env.local`
- ☐ **TE** — Csak ezután: `DEVOTIONAL_RETENTION_AUTO_DELETE=true` a Productionben (a napi cron 03:00 UTC körül fut).
- ☐ **KÓD** — A Redis-kód és a `KV_*` változók kivezetése: csak hosszabb, hibátlan működés és a te jóváhagyásod után.

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

A nyilvános pillanatkép ~38 KB, a becsült havi forgalom ~40 MB a 10 GB-ból. A számlálás konzervatív
(minden olvasás egyszerű műveletnek számít, a CDN-találatok a valóságban nem).

**Egyéb Hobby tényezők:**
- A cron napi egyszeri futású lehet (nálunk mindkettő az), pontossága ±59 perc; projektenként 100 cron engedélyezett.
- Függvény maximális futásideje 300 s (a generálás `maxDuration`-je ennyi).
- Runtime naplók megőrzése: **1 óra**.
- Képoptimalizálás: 5 000 átalakítás/hó (a mostani forgalomhoz bőven elég).
- A Hobby csomag **nem kereskedelmi, személyes használatra** szól (Vercel Fair Use).

**Emulátorral és tesztekkel ellenőrizve (80+ teszt):** az írás sorrendje, az egyidejű írások, a pillanatkép és
az index kezelése, a retention minden ága, a képek életciklusa, a konfiguráció-ellenőrzés.

**Csak a valódi Blobbal ellenőrizhető (ezt fedi a `--probe`):** az `ifMatch` és a „már létezik”
hibaszöveg pontos viselkedése, a CDN-gyorsítótár késése (legfeljebb 60 mp felülíráskor), az OIDC hitelesítés
két store mellett, a privát/nyilvános hozzáférés.

**Ismert korlátok:** a piszkozatokhoz feltöltött képek a nyilvános képtárban vannak (kitalálhatatlan, véletlen
utótagú URL-lel, de technikailag nyilvánosak). A több objektumot érintő írások nem atomiak; a `rebuild()`
helyreállítja az indexet és a pillanatképet a rekordokból.
