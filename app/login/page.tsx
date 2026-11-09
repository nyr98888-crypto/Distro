import { redirect } from "next/navigation";

/** Canonical login path used in Chrome Web Store reviewer instructions. */
export default function LoginPage() {
  redirect("/signin");
}
