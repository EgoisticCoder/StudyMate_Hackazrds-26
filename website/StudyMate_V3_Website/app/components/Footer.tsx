"use client";

import { useTheme } from "./ThemeProvider";
import Image from "next/image";

export default function Footer() {
  const { theme } = useTheme();
  const logoSrc = theme === "dark" ? "/logo_dark.png" : "/logo_light.png";

  return (
    <footer className="border-t border-border bg-surface-dim py-10">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src={logoSrc} alt="StudyMate" width={28} height={28} className="object-contain" />
          <div>
            <strong className="text-sm text-foreground">StudyMate AI</strong>
            <p className="text-[10px] tracking-[1.5px] text-muted mt-0.5">
              BUILT FOR INDIAN STUDENTS
            </p>
          </div>
        </div>
        <p className="text-xs text-muted">
          Built with ❤️ by <strong className="text-foreground">TestingGuyz</strong> for HackHazards 2026
        </p>
        <div className="flex gap-6">
          {["GitHub", "Privacy", "Terms"].map((l) => (
            <a key={l} href="#" className="text-xs text-muted hover:text-foreground transition-colors">
              {l}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
