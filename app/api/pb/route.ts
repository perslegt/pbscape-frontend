/**
 * POST /api/pb
 * -----------------------------------------------------------------------
 * Endpoint waar de RuneLite plugin nieuwe personal bests naar toe stuurt.
 *
 * Verwachte JSON body:
 * {
 *   "player": "TestPlayer",
 *   "boss": "Vorkath",
 *   "timeMillis": 85000
 * }
 *
 * Response (voorbeeld bij succes):
 * { "success": true, "message": "New PB saved" }
 *
 * Response (voorbeeld bij een tragere tijd):
 * { "success": false, "message": "Submitted time is not faster than current PB" }
 *
 * -----------------------------------------------------------------------
 * PUT /api/pb
 * -----------------------------------------------------------------------
 * Endpoint waar spelers al hun PBs in bulk uploaden/synchroniseren.
 *
 * Verwachte JSON body:
 * {
 *   "player": "TestPlayer",
 *   "pbs": [
 *     { "boss": "Vorkath", "timeMillis": 85000 },
 *     { "boss": "Zulrah", "timeMillis": 120000 },
 *     ...
 *   ]
 * }
 *
 * Response (voorbeeld):
 * {
 *   "success": true,
 *   "message": "3 PBs synced",
 *   "stats": { "total": 3, "updated": 2, "skipped": 1 }
 * }
 * -----------------------------------------------------------------------
 */

import { NextRequest, NextResponse } from "next/server";
import { handleSubmission } from "@/lib/db";
import { SubmitPBRequest, SubmitPBResponse, SyncPBsRequest, SyncPBsResponse } from "@/types/pb";

// Zorgt dat deze route altijd dynamisch wordt uitgevoerd (nooit gecached),
// want elke request kan de database wijzigen.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // 1. Body parse
  let body: Partial<SubmitPBRequest>;
  try {
    body = (await request.json()) as Partial<SubmitPBRequest>;
  } catch {
    return NextResponse.json<SubmitPBResponse>({ success: false, message: "Request body is not valid JSON" }, { status: 400 });
  }

  const { playerName, boss, timeMillis, gameMessage, pluginVersion } = body as SubmitPBRequest;

  if (!playerName || !boss || timeMillis === undefined) {
    return NextResponse.json<SubmitPBResponse>({ success: false, message: "Missing required field(s). Expected: playerName, boss, timeMillis" }, { status: 400 });
  }

  if (typeof playerName !== "string" || playerName.trim().length === 0) {
    return NextResponse.json<SubmitPBResponse>({ success: false, message: "'playerName' must be a non-empty string" }, { status: 400 });
  }

  if (typeof boss !== "string" || boss.trim().length === 0) {
    return NextResponse.json<SubmitPBResponse>({ success: false, message: "'boss' must be a non-empty string" }, { status: 400 });
  }

  if (typeof timeMillis !== "number" || !Number.isFinite(timeMillis) || timeMillis <= 0) {
    return NextResponse.json<SubmitPBResponse>({ success: false, message: "'timeMillis' must be a positive number" }, { status: 400 });
  }

  // normalize boss -> slug
  const bossSlug = boss
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  const result = handleSubmission({
    playerName: playerName.trim(),
    bossSlug,
    bossName: boss.trim(),
    timeMillis: Math.round(timeMillis),
    gameMessage: typeof gameMessage === "string" ? gameMessage : undefined,
    pluginVersion: typeof pluginVersion === "string" ? pluginVersion : undefined,
    source: "plugin",
    ipAddress: null,
  });

  return NextResponse.json<SubmitPBResponse>(result, { status: 200 });
}

/**
 * PUT handler: bulk sync van alle PBs van een speler.
 * Verwerkt alle ingezonden PBs en geeft statistieken terug.
 */
export async function PUT(request: NextRequest) {
  // 1. Body parse
  let body: Partial<SyncPBsRequest>;
  try {
    body = (await request.json()) as Partial<SyncPBsRequest>;
  } catch {
    return NextResponse.json<SyncPBsResponse>({ success: false, message: "Request body is not valid JSON" }, { status: 400 });
  }

  const { playerName, pbs } = body as SyncPBsRequest;

  if (!playerName || !Array.isArray(pbs)) {
    return NextResponse.json<SyncPBsResponse>({ success: false, message: "Missing required field(s). Expected: playerName, pbs" }, { status: 400 });
  }

  if (typeof playerName !== "string" || playerName.trim().length === 0) {
    return NextResponse.json<SyncPBsResponse>({ success: false, message: "'playerName' must be a non-empty string" }, { status: 400 });
  }

  // validate pb entries
  for (const pb of pbs) {
    if (typeof pb !== "object" || pb === null) {
      return NextResponse.json<SyncPBsResponse>({ success: false, message: "Each PB entry must be an object" }, { status: 400 });
    }

    const { boss, timeMillis } = pb as any;
    if (typeof boss !== "string" || boss.trim().length === 0) {
      return NextResponse.json<SyncPBsResponse>({ success: false, message: "'boss' must be a non-empty string in each PB entry" }, { status: 400 });
    }

    if (typeof timeMillis !== "number" || !Number.isFinite(timeMillis) || timeMillis <= 0) {
      return NextResponse.json<SyncPBsResponse>({ success: false, message: "'timeMillis' must be a positive number in each PB entry" }, { status: 400 });
    }
  }

  // process entries
  let updated = 0;
  let skipped = 0;

  for (const pb of pbs) {
    const boss = (pb as any).boss as string;
    const timeMillis = Math.round((pb as any).timeMillis as number);

    const bossSlug = boss.toString().toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s_-]/g, "").trim().replace(/\s+/g, "_");

    const res = handleSubmission({
      playerName: playerName.trim(),
      bossSlug,
      bossName: boss.trim(),
      timeMillis,
      gameMessage: (pb as any).gameMessage,
      pluginVersion: (pb as any).pluginVersion,
      source: "plugin",
      ipAddress: null,
    });

    if (res.success) updated++; else skipped++;
  }

  return NextResponse.json<SyncPBsResponse>({ success: true, message: `${updated} PB(s) updated, ${skipped} skipped`, stats: { total: pbs.length, updated, skipped } }, { status: 200 });
}
