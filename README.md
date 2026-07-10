# PBScape

PBScape is een Next.js-webapp voor het opslaan en tonen van persoonlijke recordtijden voor Old School RuneScape-bosses.

PB’s worden automatisch aangeleverd door de bijbehorende RuneLite-plugin en weergegeven in leaderboards.

## Tech stack

* Next.js 14 met TypeScript
* Tailwind CSS
* SQLite met `better-sqlite3`

## Lokaal installeren

Vereist: Node.js 18 of hoger.

```bash
npm install
```

Maak daarna een lokaal environmentbestand aan:

```bash
cp .env.local.example .env.local
```

Vul de vereiste configuratiewaarden in en start de applicatie:

```bash
npm run dev
```

Open vervolgens:

```text
http://localhost:3000
```

De lokale SQLite-database wordt bij de eerste start automatisch aangemaakt.

## Belangrijkste onderdelen

```text
app/        Pagina’s en API-routes
lib/        Database- en hulplogica
types/      Gedeelde TypeScript-types
data/       Lokale SQLite-database
```

## Functionaliteit

* Inloggen met Discord
* RuneScape-accounts koppelen en verifiëren
* PB’s ontvangen vanuit RuneLite
* Highscores per boss bekijken
* Bosses beheren via het adminpaneel

## Ontwikkeling

PBScape bevindt zich nog in ontwikkeling. Onder andere beveiliging, foutafhandeling, rate limiting en ondersteuning voor een productiedatabase worden verder uitgebreid.

Gevoelige configuratie, secrets en lokale databasebestanden mogen niet naar Git worden gepusht.
