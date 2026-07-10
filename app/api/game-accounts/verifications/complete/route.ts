import { NextRequest, NextResponse } from "next/server";
import {
  completeGameAccountVerification,
  consumeVerificationRateLimit,
} from "@/lib/db";
import { hashRateLimitIdentifier } from "@/lib/verificationCode";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identifier = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const allowed = consumeVerificationRateLimit(
    `verification-complete:${hashRateLimitIdentifier(identifier)}`,
    20,
    15 * 60_000,
  );
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: "RATE_LIMITED" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "VERIFICATION_DATA_REQUIRED" },
      { status: 400 },
    );
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { success: false, error: "VERIFICATION_DATA_REQUIRED" },
      { status: 400 },
    );
  }
  const record = body as Record<string, unknown>;
  if (typeof record.rsn !== "string" || typeof record.verificationCode !== "string") {
    return NextResponse.json(
      { success: false, error: "VERIFICATION_DATA_REQUIRED" },
      { status: 400 },
    );
  }

  const result = completeGameAccountVerification(
    record.rsn,
    record.verificationCode,
  );
  if (!result.success) {
    const status =
      result.error === "INVALID_RSN"
        ? 400
        : result.error === "VERIFICATION_EXPIRED"
          ? 410
          : result.error === "VERIFICATION_ALREADY_USED"
            ? 409
            : result.error === "VERIFICATION_CANCELLED"
              ? 409
              : result.error === "RSN_VERIFICATION_MISMATCH"
                ? 403
                : result.error === "RSN_ALREADY_LINKED"
                  ? 409
                  : result.error === "GAME_ACCOUNT_LIMIT_REACHED"
                    ? 422
                    : 401;
    return NextResponse.json(
      { success: false, error: result.error },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    result: "ACCOUNT_VERIFIED",
    account: { rsn: result.rsn },
  });
}
