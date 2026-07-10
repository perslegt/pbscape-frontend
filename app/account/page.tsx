import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LogoutButton } from "@/app/components/auth-buttons";

export default async function AccountPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  const name = session.user.name ?? "Discord user";

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
      <LogoutButton />
    </section>
  );
}
