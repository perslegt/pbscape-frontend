import Link from "next/link";
import { getBosses, getHighscoresForBossPaginated } from "@/lib/db";
import { formatTime } from "@/lib/formatTime";

// Always render dynamically, as rankings can change with new submissions
export const dynamic = "force-dynamic";

interface HighscoresPageProps {
  searchParams: { boss?: string; page?: string };
}

export default function HighscoresPage({ searchParams }: HighscoresPageProps) {
  const bosses = getBosses();
  const selectedBossSlug = searchParams.boss ?? (bosses[0]?.slug ?? "");
  const page = parseInt(searchParams.page || "1", 10);
  const perPage = 25;

  // Get paginated data
  const { data: rankings, total, bossName } = getHighscoresForBossPaginated(selectedBossSlug, page, perPage) as any;

  const totalPages = Math.ceil(total / perPage);
  const startRank = (page - 1) * perPage + 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gold">Highscores</h1>
        <p className="mt-1 text-neutral-400">
          Select a boss to view the fastest personal bests.
        </p>
      </div>

      {/* --- Split layout: bosses on left, highscores table on right --- */}
      <div className="flex gap-8">
        {/* --- Left sidebar: Boss list --- */}
        <div className="w-48 flex-shrink-0">
          <div className="rounded border border-neutral-800 bg-neutral-900">
            <div className="border-b border-neutral-800 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase text-neutral-400">
                Bosses
              </h2>
            </div>
            <nav className="divide-y divide-neutral-800">
              {bosses.map((b) => {
                const isActive = b.slug === selectedBossSlug;
                return (
                  <Link
                    key={b.slug}
                    href={`/highscores?boss=${encodeURIComponent(b.slug)}&page=1`}
                    className={`block px-4 py-2.5 text-sm transition ${
                      isActive
                        ? "border-l-2 border-gold bg-neutral-800/50 text-gold font-medium"
                        : "text-neutral-300 hover:bg-neutral-800/30 hover:text-gold"
                    }`}
                  >
                    {b.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* --- Right side: Highscores table --- */}
        <div className="flex-1 space-y-4">
          {/* Title with boss name and total count */}
          <div className="border-b border-neutral-800 pb-4">
            <h2 className="text-xl font-semibold">
              {bossName || selectedBossSlug}{" "}
              <span className="text-neutral-400">({total} entries)</span>
            </h2>
          </div>

          {/* Table */}
          {rankings.length === 0 ? (
            <div className="rounded border border-neutral-800 bg-neutral-900/50 px-6 py-8 text-center">
              <p className="text-neutral-400">
                No personal bests yet for {bossName || selectedBossSlug}.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-neutral-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-900 text-neutral-400">
                  <tr className="border-b border-neutral-800">
                    <th className="px-4 py-3 w-12 text-center">#</th>
                    <th className="px-4 py-3">Player</th>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Sent on</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((pb: any, index: number) => (
                    <tr key={pb.id} className="border-t border-neutral-800 hover:bg-neutral-900/50 transition">
                      <td className="px-4 py-3 text-center text-neutral-500 font-medium">
                        {startRank + index}
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-100">
                        {pb.playerName}
                      </td>
                      <td className="px-4 py-3 text-gold font-semibold">
                        {formatTime(pb.timeMillis)}
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {new Date(pb.submittedAt).toLocaleDateString("en-US")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              {page > 1 && (
                <Link
                  href={`/highscores?boss=${encodeURIComponent(selectedBossSlug)}&page=${page - 1}`}
                  className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 transition"
                >
                  ← Previous
                </Link>
              )}

              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/highscores?boss=${encodeURIComponent(selectedBossSlug)}&page=${p}`}
                    className={`rounded px-2.5 py-1.5 text-sm transition ${
                      p === page
                        ? "bg-gold text-neutral-900 font-semibold"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>

              {page < totalPages && (
                <Link
                  href={`/highscores?boss=${encodeURIComponent(selectedBossSlug)}&page=${page + 1}`}
                  className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700 transition"
                >
                  Next →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
