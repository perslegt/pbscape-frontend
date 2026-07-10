"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  createApiKeyForGameAccount,
  deleteGameAccountForUser,
  replaceApiKeyForGameAccount,
  revokeApiKeyForGameAccount,
} from "@/lib/db";

function authenticatedUserId(sessionUserId: string | undefined): number | null {
  const userId = Number(sessionUserId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function removeGameAccount(formData: FormData) {
  const session = await auth();
  const userId = authenticatedUserId(session?.user?.id);

  if (!userId) {
    redirect("/");
  }

  const gameAccountId = Number(formData.get("gameAccountId"));
  if (!Number.isInteger(gameAccountId) || gameAccountId <= 0) {
    redirect("/account?accountError=Invalid%20account.");
  }

  const removed = deleteGameAccountForUser(userId, gameAccountId);
  revalidatePath("/account");
  redirect(
    removed
      ? "/account?accountResult=removed"
      : "/account?accountError=RuneScape%20account%20not%20found.",
  );
}

export interface ApiKeyCreationState {
  plaintext: string | null;
  error: string | null;
}

export async function createRuneLiteSecret(
  _previousState: ApiKeyCreationState,
  formData: FormData,
): Promise<ApiKeyCreationState> {
  const session = await auth();
  const userId = authenticatedUserId(session?.user?.id);
  if (!userId) {
    return { plaintext: null, error: "You must be logged in." };
  }

  const gameAccountId = Number(formData.get("gameAccountId"));
  if (!Number.isInteger(gameAccountId) || gameAccountId <= 0) {
    return { plaintext: null, error: "Invalid RuneScape account." };
  }

  const result =
    formData.get("replace") === "true"
      ? replaceApiKeyForGameAccount(userId, gameAccountId)
      : createApiKeyForGameAccount(userId, gameAccountId);
  if (!result.success) {
    return { plaintext: null, error: result.message };
  }

  revalidatePath("/account");
  return { plaintext: result.plaintext, error: null };
}

export async function revokeRuneLiteSecret(formData: FormData) {
  const session = await auth();
  const userId = authenticatedUserId(session?.user?.id);
  if (!userId) {
    redirect("/");
  }

  const gameAccountId = Number(formData.get("gameAccountId"));
  if (!Number.isInteger(gameAccountId) || gameAccountId <= 0) {
    redirect("/account?accountError=Invalid%20RuneScape%20account.");
  }

  const revoked = revokeApiKeyForGameAccount(userId, gameAccountId);
  revalidatePath("/account");
  redirect(
    revoked
      ? "/account?accountResult=keyRevoked"
      : "/account?accountError=API%20key%20not%20found.",
  );
}
