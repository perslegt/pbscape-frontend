import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAllBosses, getUserById } from "@/lib/db";
import { toggleBoss } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  const userId = Number(session?.user?.id);
  const databaseUser = Number.isInteger(userId) ? getUserById(userId) : undefined;

  if (databaseUser?.role !== "admin") {
    redirect("/");
  }

  const bosses = getAllBosses();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gold">Boss administration</h1>
        <p className="mt-2 text-neutral-400">
          Choose which bosses are visible on the highscores page.
        </p>
      </div>

      <div className="overflow-hidden rounded border border-neutral-800">
        <ul className="divide-y divide-neutral-800">
          {bosses.map((boss) => (
            <li
              key={boss.id}
              className="flex items-center justify-between gap-4 bg-neutral-900 px-4 py-3"
            >
              <div>
                <p className="font-medium">{boss.name}</p>
                <p className="text-xs text-neutral-500">{boss.slug}</p>
              </div>
              <form action={toggleBoss}>
                <input type="hidden" name="bossId" value={boss.id} />
                <input
                  type="hidden"
                  name="isActive"
                  value={String(!boss.isActive)}
                />
                <button
                  type="submit"
                  className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                    boss.isActive
                      ? "bg-green-900/60 text-green-300 hover:bg-green-900"
                      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                  }`}
                >
                  {boss.isActive ? "Active" : "Inactive"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
