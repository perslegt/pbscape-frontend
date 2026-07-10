import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: NonNullable<DefaultSession["user"]> & {
      id: string;
      discordId: string;
      discordUsername: string | null;
      displayName: string | null;
    };
  }

  interface User {
    databaseUserId?: number;
    discordId?: string;
    discordUsername?: string | null;
    displayName?: string | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    databaseUserId?: number;
    discordId?: string;
    discordUsername?: string | null;
    displayName?: string | null;
  }
}
