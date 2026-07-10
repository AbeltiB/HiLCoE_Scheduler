"use client";
import { useEffect, useState } from "react";

const KEY = "hilcoe-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(KEY, next ? "dark" : "light");
  }

  // Avoid a flash of the wrong icon before hydration settles.
  if (!mounted) return <div className={`h-9 w-9 shrink-0 ${className}`} />;

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={`group relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden
        rounded-full border border-line bg-card transition-colors hover:border-line-strong ${className}`}
    >
      <svg
        viewBox="0 0 24 24" width="17" height="17" fill="none"
        className={`absolute transition-all duration-300 ${dark ? "translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}
      >
        <circle cx="12" cy="12" r="4.6" stroke="currentColor" strokeWidth="1.8" className="text-warning" />
        <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-warning">
          <path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1 5.6 5.6" />
        </g>
      </svg>
      <svg
        viewBox="0 0 24 24" width="16" height="16" fill="none"
        className={`absolute transition-all duration-300 ${dark ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"}`}
      >
        <path
          d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z"
          fill="currentColor" className="text-brand"
        />
      </svg>
    </button>
  );
}
