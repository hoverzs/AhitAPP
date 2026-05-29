# Architektúra (stabil rétegek)

```
┌─────────────────────────────────────────────────────────┐
│  UI (page.tsx, komponensek)                             │
│       ↓ csak app-data.ts + display-verse + fallbacks    │
├─────────────────────────────────────────────────────────┤
│  data/devotionals.json  ← egyetlen igazság (közzétéve)  │
├─────────────────────────────────────────────────────────┤
│  generate-devotional.ts                                 │
│       ↓ devotional-memory → gemini-planner → google-ai  │
│       (csak admin /api/generate /api/cron)              │
├─────────────────────────────────────────────────────────┤
│  src/config/readingPlan.json  ← OPCIONÁLIS, csak script │
└─────────────────────────────────────────────────────────┘
```

**Szabály:** A főoldal és layout **soha** ne olvassa a `readingPlan.json`-t.
**Generálás:** Gemini 1.5 Pro a teljes előzmény alapján tervez — nincs 30 napos plafon.
