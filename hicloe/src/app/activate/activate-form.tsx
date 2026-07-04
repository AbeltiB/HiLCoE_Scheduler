"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ActivateForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return <div className="msg error">Missing activation token. Use the link from your email.</div>;
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirm }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) return router.push("/");
    setError(data.error ?? "Activation failed");
  }

  return (
    <div>
      <label htmlFor="password">New password</label>
      <input id="password" type="password" autoComplete="new-password" value={password}
        onChange={(e) => setPassword(e.target.value)} />
      <label htmlFor="confirm">Confirm password</label>
      <input id="confirm" type="password" autoComplete="new-password" value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()} />
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>
        At least 10 characters with an uppercase letter, a lowercase letter, and a digit.
      </p>
      <button onClick={submit} disabled={busy || !password || !confirm}>
        {busy ? "Activating…" : "Activate account"}
      </button>
      {error && <div className="msg error">{error}</div>}
    </div>
  );
}
