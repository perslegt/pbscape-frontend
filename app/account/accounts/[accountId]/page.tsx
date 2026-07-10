import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getGameAccountForUser,
  getPersonalBestsForGameAccount,
  getSubmissionHistoryForGameAccount,
} from "@/lib/db";
import { formatTime } from "@/lib/formatTime";

export const dynamic = "force-dynamic";

interface GameAccountPageProps {
  params: { accountId: string };
}

export default async function GameAccountPage({ params }: GameAccountPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/");
  }

  const userId = Number(session.user.id);
  const accountId = Number(params.accountId);
  if (!Number.isInteger(userId) || !Number.isInteger(accountId)) {
    notFound();
  }

  const account = getGameAccountForUser(userId, accountId);
  if (!account) {
    notFound();
  }

  const personalBests = getPersonalBestsForGameAccount(account.id);
  const submissions = getSubmissionHistoryForGameAccount(account.id, 25);
  const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

  return (
    <div className="space-y-8">
      <div>
        <Link href="/account" className="text-sm text-neutral-400 hover:text-gold">
          &larr; Back to account
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-gold">{account.rsn}</h1>
        <p className="mt-1 text-neutral-400">
          {account.verificationStatus === "UNVERIFIED"
            ? "Unverified"
            : account.verificationStatus === "VERIFIED"
              ? "Verified"
              : "Verification revoked"}
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Current personal bests</h2>
        {personalBests.length === 0 ? (
          <p className="rounded border border-neutral-800 bg-neutral-900/50 p-4 text-neutral-400">
            No personal bests submitted yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Boss</th>
                  <th className="px-4 py-3">Best time</th>
                  <th className="px-4 py-3">Achieved</th>
                </tr>
              </thead>
              <tbody>
                {personalBests.map((best) => (
                  <tr key={best.id} className="border-t border-neutral-800">
                    <td className="px-4 py-3 font-medium">{best.bossName}</td>
                    <td className="px-4 py-3 font-semibold text-gold">
                      {formatTime(best.durationMs)}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">
                      {dateFormatter.format(new Date(best.achievedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Recent submissions</h2>
        {submissions.length === 0 ? (
          <p className="rounded border border-neutral-800 bg-neutral-900/50 p-4 text-neutral-400">
            No submission history yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Boss</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Result</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id} className="border-t border-neutral-800">
                    <td className="px-4 py-3 font-medium">{submission.bossName}</td>
                    <td className="px-4 py-3">{formatTime(submission.durationMs)}</td>
                    <td className="px-4 py-3">
                      {submission.accepted
                        ? submission.becamePersonalBest
                          ? "Personal best"
                          : "Not faster"
                        : submission.rejectionReason ?? "Rejected"}
                    </td>
                    <td className="px-4 py-3 text-neutral-400">{submission.source}</td>
                    <td className="px-4 py-3 text-neutral-400">
                      {dateFormatter.format(new Date(submission.submittedAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
