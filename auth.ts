import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { upsertDiscordUser } from "@/lib/db";

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Discord],
  callbacks: {
    signIn({ user, account, profile }) {
      const discordId =
        account?.provider === "discord"
          ? optionalString(account.providerAccountId)
          : null;

      if (!discordId) {
        console.error("Discord sign-in rejected: profile has no valid Discord ID");
        return false;
      }

      try {
        const databaseUser = upsertDiscordUser({
          discordId,
          discordUsername: optionalString(profile?.username),
          displayName:
            optionalString(profile?.global_name) ?? optionalString(user.name),
          avatarUrl: optionalString(user.image),
        });

        user.databaseUserId = databaseUser.id;
        user.discordId = databaseUser.discordId;
        user.discordUsername = databaseUser.discordUsername;
        user.displayName = databaseUser.displayName;
        return true;
      } catch {
        console.error("Discord sign-in rejected: database synchronization failed");
        return false;
      }
    },
    jwt({ token, user }) {
      if (user?.databaseUserId && user.discordId) {
        token.databaseUserId = user.databaseUserId;
        token.discordId = user.discordId;
        token.discordUsername = user.discordUsername ?? null;
        token.displayName = user.displayName ?? null;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user && token.databaseUserId && token.discordId) {
        session.user.id = String(token.databaseUserId);
        session.user.discordId = token.discordId;
        session.user.discordUsername = token.discordUsername ?? null;
        session.user.displayName = token.displayName ?? null;
      }

      return session;
    },
  },
});
