import { signIn, signOut } from "@/auth";

const buttonClasses =
  "inline-flex rounded bg-gold px-4 py-2 text-sm font-semibold text-neutral-900 hover:opacity-90";

export function DiscordLoginButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("discord", { redirectTo: "/account" });
      }}
    >
      <button type="submit" className={buttonClasses}>
        Log in with Discord
      </button>
    </form>
  );
}

export function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
    >
      <button type="submit" className={buttonClasses}>
        Log out
      </button>
    </form>
  );
}
