"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Button,
  Card,
  Description,
  Input,
  Label,
  Spinner,
  Switch,
} from "@heroui/react";

interface UserItem {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: "admin" | "user";
  isActive: boolean;
  notifyEmail: boolean;
  createdAt: string;
}

interface UsersResponse {
  data?: UserItem[];
  error?: string;
}

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [savingById, setSavingById] = useState<Record<string, boolean>>({});

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingUsers, setEditingUsers] = useState<
    Record<
      string,
      {
        email: string;
        username: string;
        isAdmin: boolean;
        isActive: boolean;
        notifyEmail: boolean;
      }
    >
  >({});

  const activeCount = useMemo(
    () => users.filter((user) => user.isActive).length,
    [users],
  );

  async function fetchUsers() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/users");
      const payload = (await response.json()) as UsersResponse;

      if (!response.ok || !payload.data) {
        setError(payload.error ?? "获取用户列表失败。");
        return;
      }

      setUsers(payload.data);
      const nextEditing: Record<
        string,
        {
          email: string;
          username: string;
          isAdmin: boolean;
          isActive: boolean;
          notifyEmail: boolean;
        }
      > = {};
      for (const user of payload.data) {
        nextEditing[user.id] = {
          email: user.email,
          username: user.username,
          isAdmin: user.role === "admin",
          isActive: user.isActive,
          notifyEmail: user.notifyEmail,
        };
      }
      setEditingUsers(nextEditing);
    } catch {
      setError("网络异常，获取用户列表失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function onCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          password,
          role: isAdmin ? "admin" : "user",
        }),
      });

      const payload = (await response.json()) as {
        data?: UserItem;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setError(payload.error ?? "创建用户失败。");
        return;
      }

      const createdUser = payload.data;

      setUsers((prev) => [...prev, createdUser]);
      setEmail("");
      setUsername("");
      setPassword("");
      setIsAdmin(false);
      setEditingUsers((prev) => ({
        ...prev,
        [createdUser.id]: {
          email: createdUser.email,
          username: createdUser.username,
          isAdmin: createdUser.role === "admin",
          isActive: createdUser.isActive,
          notifyEmail: createdUser.notifyEmail,
        },
      }));
    } catch {
      setError("网络异常，创建用户失败。");
    } finally {
      setFormLoading(false);
    }
  }

  function hasUserChanges(user: UserItem): boolean {
    const editing = editingUsers[user.id];
    if (!editing) return false;
    return (
      editing.email.trim().toLowerCase() !== user.email ||
      editing.username.trim() !== user.username ||
      editing.isAdmin !== (user.role === "admin") ||
      editing.isActive !== user.isActive ||
      editing.notifyEmail !== user.notifyEmail
    );
  }

  async function saveUser(user: UserItem) {
    const editing = editingUsers[user.id];
    if (!editing) return;

    setError("");
    setSavingById((prev) => ({ ...prev, [user.id]: true }));

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: editing.email,
          username: editing.username,
          role: editing.isAdmin ? "admin" : "user",
          isActive: editing.isActive,
          notifyEmail: editing.notifyEmail,
        }),
      });

      const payload = (await response.json()) as {
        data?: UserItem;
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setError(payload.error ?? "更新用户失败。");
        return;
      }

      const updatedUser = payload.data;

      setUsers((prev) =>
        prev.map((item) => (item.id === updatedUser.id ? updatedUser : item)),
      );

      setEditingUsers((prev) => ({
        ...prev,
        [updatedUser.id]: {
          email: updatedUser.email,
          username: updatedUser.username,
          isAdmin: updatedUser.role === "admin",
          isActive: updatedUser.isActive,
          notifyEmail: updatedUser.notifyEmail,
        },
      }));
    } catch {
      setError("网络异常，更新用户失败。");
    } finally {
      setSavingById((prev) => ({ ...prev, [user.id]: false }));
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-900">
      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold">用户管理</h1>
        <p className="mt-2 text-sm text-zinc-600">
          当前共 {users.length} 个账号，{activeCount} 个启用。
        </p>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Card className="mt-6 border border-zinc-200 p-5" variant="default">
          <Card.Content>
            <h2 className="text-base font-semibold">添加用户</h2>
            <form
              className="mt-4 grid gap-3 sm:grid-cols-2"
              onSubmit={onCreateUser}
            >
              <div className="grid gap-1">
                <Label htmlFor="user-email">邮箱</Label>
                <Input
                  id="user-email"
                  aria-label="邮箱"
                  type="email"
                  placeholder="邮箱"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="user-username">用户名</Label>
                <Input
                  id="user-username"
                  aria-label="用户名"
                  type="text"
                  placeholder="用户名"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="user-password">初始密码</Label>
                <Input
                  id="user-password"
                  aria-label="初始密码"
                  type="password"
                  placeholder="至少 6 位"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-1">
                <Label>是否管理员</Label>
                <Switch
                  isSelected={isAdmin}
                  onChange={setIsAdmin}
                  aria-label="是否管理员"
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <Label>{isAdmin ? "管理员" : "普通用户"}</Label>
                  </Switch.Content>
                </Switch>
              </div>
              <Button
                type="submit"
                variant="primary"
                className="sm:col-span-2"
                isPending={formLoading}
              >
                {formLoading ? "创建中..." : "创建用户"}
              </Button>
            </form>
          </Card.Content>
        </Card>

        <Card className="mt-6 border border-zinc-200 p-5" variant="default">
          <Card.Content>
            <h2 className="text-base font-semibold">账号列表</h2>

            {loading ? (
              <div className="mt-3 flex items-center gap-2 text-sm text-zinc-500">
                <Spinner size="sm" />
                加载中...
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {users.map((user) => (
                  <Card
                    key={user.id}
                    variant="transparent"
                    className="border border-zinc-200 p-3"
                  >
                    <Card.Content className="space-y-4">
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          {user.avatarUrl ? (
                            <Avatar.Image
                              alt={user.username}
                              src={user.avatarUrl}
                            />
                          ) : null}
                          <Avatar.Fallback>
                            {user.username.slice(0, 1).toUpperCase()}
                          </Avatar.Fallback>
                        </Avatar>
                        <div className="flex min-w-0 flex-col">
                          <Label>{user.username}</Label>
                          <Description>{user.email}</Description>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <Label htmlFor={`username-${user.id}`}>用户名</Label>
                          <Input
                            id={`username-${user.id}`}
                            value={editingUsers[user.id]?.username ?? ""}
                            onChange={(event) =>
                              setEditingUsers((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {
                                    email: user.email,
                                    username: user.username,
                                    isAdmin: user.role === "admin",
                                    isActive: user.isActive,
                                    notifyEmail: user.notifyEmail,
                                  }),
                                  username: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>

                        <div className="grid gap-1">
                          <Label htmlFor={`email-${user.id}`}>邮箱</Label>
                          <Input
                            id={`email-${user.id}`}
                            type="email"
                            value={editingUsers[user.id]?.email ?? ""}
                            onChange={(event) =>
                              setEditingUsers((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {
                                    email: user.email,
                                    username: user.username,
                                    isAdmin: user.role === "admin",
                                    isActive: user.isActive,
                                    notifyEmail: user.notifyEmail,
                                  }),
                                  email: event.target.value,
                                },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                          <Switch
                            isSelected={editingUsers[user.id]?.isAdmin ?? false}
                            onChange={(selected) =>
                              setEditingUsers((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {
                                    email: user.email,
                                    username: user.username,
                                    isAdmin: user.role === "admin",
                                    isActive: user.isActive,
                                    notifyEmail: user.notifyEmail,
                                  }),
                                  isAdmin: selected,
                                },
                              }))
                            }
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Content>
                              <Label>是否管理员</Label>
                            </Switch.Content>
                          </Switch>

                          <Switch
                            isSelected={editingUsers[user.id]?.isActive ?? true}
                            onChange={(selected) =>
                              setEditingUsers((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {
                                    email: user.email,
                                    username: user.username,
                                    isAdmin: user.role === "admin",
                                    isActive: user.isActive,
                                    notifyEmail: user.notifyEmail,
                                  }),
                                  isActive: selected,
                                },
                              }))
                            }
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Content>
                              <Label>
                                {(editingUsers[user.id]?.isActive ?? true)
                                  ? "账号启用"
                                  : "账号禁用"}
                              </Label>
                            </Switch.Content>
                          </Switch>

                          <Switch
                            isSelected={
                              editingUsers[user.id]?.notifyEmail ?? false
                            }
                            onChange={(selected) =>
                              setEditingUsers((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {
                                    email: user.email,
                                    username: user.username,
                                    isAdmin: user.role === "admin",
                                    isActive: user.isActive,
                                    notifyEmail: user.notifyEmail,
                                  }),
                                  notifyEmail: selected,
                                },
                              }))
                            }
                          >
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Content>
                              <Label>
                                {(editingUsers[user.id]?.notifyEmail ?? false)
                                  ? "邮件提醒开启"
                                  : "邮件提醒关闭"}
                              </Label>
                            </Switch.Content>
                          </Switch>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          isPending={savingById[user.id] === true}
                          isDisabled={!hasUserChanges(user)}
                          onPress={() => void saveUser(user)}
                        >
                          保存修改
                        </Button>
                      </div>
                    </Card.Content>
                  </Card>
                ))}
              </div>
            )}
          </Card.Content>
        </Card>
      </section>
    </main>
  );
}
