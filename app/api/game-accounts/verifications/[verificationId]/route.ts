import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  cancelVerificationForUser,
  getVerificationForUser,
} from "@/lib/db";

interface VerificationRouteContext {
  params: { verificationId: string };
}

function authenticatedUserId(sessionId: string | undefined): number | null {
  const userId = Number(sessionId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function GET(
  _request: NextRequest,
  { params }: VerificationRouteContext,
) {
  const session = await auth();
  const userId = authenticatedUserId(session?.user?.id);
  const verificationId = Number(params.verificationId);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (!Number.isInteger(verificationId) || verificationId <= 0) {
    return NextResponse.json(
      { success: false, error: "VERIFICATION_NOT_FOUND" },
      { status: 404 },
    );
  }

  const verification = getVerificationForUser(userId, verificationId);
  if (!verification) {
    return NextResponse.json(
      { success: false, error: "VERIFICATION_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    verification: {
      rsn: verification.rsn,
      state: verification.state,
      expiresAt: verification.expiresAt,
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: VerificationRouteContext,
) {
  const session = await auth();
  const userId = authenticatedUserId(session?.user?.id);
  const verificationId = Number(params.verificationId);
  if (!userId) {
    return NextResponse.json(
      { success: false, error: "UNAUTHORIZED" },
      { status: 401 },
    );
  }
  if (!Number.isInteger(verificationId) || verificationId <= 0) {
    return NextResponse.json(
      { success: false, error: "VERIFICATION_NOT_FOUND" },
      { status: 404 },
    );
  }

  const cancelled = cancelVerificationForUser(userId, verificationId);
  return cancelled
    ? NextResponse.json({ success: true, result: "VERIFICATION_CANCELLED" })
    : NextResponse.json(
        { success: false, error: "VERIFICATION_NOT_FOUND" },
        { status: 404 },
      );
}
