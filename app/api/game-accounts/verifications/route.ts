import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { startGameAccountVerification } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "INVALID_RSN" },
      { status: 400 },
    );
  }
  const rsn =
    typeof body === "object" && body !== null && "rsn" in body
      ? (body as { rsn?: unknown }).rsn
      : undefined;
  if (typeof rsn !== "string") {
    return NextResponse.json(
      { success: false, error: "INVALID_RSN" },
      { status: 400 },
    );
  }

  const result = startGameAccountVerification(userId, rsn);
  if (!result.success) {
    const status =
      result.error === "RSN_ALREADY_LINKED"
        ? 409
        : result.error === "GAME_ACCOUNT_LIMIT_REACHED"
          ? 422
          : result.error === "RATE_LIMITED"
            ? 429
            : 400;
    return NextResponse.json(
      { success: false, error: result.error, message: result.message },
      { status },
    );
  }

  return NextResponse.json({
    success: true,
    verification: {
      id: result.verification.id,
      rsn: result.verification.rsn,
      code: result.verification.code,
      expiresAt: result.verification.expiresAt,
    },
  });
}
