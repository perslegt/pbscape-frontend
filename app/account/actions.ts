"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  createGameAccountForUser,
  deleteGameAccountForUser,
} from "@/lib/db";

function authenticatedUserId(sessionUserId: string | undefined): number | null {
  const userId = Number(sessionUserId);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function addGameAccount(formData: FormData) {
  const session = await auth();
  const userId = authenticatedUserId(session?.user?.id);

  if (!userId) {
    redirect("/");
  }

  const rsnValue = formData.get("rsn");
  const result = createGameAccountForUser(
    userId,
    typeof rsnValue === "string" ? rsnValue : "",
  );

  revalidatePath("/account");
  redirect(
    result.success
      ? "/account?accountResult=added"
      : `/account?accountError=${encodeURIComponent(result.message)}`,
  );
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
