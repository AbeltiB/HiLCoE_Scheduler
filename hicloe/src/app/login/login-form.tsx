"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return router.push(next);
    setMsg({
      kind: data.pendingActivation ? "info" : "error",
      text: data.message ?? data.error ?? "Sign-in failed",
    });
  }

  return (
    <div>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="email" value={email}
        onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label>
      <input id="password" type="password" autoComplete="current-password" value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()} />
      <button onClick={submit} disabled={busy || !email || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}
