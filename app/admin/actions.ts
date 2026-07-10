"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getUserById, setBossActive } from "@/lib/db";

export async function toggleBoss(formData: FormData) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  const databaseUser = Number.isInteger(userId) ? getUserById(userId) : undefined;

  if (databaseUser?.role !== "admin") {
    throw new Error("Unauthorized");
  }

  const bossId = Number(formData.get("bossId"));
  const isActive = formData.get("isActive") === "true";

  if (!Number.isInteger(bossId) || bossId <= 0) {
    throw new Error("Invalid boss ID");
  }

  if (!setBossActive(bossId, isActive)) {
    throw new Error("Boss not found");
  }

  revalidatePath("/admin");
  revalidatePath("/highscores");
}
