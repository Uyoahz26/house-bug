"use client";

import { Button } from "@heroui/react";
import { ReactNode, Suspense, useEffect, useMemo, useState } from "react";
import { ConfirmDialogProvider } from "@/components/providers/confirm-dialog-provider";
import Image from "next/image";
import { Home, LogOut, Package, SlidersHorizontal, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type UserProfile = {
  id: string;
  username: string;
  role: string;
};

type NavKey = "dashboard" | "inventory" | "add" | "settings" | "users";

interface NavItem {
  key: NavKey;
  label: string;
  icon: typeof Home;
  href: string;
}

const BASE_NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: Home, href: "/dashboard" },
  { key: "inventory", label: "物资", icon: Package, href: "/items" },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    key: "users",
    label: "用户管理",
    icon: Users,
    href: "/settings/users",
  },
  {
    key: "settings",
    label: "系统配置",
    icon: SlidersHorizontal,
    href: "/settings/system",
  },
];

export default function MainLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <MainLayoutContent>{children}</MainLayoutContent>
    </Suspense>
  );
}

function MainLayoutContent({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const response = await fetch("/api/auth/me");
        if (!response.ok) return;
        const payload = (await response.json()) as { data?: UserProfile };
        if (payload.data) setUser(payload.data);
      } catch {
        // Keep layout resilient even if user info fetch fails.
      }
    }

    void loadUser();
  }, []);

  const navItems = useMemo(() => {
    if (user?.role === "admin") {
      return [...BASE_NAV_ITEMS, ...ADMIN_NAV_ITEMS];
    }

    return BASE_NAV_ITEMS;
  }, [user?.role]);

  const activeNav = useMemo<NavKey>(() => {
    const quickAdd = searchParams.get("quickAdd") === "1";

    if (pathname.startsWith("/dashboard")) return "dashboard";
    if (pathname.startsWith("/settings/users")) return "users";
    if (pathname.startsWith("/settings/system")) return "settings";
    if (pathname.startsWith("/settings")) return "settings";
    if (pathname.startsWith("/items") && quickAdd) return "add";
    if (pathname.startsWith("/items")) return "inventory";
    return "dashboard";
  }, [pathname, searchParams]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <ConfirmDialogProvider>
      <div className="relative min-h-screen bg-white text-zinc-900 dark:bg-black dark:text-zinc-100 md:pl-64">
        {/* Background layer */}
        <div className="fixed inset-0 z-0 pointer-events-none flex justify-center">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] [background-size:64px_64px] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_20%,transparent_100%)]" />
          <div className="absolute -top-32 h-[400px] w-[800px] bg-gradient-to-b from-zinc-200/50 to-transparent opacity-60 blur-3xl dark:from-indigo-900/20" />
          <div className="absolute top-[20%] h-[300px] w-[500px] rounded-full bg-zinc-100/50 blur-[100px] dark:bg-cyan-900/10" />
        </div>

        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-zinc-200/50 bg-white/70 px-5 py-6 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-[#0f0f10]/70 md:flex">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
              <Image
                src="/logo.svg"
                alt="HomeBug Logo"
                width={20}
                height={20}
                className="h-5 w-5 dark:invert"
                priority
              />
            </div>
            <span className="text-2xl font-semibold tracking-tight">
              HomeBug
            </span>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.key;
              return (
                <Button
                  key={item.key}
                  onPress={() => router.push(item.href)}
                  className={`justify-start gap-3 px-3 text-[15px] font-medium ${
                    isActive
                      ? "bg-black text-white hover:bg-black/95 dark:bg-white dark:text-black dark:hover:bg-white"
                      : "bg-transparent text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Button>
              );
            })}
          </nav>

          <Button
            variant="ghost"
            onPress={handleLogout}
            className="justify-start gap-3 px-3 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 border-none dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <LogOut className="h-5 w-5" />
            Logout
          </Button>
        </aside>

        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-zinc-200/50 bg-white/70 px-4 py-2 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70 md:hidden">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
              <Image
                src="/logo.svg"
                alt="HomeBug Logo"
                width={18}
                height={18}
                className="h-[18px] w-[18px] dark:invert"
                priority
              />
            </div>
            <span className="text-xl font-semibold tracking-tight">
              HomeBug
            </span>
          </div>
          <Button
            isIconOnly
            variant="ghost"
            onPress={handleLogout}
            aria-label="退出登录"
            className="h-10 w-10 rounded-full border-none"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 bg-zinc-800 text-sm font-semibold text-white dark:border-zinc-600 dark:bg-zinc-200 dark:text-black">
              {(user?.username?.slice(0, 1) || "N").toUpperCase()}
            </div>
          </Button>
        </header>

        <div className="relative z-10 pb-24 md:pb-0">{children}</div>

        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200/50 bg-white/70 px-3 py-2 backdrop-blur-xl dark:border-zinc-800/50 dark:bg-black/70 md:hidden">
          <div
            className="mx-auto grid max-w-md gap-1"
            style={{
              gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))`,
            }}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.key;
              return (
                <Button
                  key={item.key}
                  variant="ghost"
                  onPress={() => router.push(item.href)}
                  className={`h-14 flex-col gap-1 rounded-xl border-none px-2 ${
                    isActive
                      ? "text-black dark:text-white"
                      : "text-zinc-400 dark:text-zinc-500"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "scale-105" : ""}`} />
                  <span className="text-[11px] font-medium leading-none">
                    {item.label}
                  </span>
                </Button>
              );
            })}
          </div>
        </nav>
      </div>
    </ConfirmDialogProvider>
  );
}
