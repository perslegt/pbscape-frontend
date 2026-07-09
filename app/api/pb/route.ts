/**
 * POST /api/pb
 * -----------------------------------------------------------------------
 * Endpoint waar de RuneLite plugin nieuwe personal bests naar toe stuurt.
 *
 * Verwachte JSON body:
 * {
 *   "player": "TestPlayer",
 *   "boss": "Vorkath",
 *   "timeMillis": 85000,
 *   "apiKey": "dev-token"
 * }
 *
 * Response (voorbeeld bij succes):
 * { "success": true, "message": "New PB saved" }
 *
 * Response (voorbeeld bij een tragere tijd):
 * { "success": false, "message": "Submitted time is not faster than current PB" }
 * -----------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { submitPB } from "@/lib/db";
import { SubmitPBRequest, SubmitPBResponse } from "@/types/pb";

// Zorgt dat deze route altijd dynamisch wordt uitgevoerd (nooit gecached),
// want elke request kan de database wijzigen.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. Body parsen. Als dit geen geldige JSON is, direct een duidelijke fout.
  let body: Partial<SubmitPBRequest>;
  try {
    body = (await request.json()) as Partial<SubmitPBRequest>;
  } catch {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "Request body is not valid JSON" },
      { status: 400 }
    );
  }

  const { player, boss, timeMillis, apiKey } = body;

  // 2. Valideren dat alle verplichte velden aanwezig zijn.
  if (
    player === undefined ||
    boss === undefined ||
    timeMillis === undefined ||
    apiKey === undefined
  ) {
    return NextResponse.json<SubmitPBResponse>(
      {
        success: false,
        message:
          "Missing required field(s). Expected: player, boss, timeMillis, apiKey",
      },
      { status: 400 }
    );
  }

  // 3. Type-checks: player/boss moeten strings zijn, timeMillis een getal.
  if (typeof player !== "string" || player.trim().length === 0) {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "'player' must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof boss !== "string" || boss.trim().length === 0) {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "'boss' must be a non-empty string" },
      { status: 400 }
    );
  }

  if (typeof timeMillis !== "number" || !Number.isFinite(timeMillis) || timeMillis <= 0) {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "'timeMillis' must be a positive number" },
      { status: 400 }
    );
  }

  // 4. API key controleren tegen de environment variable.
  //    Zo kan alleen jouw eigen plugin (die de juiste key kent) PB's insturen.
  const expectedApiKey = process.env.PB_API_KEY;

  if (!expectedApiKey) {
    // Duidelijke server-side fout als de env variable niet is ingesteld,
    // zodat je dit meteen ziet tijdens development.
    console.error("PB_API_KEY is not set in the environment.");
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "Server misconfiguration: PB_API_KEY not set" },
      { status: 500 }
    );
  }

  if (apiKey !== expectedApiKey) {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "Invalid API key" },
      { status: 401 }
    );
  }

  // 5. Opslaan (alleen als het de eerste PB is, of een verbetering).
  const result = submitPB(player.trim(), boss.trim(), Math.round(timeMillis));

  return NextResponse.json<SubmitPBResponse>(result, { status: 200 });
}
