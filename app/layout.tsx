import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OSRS Boss PB Highscores",
  description: "Personal best highscores for OSRS bosses, submitted via a RuneLite plugin.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Simple navigation bar, visible on every page */}
        <header className="border-b border-neutral-800">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="text-lg font-bold text-gold">
              PB Highscores
            </Link>
            <div className="flex gap-6 text-sm">
              <Link href="/" className="hover:text-gold">
                Home
              </Link>
              <Link href="/highscores" className="hover:text-gold">
                Highscores
              </Link>
            </div>
          </nav>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
