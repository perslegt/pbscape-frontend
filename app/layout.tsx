import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { DiscordLoginButton } from "@/app/components/auth-buttons";
import "./globals.css";

export const metadata: Metadata = {
  title: "OSRS Boss PB Highscores",
  description: "Personal best highscores for OSRS bosses, submitted via a RuneLite plugin.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const name = session?.user?.name ?? "Discord user";

  return (
    <html lang="en">
      <body>
        {/* Simple navigation bar, visible on every page */}
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-bold text-gold">
              PB Highscores
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <Link href="/" className="hover:text-gold">
                Home
              </Link>
              <Link href="/highscores" className="hover:text-gold">
                Highscores
              </Link>
              {session?.user?.role === "admin" && (
                <Link href="/admin" className="hover:text-gold">
                  Admin
                </Link>
              )}
              {session?.user ? (
                <Link href="/account" className="hover:text-gold">
                  {name}
                </Link>
              ) : (
                <DiscordLoginButton />
              )}
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
