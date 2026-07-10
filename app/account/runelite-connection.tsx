"use client";

import { useState } from "react";
import { useFormState } from "react-dom";
import {
  createRuneLiteSecret,
  revokeRuneLiteSecret,
  type ApiKeyCreationState,
} from "@/app/account/actions";
import type { ApiKeyMetadata } from "@/lib/db";

const initialState: ApiKeyCreationState = { plaintext: null, error: null };

export function RuneLiteConnection({
  gameAccountId,
  activeSecret,
}: {
  gameAccountId: number;
  activeSecret: ApiKeyMetadata | null;
}) {
  const [state, formAction] = useFormState(createRuneLiteSecret, initialState);
  const [copied, setCopied] = useState(false);

  async function copySecret() {
    if (!state.plaintext) return;
    await navigator.clipboard.writeText(state.plaintext);
    setCopied(true);
  }

  return (
    <div className="mt-3 space-y-3 border-t border-neutral-800 pt-3">
      <div>
        <p className="text-sm font-medium">RuneLite connection</p>
        <p className={activeSecret ? "text-sm text-green-300" : "text-sm text-neutral-400"}>
          {activeSecret ? "Connected" : "Not connected"}
        </p>
        {activeSecret && (
          <div className="mt-1 text-xs text-neutral-500">
            <p>Secret: {activeSecret.keyPrefix}&hellip;</p>
            <p>
              Last used:{" "}
              {activeSecret.lastUsedAt
                ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                    new Date(activeSecret.lastUsedAt),
                  )
                : "Never"}
            </p>
          </div>
        )}
      </div>

      {state.plaintext && (
        <div className="space-y-2 rounded border border-amber-800 bg-amber-950/30 p-3">
          <p className="text-sm font-semibold text-amber-300">
            Copy this secret now. It will not be shown again.
          </p>
          <code className="block break-all rounded bg-neutral-950 p-2 text-xs text-neutral-200">
            {state.plaintext}
          </code>
          <button
            type="button"
            onClick={copySecret}
            className="rounded bg-gold px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:opacity-90"
          >
            {copied ? "Copied" : "Copy secret"}
          </button>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-300">
            <li>Open the PBScape plugin configuration in RuneLite.</li>
            <li>Paste the secret into the secret field and save the configuration.</li>
            <li>
              Type <code className="rounded bg-neutral-950 px-1.5 py-0.5 text-gold">!pbscape-connect</code>{" "}
              in the RuneLite chatbox.
            </li>
          </ol>
        </div>
      )}

      {state.error && <p className="text-sm text-red-300">{state.error}</p>}

      <div className="flex gap-2">
        <form action={formAction}>
          <input type="hidden" name="gameAccountId" value={gameAccountId} />
          {activeSecret && <input type="hidden" name="replace" value="true" />}
          <button
            type="submit"
            className="rounded bg-gold px-3 py-1.5 text-sm font-semibold text-neutral-900 hover:opacity-90"
          >
            {activeSecret ? "Replace secret" : "Create secret"}
          </button>
        </form>
        {activeSecret && (
          <form action={revokeRuneLiteSecret}>
            <input type="hidden" name="gameAccountId" value={gameAccountId} />
            <button
              type="submit"
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm font-semibold text-neutral-300 hover:bg-neutral-700"
            >
              Revoke
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
