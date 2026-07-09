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
  api/pb/route.ts          -> POST /api/pb endpoint voor de RuneLite plugin
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
PB_API_KEY=dev-token
```

Dit is de "wachtwoord"-token die de RuneLite plugin moet meesturen in
het `apiKey` veld. Verander deze waarde gerust naar iets unieks van
jezelf.

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

### Endpoint

```
POST http://localhost:3000/api/pb
Content-Type: application/json
```

### Body

```json
{
  "player": "TestPlayer",
  "boss": "Vorkath",
  "timeMillis": 85000,
  "apiKey": "dev-token"
}
```

### Testen met cURL

```bash
curl -X POST http://localhost:3000/api/pb \
  -H "Content-Type: application/json" \
  -d '{"player":"TestPlayer","boss":"Vorkath","timeMillis":85000,"apiKey":"dev-token"}'
```

Verwacht resultaat (bij een nieuwe/betere PB):

```json
{ "success": true, "message": "New PB saved" }
```

Stuur je daarna een **langzamere** tijd voor dezelfde speler/boss, dan
krijg je:

```json
{ "success": false, "message": "Submitted time is not faster than current PB" }
```

Stuur je een **snellere** tijd, dan wordt de PB bijgewerkt:

```json
{ "success": true, "message": "PB improved and saved" }
```

### Testen met Postman / Bruno

1. Nieuwe request: `POST`
2. URL: `http://localhost:3000/api/pb`
3. Body: kies **raw** + **JSON**, plak het JSON-voorbeeld hierboven
4. Verstuur en bekijk de response

### Veelvoorkomende foutmeldingen

| Situatie | Response |
|---|---|
| Veld ontbreekt (bv. geen `boss`) | `400` — "Missing required field(s)..." |
| `timeMillis` is geen positief getal | `400` — "'timeMillis' must be a positive number" |
| Verkeerde `apiKey` | `401` — "Invalid API key" |
| `PB_API_KEY` niet ingesteld op de server | `500` — "Server misconfiguration: PB_API_KEY not set" |

## 5. Wat is er (bewust) nog niet gedaan?

Dit is een MVP. Bewust **niet** aanwezig:
- Geen login/accountsysteem
- Geen admin panel
- Geen uitgebreide styling/animaties
- Geen boss-naam validatie op de API (elke boss-naam wordt geaccepteerd,
  zodat de plugin later ook nieuwe bosses kan insturen zonder dat de
  website-code eerst aangepast hoeft te worden)

Logische vervolgstappen zodra de basis werkt:
- Rate limiting / betere auth op `/api/pb`
- Overstappen naar een "echte" database (Postgres) als je naar
  productie/hosting gaat, aangezien SQLite-bestanden niet goed werken
  op sommige serverless hosting platforms (bv. Vercel's read-only
  filesystem) — in dat geval verplaats je de logica in `lib/db.ts` naar
  bv. Postgres via Prisma, zonder de rest van de app aan te passen.
- Pagination op de highscores pagina
- Validatie/whitelist van boss-namen als je dat wilt afdwingen
