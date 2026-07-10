"use client";
import { useEffect, type ReactNode } from "react";

export function Btn({
  children, onClick, variant = "primary", disabled, type = "button", small,
}: {
  children: ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "primary" | "ghost" | "danger"; type?: "button" | "submit"; small?: boolean;
}) {
  const base = `inline-flex items-center justify-center gap-1.5 rounded-control font-semibold cursor-pointer
    disabled:opacity-50 disabled:cursor-default disabled:translate-y-0 transition-all
    ${small ? "px-2.5 py-1 text-[12.5px]" : "px-3.5 py-2 text-[13.5px]"}`;
  const styles = {
    primary: "text-white shadow-[0_6px_16px_-6px_var(--brand-soft)] hover:brightness-110 hover:-translate-y-px active:translate-y-0",
    ghost: "border border-line bg-card-strong text-ink hover:border-line-strong hover:bg-surface",
    danger: "bg-danger-soft text-danger hover:bg-danger hover:text-white",
  }[variant];
  const style = variant === "primary"
    ? { background: "linear-gradient(135deg, var(--brand-bright), var(--brand-deep))" }
    : undefined;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`} style={style}>
      {children}
    </button>
  );
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "blue" | "green" | "red" | "amber" }) {
  const tones = {
    gray: "bg-surface text-ink-muted border-line",
    blue: "bg-brand-soft text-brand border-brand-soft",
    green: "bg-success-soft text-success border-success-soft",
    red: "bg-danger-soft text-danger border-danger-soft",
    amber: "bg-warning-soft text-warning border-warning-soft",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold ${tones}`}>
      {children}
    </span>
  );
}

export function Modal({ title, open, onClose, children, wide }: {
  title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} max-h-[88dvh] overflow-y-auto rounded-card border border-line bg-card-strong p-6 shadow-2xl backdrop-blur-2xl`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-surface hover:text-ink cursor-pointer text-lg leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Alert({ kind, children }: { kind: "error" | "info" | "success"; children: ReactNode }) {
  const cls = {
    error: "bg-danger-soft text-danger border-danger-soft",
    info: "bg-brand-soft text-brand border-brand-soft",
    success: "bg-success-soft text-success border-success-soft",
  }[kind];
  return <div className={`mt-3 rounded-control border px-3.5 py-2.5 text-[13px] ${cls}`}>{children}</div>;
}

export type Option = { value: string; label: string };

export function MultiSelect({ options, value, onChange }: {
  options: Option[]; value: string[]; onChange: (v: string[]) => void;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className="max-h-44 overflow-y-auto rounded-control border border-line bg-card-strong p-1.5">
      {options.length === 0 && <div className="px-2 py-1 text-[13px] text-ink-faint">No options available</div>}
      {options.map((o) => (
        <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] hover:bg-surface !mt-0 !mb-0 font-normal">
          <input type="checkbox" className="!w-auto" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-ink-faint">{children}</th>;
}
export function Td({ children }: { children: ReactNode }) {
  return <td className="px-3 py-2.5 text-[13.5px]">{children}</td>;
}
