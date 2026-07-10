import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/apiKeyAuth";
import {
  markApiKeyUsed,
  submitPbByRsn,
  synchronizeRuneLiteAccountIdentity,
} from "@/lib/db";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identityErrorStatus(code: string): number {
  if (code === "ACCOUNT_HASH_ALREADY_LINKED" || code === "RSN_ALREADY_LINKED") {
    return 409;
  }
  if (code === "INVALID_RSN" || code === "INVALID_ACCOUNT_HASH") return 400;
  return 403;
}

export async function POST(request: NextRequest) {
  const authentication = authenticateApiKey(request.headers.get("authorization"));
  if (!authentication.success) {
    return NextResponse.json(
      { success: false, error: "INVALID_API_KEY" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_REQUEST" },
      { status: 400 },
    );
  }
  if (!isRecord(body)) {
    return NextResponse.json(
      { success: false, error: "INVALID_REQUEST" },
      { status: 400 },
    );
  }
  const rsn = body.rsn;
  const accountHash = body.accountHash;
  const personalBests = body.personalBests;
  if (
    typeof rsn !== "string" ||
    accountHash === undefined ||
    !Array.isArray(personalBests)
  ) {
    return NextResponse.json(
      { success: false, error: "INVALID_REQUEST" },
      { status: 400 },
    );
  }

  const synchronization = synchronizeRuneLiteAccountIdentity({
    userId: authentication.userId,
    gameAccountId: authentication.gameAccountId,
    submittedRsn: rsn,
    submittedAccountHash: accountHash,
  });
  if (!synchronization.success) {
    return NextResponse.json(
      { success: false, error: synchronization.code, message: synchronization.message },
      { status: identityErrorStatus(synchronization.code) },
    );
  }

  let updated = 0;
  let notFaster = 0;
  let alreadyUploaded = 0;
  for (const personalBest of personalBests) {
    if (!isRecord(personalBest)) {
      return NextResponse.json(
        { success: false, error: "INVALID_PERSONAL_BEST" },
        { status: 400 },
      );
    }
    const bossSlug = personalBest.bossSlug;
    const durationMs = personalBest.durationMs;
    if (typeof bossSlug !== "string" || typeof durationMs !== "number") {
      return NextResponse.json(
        { success: false, error: "INVALID_PERSONAL_BEST" },
        { status: 400 },
      );
    }

    const result = submitPbByRsn({
      userId: authentication.userId,
      gameAccountId: authentication.gameAccountId,
      rsn,
      accountHash,
      bossIdentifier: bossSlug,
      durationMs,
      source: "RUNELITE",
    });
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.code, boss: bossSlug, message: result.message },
        { status: result.code === "BOSS_NOT_FOUND" ? 404 : result.code === "BOSS_DISABLED" ? 422 : 400 },
      );
    }
    if (result.value.outcome === "ALREADY_UPLOADED") alreadyUploaded += 1;
    else if (result.value.outcome === "NOT_FASTER") notFaster += 1;
    else updated += 1;
  }

  markApiKeyUsed(authentication.apiKeyId);
  return NextResponse.json({
    success: true,
    result: "CONNECTED",
    identity: synchronization.identity,
    stats: {
      total: personalBests.length,
      updated,
      notFaster,
      alreadyUploaded,
    },
  });
}
