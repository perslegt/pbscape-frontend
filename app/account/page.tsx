import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LogoutButton } from "@/app/components/auth-buttons";
import { addGameAccount, removeGameAccount } from "@/app/account/actions";
import { getGameAccountsForUser } from "@/lib/db";

interface AccountPageProps {
  searchParams: { accountResult?: string; accountError?: string };
}

export default async function AccountPage({ searchParams }: AccountPageProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const name =
    session.user.displayName ??
    session.user.discordUsername ??
    session.user.name ??
    "Discord user";
  const userId = Number(session.user.id);
  const gameAccounts = Number.isInteger(userId)
    ? getGameAccountsForUser(userId)
    : [];
  const successMessage =
    searchParams.accountResult === "added"
      ? "RuneScape account linked."
      : searchParams.accountResult === "removed"
        ? "RuneScape account removed."
        : null;

  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold text-gold">Account</h1>
      <div className="flex items-center gap-4 rounded border border-neutral-800 bg-neutral-900 p-5">
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={`${name}'s Discord avatar`}
            width={64}
            height={64}
            className="rounded-full"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 text-xl font-bold text-neutral-400"
          >
            {name.charAt(0).toUpperCase() || "D"}
          </div>
        )}
        <div>
          <p className="text-sm text-neutral-400">Logged in as</p>
          <p className="text-lg font-semibold">{name}</p>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">My RuneScape accounts</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Link up to 10 accounts. Ownership verification will be added later.
          </p>
        </div>

        {successMessage && (
          <p className="rounded border border-green-900 bg-green-950/40 px-4 py-3 text-sm text-green-300">
            {successMessage}
          </p>
        )}
        {searchParams.accountError && (
          <p className="rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {searchParams.accountError}
          </p>
        )}

        {gameAccounts.length === 0 ? (
          <p className="rounded border border-neutral-800 bg-neutral-900/50 px-4 py-5 text-neutral-400">
            No RuneScape accounts linked yet.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800 overflow-hidden rounded border border-neutral-800">
            {gameAccounts.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-4 bg-neutral-900 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{account.rsn}</p>
                  <p className="text-sm text-neutral-400">
                    {account.verificationStatus === "UNVERIFIED"
                      ? "Unverified"
                      : account.verificationStatus === "VERIFIED"
                        ? "Verified"
                        : "Revoked"}
                    {" · Linked "}
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                    }).format(new Date(account.createdAt))}
                  </p>
                </div>
                <form action={removeGameAccount}>
                  <input
                    type="hidden"
                    name="gameAccountId"
                    value={account.id}
                  />
                  <button
                    type="submit"
                    className="rounded bg-red-950 px-3 py-1.5 text-sm font-semibold text-red-300 hover:bg-red-900"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={addGameAccount} className="flex max-w-md gap-3">
          <label htmlFor="rsn" className="sr-only">
            RuneScape name
          </label>
          <input
            id="rsn"
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
            Add account
          </button>
        </form>
      </div>
      <LogoutButton />
    </section>
  );
}
