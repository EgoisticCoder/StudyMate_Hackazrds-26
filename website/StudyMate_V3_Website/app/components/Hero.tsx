"use client";

import { useState } from "react";
import InstallModal from "./InstallModal";

export default function Hero() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <section
        id="hero"
        className="relative min-h-screen flex items-center justify-center text-center overflow-hidden bg-gradient-to-b from-surface-dim via-background to-surface"
      >
        {/* Glow orbs */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,var(--color-primary)_0%,transparent_70%)] opacity-10 pointer-events-none animate-glow" />
        <div className="absolute bottom-[-15%] right-[-8%] w-[400px] h-[400px] rounded-full bg-[radial-gradient(circle,var(--color-accent)_0%,transparent_70%)] opacity-10 pointer-events-none animate-glow" style={{ animationDelay: "3s" }} />

        <div className="relative z-10 max-w-[720px] px-6 pt-28 pb-20 animate-[fadeUp_0.8s_ease-out]">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent/10 text-accent text-[11px] font-semibold tracking-[1.5px] mb-7 border border-accent/20">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-dot" />
            FOR ICSE &amp; CBSE STUDENTS
          </div>

          <h1 className="text-foreground text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight mb-5">
            The study partner that actually{" "}
            <span className="gradient-text">knows you</span>
          </h1>

          <p className="text-muted text-base sm:text-lg max-w-[560px] mx-auto mb-9 leading-relaxed">
            Master your syllabus with AI-driven behavioral tracking, personalized
            nudges, and a focus environment designed for the rigorous demands of
            the Indian curriculum.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-14">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg bg-primary text-white font-semibold text-[15px] hover:-translate-y-0.5 transition-all glow-primary"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Install App
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-lg border border-border text-foreground font-semibold text-[15px] hover:bg-surface-dim transition-colors"
            >
              See Dashboard →
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 pt-8 border-t border-border">
            {[
              { num: "40", label: "Features" },
              { num: "7", label: "Behavioral Rules" },
              { num: "100%", label: "Syllabus Aligned" },
              { num: "Live", label: "AI Adaptation" },
            ].map((s, i) => (
              <div key={s.label} className="flex items-center gap-6 sm:gap-8">
                {i > 0 && (
                  <div className="hidden sm:block w-px h-8 bg-border" />
                )}
                <div className="text-center">
                  <span className="block text-foreground text-2xl font-bold">
                    {s.num}
                  </span>
                  <span className="text-muted text-xs tracking-wide">
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted animate-bounce">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </section>

      <InstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
