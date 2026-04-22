"use client";

import Image from "next/image";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import {
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from "@heroui/react";
import { InteractiveCharacters } from "./interactive-characters";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Animation states
  const [focusedField, setFocusedField] = useState<
    "none" | "email" | "password"
  >("none");
  const [passwordLen, setPasswordLen] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email")?.toString() || "";
    const password = formData.get("password")?.toString() || "";

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        data?: Record<string, unknown>;
      };

      if (!response.ok) {
        setError(payload.error ?? "登录失败，请稍后重试。");
        return;
      }

      const nextPath = searchParams.get("next") || "/dashboard";
      router.replace(nextPath);
      router.refresh();
    } catch {
      setError("网络异常，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-2 overflow-hidden bg-white text-zinc-900 dark:bg-black dark:text-zinc-100">
      {/* PC 端动画部分，移动端隐藏 */}
      <div className="hidden lg:block relative h-full w-full overflow-hidden">
        <InteractiveCharacters
          focusMode={focusedField}
          showPassword={showPassword}
          passwordLen={passwordLen}
        />
      </div>

      {/* 登录表单部分 */}
      <div className="relative flex h-full items-center justify-center p-6 bg-white dark:bg-black">
        <div className="absolute inset-0 z-0 pointer-events-none flex justify-center">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] [background-size:64px_64px] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_0%,#000_20%,transparent_100%)]" />
          <div className="absolute -top-22 h-[400px] w-[800px] bg-gradient-to-b from-zinc-200/50 to-transparent opacity-60 blur-3xl dark:from-indigo-900/20" />
          <div className="absolute top-[20%] h-[300px] w-[500px] rounded-full bg-zinc-100/50 blur-[100px] dark:bg-cyan-900/10" />
        </div>

        <div className="relative z-10 w-full max-w-[420px] px-6">
          <div className="mb-10 flex flex-col items-center text-center">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white/50 shadow-sm backdrop-blur-xl dark:border-zinc-800 dark:bg-black/50">
              <Image
                src="/logo.svg"
                alt="HomeBug Logo"
                width={100}
                height={100}
                className="object-contain dark:invert"
              />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              HomeBug
            </h1>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              囤囤鼠的日常
            </p>
          </div>

          <Card className="w-full p-5 dark:border-zinc-800/70 dark:bg-black/60">
            <Form
              onSubmit={onSubmit}
              className="flex w-full flex-col"
              validationBehavior="native"
            >
              <Card.Content>
                <div className="flex w-full flex-col gap-5">
                  <TextField
                    isRequired
                    name="email"
                    type="email"
                    className="flex flex-col gap-1.5"
                    validate={(value) => {
                      if (
                        !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)
                      ) {
                        return "请输入有效的邮箱地址";
                      }
                      return null;
                    }}
                  >
                    <Label className="text-[13px] font-medium text-zinc-900 dark:text-white">
                      邮箱
                    </Label>
                    <Input
                      placeholder="your@email.com"
                      variant="secondary"
                      className="w-full"
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField("none")}
                    />
                    <FieldError className="text-xs text-red-500" />
                  </TextField>

                  <TextField
                    isRequired
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className="flex flex-col gap-1.5"
                  >
                    <Label className="text-[13px] font-medium text-zinc-900 dark:text-white">
                      密码
                    </Label>
                    <div className="relative w-full">
                      <Input
                        placeholder="请输入密码"
                        variant="secondary"
                        className="w-full placeholder:tracking-normal pr-10"
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField("none")}
                        onChange={(e) => setPasswordLen(e.target.value.length)}
                      />
                      <button
                        className="absolute right-0 top-0 h-full px-3 focus:outline-none flex items-center justify-center"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                        ) : (
                          <Eye className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
                        )}
                      </button>
                    </div>
                    <FieldError className="text-xs text-red-500" />
                  </TextField>

                  {error && (
                    <div className="flex items-center rounded-xl border border-red-200/50 bg-red-50/70 p-3 text-[13px] text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                      <AlertCircle className="mr-2 h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}
                </div>
              </Card.Content>

              <Card.Footer className="mt-4 flex flex-col gap-2">
                <Button
                  isPending={isSubmitting}
                  type="submit"
                  className="mt-4 h-10 w-full bg-zinc-900 text-[15px] font-medium text-white shadow-md transition-all hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : ""}
                      {isPending ? "登录中..." : "登录"}
                    </>
                  )}
                </Button>
              </Card.Footer>
            </Form>
          </Card>
        </div>
      </div>
    </main>
  );
}
