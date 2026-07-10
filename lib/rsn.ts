export interface ValidRsn {
  rsn: string;
  normalizedRsn: string;
}

export type RsnValidationResult =
  | { success: true; value: ValidRsn }
  | { success: false; message: string };

export function normalizeRsn(input: string): ValidRsn {
  const rsn = input.trim().replace(/\s+/g, " ");
  return { rsn, normalizedRsn: rsn.toLowerCase() };
}

export function validateRsn(input: string): RsnValidationResult {
  const value = normalizeRsn(input);

  if (!value.normalizedRsn) {
    return { success: false, message: "Enter a RuneScape name." };
  }

  if (value.rsn.length > 12) {
    return {
      success: false,
      message: "RuneScape names can contain at most 12 characters.",
    };
  }

  if (!/^[A-Za-z0-9 _-]+$/.test(value.rsn)) {
    return {
      success: false,
      message:
        "RuneScape names may only contain letters, numbers, spaces, hyphens, and underscores.",
    };
  }

  return { success: true, value };
}
