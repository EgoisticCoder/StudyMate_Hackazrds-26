"use client";

import { useTheme } from "./ThemeProvider";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import InstallModal from "./InstallModal";

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const logoSrc = theme === "dark" ? "/logo_dark.png" : "/logo_light.png";

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 backdrop-blur-xl transition-all duration-300 ${
          scrolled
            ? "border-b border-border bg-background/80"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3.5">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2.5 no-underline">
            <Image src={logoSrc} alt="StudyMate" width={32} height={32} className="object-contain" />
            <span className="text-foreground font-bold text-[17px]">
              StudyMate AI
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-7">
            {[
              { href: "#features", label: "Features" },
              { href: "#dashboard", label: "Dashboard" },
              { href: "#engine", label: "AI Engine" },
              { href: "#testimonials", label: "Students" },
            ].map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-muted text-sm font-medium hover:text-foreground transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-muted hover:bg-surface-dim transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="hidden md:inline-flex items-center justify-center px-5 py-2 rounded-lg bg-primary text-white font-medium text-sm hover:opacity-90 transition-opacity"
            >
              Download App
            </button>

            {/* Mobile menu */}
            <button
              className="flex md:hidden flex-col gap-1 p-2"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              <span className="block w-5 h-0.5 bg-foreground rounded" />
              <span className="block w-5 h-0.5 bg-foreground rounded" />
              <span className="block w-5 h-0.5 bg-foreground rounded" />
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border bg-background px-6 py-4 flex flex-col gap-4">
            {["Features", "Dashboard", "AI Engine", "Students"].map((l) => (
              <a
                key={l}
                href={`#${l.toLowerCase().replace(" ", "-")}`}
                className="text-muted text-sm font-medium hover:text-foreground"
                onClick={() => setMobileOpen(false)}
              >
                {l}
              </a>
            ))}
            <button
              onClick={() => {
                setMobileOpen(false);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-primary text-white dark:text-[#181445] font-semibold text-sm"
            >
              Download App
            </button>
          </div>
        )}
      </nav>

      <InstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
