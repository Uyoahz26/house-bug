"use client";

import Link from "next/link";
import { Card } from "@heroui/react";

export default function SettingsHomePage() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">设置中心</h1>
        <p className="mt-2 text-sm text-zinc-600">
          选择要管理的设置模块：用户管理已独立成模块，系统配置用于维护数据字典与参数。
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link href="/settings/users">
            <Card
              className="border border-zinc-200 transition hover:-translate-y-0.5"
              variant="default"
            >
              <Card.Content className="p-5">
                <h2 className="text-base font-semibold">用户管理</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  管理家庭成员账号、禁用账号、重置密码。
                </p>
              </Card.Content>
            </Card>
          </Link>

          <Link href="/settings/system">
            <Card
              className="border border-zinc-200 transition hover:-translate-y-0.5"
              variant="default"
            >
              <Card.Content className="p-5">
                <h2 className="text-base font-semibold">系统配置</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  配置存储、OCR、邮件、Cron、分类下拉、存放位置下拉与单位选项。
                </p>
              </Card.Content>
            </Card>
          </Link>
        </div>
      </section>
    </main>
  );
}
