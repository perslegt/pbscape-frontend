import { NextRequest, NextResponse } from "next/server";
import { markApiKeyUsed, submitPbByRsn } from "@/lib/db";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
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
  if (code === "GAME_ACCOUNT_NOT_LINKED") return 403;
  if (
    code === "ACCOUNT_HASH_MISMATCH" ||
    code === "ACCOUNT_REVERIFICATION_REQUIRED"
  ) return 403;
  if (
    code === "ACCOUNT_HASH_ALREADY_LINKED" ||
    code === "RSN_ALREADY_LINKED"
  ) return 409;
  if (code === "BOSS_NOT_FOUND") return 404;
  if (code === "BOSS_DISABLED") return 422;
  return 400;
}

function responseError(code: string): SubmitPBResponse["error"] {
  switch (code) {
    case "GAME_ACCOUNT_NOT_LINKED":
    case "INVALID_ACCOUNT_HASH":
    case "ACCOUNT_HASH_MISMATCH":
    case "ACCOUNT_HASH_ALREADY_LINKED":
    case "ACCOUNT_REVERIFICATION_REQUIRED":
    case "RSN_ALREADY_LINKED":
      return code;
    default:
      return undefined;
  }
}

function processRequestBody(
  body: JsonRecord,
  userId: number,
  gameAccountId: number,
) {
  const rsn = stringField(body, "rsn", "playerName");
  const bossIdentifier = stringField(body, "bossSlug", "boss");
  const durationMs = numberField(body, "durationMs", "timeMillis");
  const accountHash = body.accountHash;

  if (!rsn || !bossIdentifier || durationMs === null || accountHash === undefined) {
    return {
      success: false as const,
      code: "INVALID_REQUEST",
      message:
        "Missing required fields. Expected rsn/playerName, accountHash, bossSlug/boss, and durationMs/timeMillis.",
    };
  }

  return submitPbByRsn({
    userId,
    gameAccountId,
    rsn,
    accountHash,
    bossIdentifier,
    durationMs,
    source: "RUNELITE",
    screenshotUrl: stringField(body, "screenshotUrl"),
  });
}

export async function POST(request: NextRequest) {
  const authentication = authenticateApiKey(
    request.headers.get("authorization"),
  );
  if (!authentication.success) {
    return NextResponse.json<SubmitPBResponse>(
      {
        success: false,
        error: "INVALID_API_KEY",
        message: "API key authentication failed.",
      },
      { status: 401 },
    );
  }

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

  const result = processRequestBody(
    body,
    authentication.userId,
    authentication.gameAccountId,
  );
  const boss = stringField(body, "bossSlug", "boss") ?? undefined;
  if (!result.success) {
    return NextResponse.json<SubmitPBResponse>(
      {
        success: false,
        boss,
        error: responseError(result.code),
        message: result.message,
      },
      { status: errorStatus(result.code) },
    );
  }

  const value = result.value;
  markApiKeyUsed(authentication.apiKeyId);
  return NextResponse.json<SubmitPBResponse>(
    {
      success: true,
      boss,
      message:
        value.outcome === "ALREADY_UPLOADED"
          ? "This personal best has already been uploaded."
          : value.outcome === "NOT_FASTER"
          ? "Submission stored; current personal best is faster or equal."
          : "Personal best saved.",
      result: value.outcome,
      durationMs: value.durationMs,
      previousBestMs: value.previousBestMs,
      currentBestMs: value.currentBestMs,
      identity: {
        nameChanged: result.identity.nameChanged,
        previousRsn: result.identity.previousRsn,
        rsn: result.identity.rsn,
      },
    },
    { status: value.outcome === "FIRST_PERSONAL_BEST" ? 201 : 200 },
  );
}

export async function PUT(request: NextRequest) {
  const authentication = authenticateApiKey(
    request.headers.get("authorization"),
  );
  if (!authentication.success) {
    return NextResponse.json<SyncPBsResponse>(
      { success: false, message: "API key authentication failed." },
      { status: 401 },
    );
  }

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
  const accountHash = body.accountHash;
  const entries = body.pbs;
  if (!rsn || accountHash === undefined || !Array.isArray(entries)) {
    return NextResponse.json<SyncPBsResponse>(
      { success: false, message: "Expected rsn/playerName, accountHash, and a pbs array." },
      { status: 400 },
    );
  }

  let updated = 0;
  let skipped = 0;
  let alreadyUploaded = 0;
  let identity: SyncPBsResponse["identity"];
  for (const entry of entries) {
    if (!isRecord(entry)) {
      return NextResponse.json<SyncPBsResponse>(
        { success: false, message: "Each PB entry must be an object." },
        { status: 400 },
      );
    }

    const result = processRequestBody(
      { ...entry, rsn, accountHash },
      authentication.userId,
      authentication.gameAccountId,
    );
    const boss = stringField(entry, "bossSlug", "boss") ?? undefined;
    if (!result.success) {
      return NextResponse.json<SyncPBsResponse>(
        { success: false, boss, message: result.message },
        { status: errorStatus(result.code) },
      );
    }

    identity = {
      nameChanged: result.identity.nameChanged,
      previousRsn: result.identity.previousRsn,
      rsn: result.identity.rsn,
    };

    if (result.value.outcome === "ALREADY_UPLOADED") alreadyUploaded += 1;
    else if (result.value.outcome === "NOT_FASTER") skipped += 1;
    else updated += 1;
  }

  markApiKeyUsed(authentication.apiKeyId);
  return NextResponse.json<SyncPBsResponse>({
    success: true,
    message: `${updated} PB(s) updated, ${skipped} stored without replacing a PB, ${alreadyUploaded} already uploaded`,
    stats: { total: entries.length, updated, skipped, alreadyUploaded },
    identity,
  });
}
