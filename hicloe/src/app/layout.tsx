import "./globals.css";
import type { Metadata } from "next";
import { Sora, Manrope } from "next/font/google";

const heading = Sora({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-heading" });
const body = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "HiLCoE Scheduler",
  description: "Timetable generation and management for HiLCoE School of Science and Technology",
};

// Apply the saved theme before first paint (no flash).
const themeInit = `(function(){try{var t=localStorage.getItem("hilcoe-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={`${heading.variable} ${body.variable}`}>{children}</body>
    </html>
  );
}
