import { redirect } from "next/navigation";
import { SignInScreen } from "@/components/signin/signin-screen";
import { getAuthenticatedUserId } from "@/lib/auth";
import { ensureAuthSchema } from "@/lib/ensure-auth-schema";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  try {
    await ensureAuthSchema();
    const userId = await getAuthenticatedUserId();
    if (userId) {
      redirect("/dashboard");
    }
  } catch (error) {
    // next/navigation redirect() throws; never swallow it.
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[signin/page]", error);
  }

  return <SignInScreen />;
}
