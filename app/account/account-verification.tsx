"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ActiveVerification {
  id: number;
  rsn: string;
  code: string;
  expiresAt: string;
}

function secondsRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function AccountVerification() {
  const router = useRouter();
  const [verification, setVerification] = useState<ActiveVerification | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!verification) return;
    const response = await fetch(
      `/api/game-accounts/verifications/${verification.id}`,
      { cache: "no-store" },
    );
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !("verification" in data)) return;
    const status = (data as { verification?: { state?: unknown } }).verification?.state;
    if (status === "VERIFIED") {
      setVerified(verification.rsn);
      setVerification(null);
      router.refresh();
    } else if (status === "EXPIRED" || status === "CANCELLED") {
      setError(status === "EXPIRED" ? "The verification code has expired." : "Verification cancelled.");
      setVerification(null);
    }
  }, [router, verification]);

  useEffect(() => {
    if (!verification) return;
    setRemaining(secondsRemaining(verification.expiresAt));
    const timer = window.setInterval(() => {
      setRemaining(secondsRemaining(verification.expiresAt));
    }, 1000);
    const poller = window.setInterval(checkStatus, 3000);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(poller);
    };
  }, [checkStatus, verification]);

  async function startVerification(formData: FormData) {
    setError(null);
    setVerified(null);
    const response = await fetch("/api/game-accounts/verifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsn: formData.get("rsn") }),
    });
    const data: unknown = await response.json();
    if (
      response.ok &&
      typeof data === "object" &&
      data !== null &&
      "verification" in data
    ) {
      const value = (data as {
        verification?: {
          id?: unknown;
          rsn?: unknown;
          code?: unknown;
          expiresAt?: unknown;
        };
      }).verification;
      if (
        typeof value?.id === "number" &&
        typeof value.rsn === "string" &&
        typeof value.code === "string" &&
        typeof value.expiresAt === "string"
      ) {
        setVerification({
          id: value.id,
          rsn: value.rsn,
          code: value.code,
          expiresAt: value.expiresAt,
        });
        return;
      }
    }
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? (data as { message?: unknown }).message
        : null;
    setError(typeof message === "string" ? message : "Verification could not be started.");
  }

  async function cancelVerification() {
    if (!verification) return;
    await fetch(`/api/game-accounts/verifications/${verification.id}`, {
      method: "DELETE",
    });
    setVerification(null);
  }

  if (verification) {
    const minutes = Math.floor(remaining / 60);
    const seconds = String(remaining % 60).padStart(2, "0");
    return (
      <div className="space-y-4 rounded border border-amber-800 bg-amber-950/30 p-4">
        <h3 className="text-lg font-semibold text-amber-300">
          Verify {verification.rsn}
        </h3>
        <p className="text-sm text-neutral-300">
          Open RuneLite while logged in as {verification.rsn}. Type the following
          command in the RuneLite chatbox:
        </p>
        <code className="block break-all rounded bg-neutral-950 p-3 text-center text-lg font-bold text-gold">
          !pbscape-verify {verification.code}
        </code>
        <p className="text-xs text-neutral-400">
          The command is handled locally by the PBScape plugin and is not sent as
          a public chat message.
        </p>
        <p className="text-sm text-neutral-400">
          Expires in {minutes}:{seconds}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={checkStatus}
            className="rounded bg-gold px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:opacity-90"
          >
            Check verification
          </button>
          <button
            type="button"
            onClick={cancelVerification}
            className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {verified && (
        <p className="rounded border border-green-900 bg-green-950/40 px-4 py-3 text-sm text-green-300">
          {verified} was verified and linked.
        </p>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      <form action={startVerification} className="flex max-w-md gap-3">
        <label htmlFor="verificationRsn" className="sr-only">
          RuneScape name
        </label>
        <input
          id="verificationRsn"
          name="rsn"
          required
          maxLength={64}
          placeholder="RuneScape name"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-gold"
        />
        <button
          type="submit"
          className="rounded bg-gold px-4 py-2 text-sm font-semibold text-neutral-900 hover:opacity-90"
        >
          Add RuneScape account
        </button>
      </form>
    </div>
  );
}
