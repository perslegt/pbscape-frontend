export type RuneLiteAccountHashResult =
  | { success: true; value: string }
  | { success: false };

const MAX_UNSIGNED_LONG = BigInt("18446744073709551615");

export function normalizeRuneLiteAccountHash(
  input: unknown,
): RuneLiteAccountHashResult {
  if (typeof input !== "string") return { success: false };
  const value = input.trim();
  if (!/^\d+$/.test(value)) return { success: false };

  try {
    const parsed = BigInt(value);
    if (parsed > MAX_UNSIGNED_LONG || parsed === MAX_UNSIGNED_LONG) {
      return { success: false };
    }
    return { success: true, value: parsed.toString() };
  } catch {
    return { success: false };
  }
}
