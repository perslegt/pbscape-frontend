# OSRS Boss PB Highscores (MVP)

Simpele Next.js website die personal best (PB) tijden voor OSRS bosses
opslaat en toont in een highscore/leaderboard. Een RuneLite plugin kan
PB's insturen via een API endpoint.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** voor styling
- **SQLite** (via `better-sqlite3`) als database — één bestand
  (`data/highscores.db`), geen aparte database server nodig. Later
  makkelijk te vervangen door Postgres/MySQL/Supabase etc., omdat alle
  database-logica gebundeld is in `lib/db.ts`.

## Projectstructuur

```
app/
  page.tsx                 -> Homepage ("Latest updates")
  highscores/page.tsx      -> Highscores pagina (boss-tabs + ranking)
  api/pb-submissions/route.ts -> POST /api/pb-submissions voor de RuneLite plugin
  layout.tsx               -> Layout + navigatie
  globals.css              -> Tailwind setup
lib/
  db.ts                    -> Database laag (SQLite), incl. testdata seed
  formatTime.ts            -> Helper om ms naar "m:ss.SS" te formatteren
  bosses.ts                -> Lijst van bosses (voor UI + testdata)
types/
  pb.ts                    -> Gedeelde TypeScript types
data/
  highscores.db            -> Wordt automatisch aangemaakt bij eerste run
```

## 1. Lokaal installeren

Vereist: Node.js 18+ (aanbevolen: 20 LTS).

```bash
npm install
```

> `better-sqlite3` is een native module. Op de meeste systemen werkt
> `npm install` direct. Kom je build-fouten tegen (bv. ontbrekende
> compiler), installeer dan de "build tools" voor jouw OS (op Windows:
> `npm install --global windows-build-tools`, op macOS: Xcode Command
> Line Tools via `xcode-select --install`).

## 2. Environment variables instellen

Kopieer het voorbeeldbestand:

```bash
cp .env.local.example .env.local
```

Inhoud van `.env.local`:

```
AUTH_DISCORD_ID=
AUTH_DISCORD_SECRET=
AUTH_SECRET=
```

Een RuneLite API-secret wordt na het inloggen bij één gekoppeld RuneScape-account gemaakt.
De volledige secret wordt daar slechts eenmaal getoond en werkt alleen voor de RSN van dat account.

## 3. Lokaal draaien

```bash
npm run dev
```

Open vervolgens [http://localhost:3000](http://localhost:3000).

Bij de eerste keer opstarten wordt automatisch:
- het bestand `data/highscores.db` aangemaakt,
- de tabel `personal_bests` aangemaakt,
- wat testdata geseed (5 spelers x 8 bosses), zodat de homepage en
  highscores pagina meteen gevuld zijn.

Wil je met een lege database beginnen? Verwijder dan gewoon het
bestand `data/highscores.db` en herstart `npm run dev`.

## 4. De API testen

### RuneScape-account verifiëren

Een ingelogde gebruiker start verificatie op de accountpagina. De RuneLite-plugin
voltooit de koppeling zonder API-secret via:

```http
POST /api/game-accounts/verifications/complete
Content-Type: application/json

{
  "rsn": "Rav e",
  "accountHash": "734829104829104829",
  "verificationCode": "PB-7F3K-92QD"
}
```

De code verloopt na 15 minuten en kan slechts eenmaal worden gebruikt. Pas na
succesvolle verificatie kan voor het account een RuneLite-secret worden gemaakt.

De plugin verbindt en synchroniseert een PB-snapshot via:

```http
POST /api/runelite/connect
Authorization: Bearer pb_live_xxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "rsn": "Rav e",
  "accountHash": "734829104829104829",
  "personalBests": []
}
```

### Endpoint

```
POST http://localhost:3000/api/pb-submissions
Content-Type: application/json
Authorization: Bearer pb_live_xxxxxxxxxxxxxxxxx
```

### Body

```json
{
  "rsn": "TestPlayer",
  "accountHash": "734829104829104829",
  "bossSlug": "vorkath",
  "durationMs": 85000
}
```

### Testen met cURL

```bash
curl -X POST http://localhost:3000/api/pb-submissions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer pb_live_xxxxxxxxxxxxxxxxx" \
  -d '{"rsn":"TestPlayer","accountHash":"734829104829104829","bossSlug":"vorkath","durationMs":85000}'
```

Verwacht resultaat (bij een nieuwe/betere PB):

```json
{ "success": true, "result": "FIRST_PERSONAL_BEST", "durationMs": 85000 }
```

Stuur je daarna een **langzamere** tijd voor dezelfde speler/boss, dan
krijg je:

```json
{ "success": true, "result": "NOT_FASTER", "durationMs": 90000, "currentBestMs": 85000 }
```

Stuur je een **snellere** tijd, dan wordt de PB bijgewerkt:

```json
{ "success": true, "result": "NEW_PERSONAL_BEST", "durationMs": 80000, "previousBestMs": 85000 }
```

### Testen met Postman / Bruno

1. Nieuwe request: `POST`
2. URL: `http://localhost:3000/api/pb-submissions`
3. Body: kies **raw** + **JSON**, plak het JSON-voorbeeld hierboven
4. Verstuur en bekijk de response

### Veelvoorkomende foutmeldingen

| Situatie | Response |
|---|---|
| Vereist veld ontbreekt | `400` — "Missing required fields..." |
| `durationMs` is geen geldige positieve integer | `400` — validatiefout |
| Ontbrekende of ongeldige bearer key | `401` — `INVALID_API_KEY` |
| RSN hoort niet bij de eigenaar van de key | `403` — `GAME_ACCOUNT_NOT_LINKED` |

## 5. Wat is er (bewust) nog niet gedaan?

Dit is een MVP. Bewust **niet** aanwezig:
- Geen login/accountsysteem
- Geen admin panel
- Geen uitgebreide styling/animaties
- Geen boss-naam validatie op de API (elke boss-naam wordt geaccepteerd,
  zodat de plugin later ook nieuwe bosses kan insturen zonder dat de
  website-code eerst aangepast hoeft te worden)

Logische vervolgstappen zodra de basis werkt:
- Rate limiting op `/api/pb-submissions`
- Overstappen naar een "echte" database (Postgres) als je naar
  productie/hosting gaat, aangezien SQLite-bestanden niet goed werken
  op sommige serverless hosting platforms (bv. Vercel's read-only
  filesystem) — in dat geval verplaats je de logica in `lib/db.ts` naar
  bv. Postgres via Prisma, zonder de rest van de app aan te passen.
- Pagination op de highscores pagina
- Validatie/whitelist van boss-namen als je dat wilt afdwingen
