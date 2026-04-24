import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/auth/jwt";

export const runtime = "edge";

export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  // Check if user is authenticated
  if (token) {
    try {
      await verifyToken(token);
      // User is authenticated, redirect to dashboard
      redirect("/dashboard");
    } catch {
      // Token is invalid, redirect to login
      redirect("/login");
    }
  }

  // No token, redirect to login
  redirect("/login");
}
