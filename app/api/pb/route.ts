import { NextRequest, NextResponse } from "next/server";
import { submitPbByRsn } from "@/lib/db";
import type { SubmitPBResponse, SyncPBsResponse } from "@/types/pb";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: JsonRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

function numberField(record: JsonRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}

function errorStatus(code: string): number {
  if (code === "ACCOUNT_NOT_FOUND" || code === "BOSS_NOT_FOUND") return 404;
  if (code === "BOSS_DISABLED") return 422;
  return 400;
}

function processRequestBody(body: JsonRecord) {
  const rsn = stringField(body, "rsn", "playerName");
  const bossIdentifier = stringField(body, "bossSlug", "boss");
  const durationMs = numberField(body, "durationMs", "timeMillis");

  if (!rsn || !bossIdentifier || durationMs === null) {
    return {
      success: false as const,
      code: "INVALID_REQUEST",
      message:
        "Missing required fields. Expected rsn/playerName, bossSlug/boss, and durationMs/timeMillis.",
    };
  }

  return submitPbByRsn({
    rsn,
    bossIdentifier,
    durationMs,
    source: "RUNELITE",
    screenshotUrl: stringField(body, "screenshotUrl"),
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "Request body is not valid JSON." },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: "Request body must be an object." },
      { status: 400 },
    );
  }

  const result = processRequestBody(body);
  if (!result.success) {
    return NextResponse.json<SubmitPBResponse>(
      { success: false, message: result.message },
      { status: errorStatus(result.code) },
    );
  }

  const value = result.value;
  return NextResponse.json<SubmitPBResponse>(
    {
      success: true,
      message:
        value.outcome === "NOT_FASTER"
          ? "Submission stored; current personal best is faster or equal."
          : "Personal best saved.",
      result: value.outcome,
      durationMs: value.durationMs,
      previousBestMs: value.previousBestMs,
      currentBestMs: value.currentBestMs,
    },
    { status: value.outcome === "FIRST_PERSONAL_BEST" ? 201 : 200 },
  );
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<SyncPBsResponse>(
      { success: false, message: "Request body is not valid JSON." },
      { status: 400 },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json<SyncPBsResponse>(
      { success: false, message: "Request body must be an object." },
      { status: 400 },
    );
  }

  const rsn = stringField(body, "rsn", "playerName");
  const entries = body.pbs;
  if (!rsn || !Array.isArray(entries)) {
    return NextResponse.json<SyncPBsResponse>(
      { success: false, message: "Expected rsn/playerName and a pbs array." },
      { status: 400 },
    );
  }

  let updated = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (!isRecord(entry)) {
      return NextResponse.json<SyncPBsResponse>(
        { success: false, message: "Each PB entry must be an object." },
        { status: 400 },
      );
    }

    const result = processRequestBody({ ...entry, rsn });
    if (!result.success) {
      return NextResponse.json<SyncPBsResponse>(
        { success: false, message: result.message },
        { status: errorStatus(result.code) },
      );
    }

    if (result.value.outcome === "NOT_FASTER") skipped += 1;
    else updated += 1;
  }

  return NextResponse.json<SyncPBsResponse>({
    success: true,
    message: `${updated} PB(s) updated, ${skipped} stored without replacing a PB`,
    stats: { total: entries.length, updated, skipped },
  });
}
