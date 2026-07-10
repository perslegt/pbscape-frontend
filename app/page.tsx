import Link from "next/link";
import { getLatestSubmissions } from "@/lib/db";
import { formatTime } from "@/lib/formatTime";

// This page reads live from the database, so always render dynamically
// (don't cache statically at "next build").
export const dynamic = "force-dynamic";

export default function HomePage() {
  const latestPBs = getLatestSubmissions(10);

  return (
    <div className="space-y-10">
      {/* --- Titel + uitleg --- */}
      <section>
        <h1 className="text-3xl font-bold text-gold">OSRS Boss PB Highscores</h1>
        <p className="mt-3 max-w-2xl text-neutral-300">
          Welcome to the OSRS Personal Best (PB) Highscores. This website tracks
          the fastest completion times for Old School RuneScape bosses. A RuneLite
          plugin automatically submits new personal bests to this site, keeping you
          updated with the latest top times for each boss.
        </p>
        <Link
          href="/highscores"
          className="mt-4 inline-block rounded bg-gold px-4 py-2 text-sm font-semibold text-neutral-900 hover:opacity-90"
        >
          View Highscores &rarr;
        </Link>
      </section>

      {/* --- Latest updates --- */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Latest Submissions</h2>

        {latestPBs.length === 0 ? (
          <p className="text-neutral-400">
            No personal bests yet. When the RuneLite plugin submits a PB to
            <code>/api/pb-submissions</code>, it will appear here.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Player</th>
                  <th className="px-4 py-2">Boss</th>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {latestPBs.map((pb: any) => (
                  <tr key={pb.id} className="border-t border-neutral-800">
                    <td className="px-4 py-2 font-medium">{pb.player_name}</td>
                    <td className="px-4 py-2">{pb.boss_name ?? "-"}</td>
                    <td className="px-4 py-2 text-gold">
                      {formatTime(pb.time_millis ?? 0)}
                    </td>
                    <td className="px-4 py-2 text-neutral-400">
                      {new Date(pb.submitted_at).toLocaleString("en-US")}
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
