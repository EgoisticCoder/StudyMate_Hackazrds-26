"use client";

import Image from "next/image";
import { useState } from "react";
import ScrollReveal from "./ScrollReveal";

const screenshots = [
  {
    badge: "HOME",
    title: "Adaptive Dashboard",
    desc: "Streak tracking, AI nudges, mood check-in, and quick actions — all powered by live Neo4j data.",
    src: "/screenshot_dashboard.png",
    alt: "StudyMate AI Dashboard",
  },
  {
    badge: "AI GRADER",
    title: "Answer Sheet Evaluation",
    desc: "Photograph answers, get board-standard marking with content, language, and presentation scores.",
    src: "/screenshot_grader.png",
    alt: "StudyMate AI Answer Grader",
  },
  {
    badge: "FOCUS",
    title: "Deep Work Timer",
    desc: "Full screen, always dark, zero distractions. Subject-tagged sessions with automatic Neo4j logging.",
    src: "/screenshot_timer.png",
    alt: "StudyMate AI Focus Timer",
  },
];

export default function DashboardPreview() {
  const [active, setActive] = useState(0);

  return (
    <section id="dashboard" className="py-24 px-6 bg-surface-dim">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-primary text-[11px] font-semibold tracking-[2px] uppercase mb-3">
            PREVIEW THE EXPERIENCE
          </p>
          <h2 className="text-foreground text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight max-w-xl mb-4">
            Your AI study dashboard — live from the app
          </h2>
          <p className="text-muted text-base max-w-xl leading-relaxed mb-12">
            Every screen is designed with intention. Dark mode for late-night study.
            Light mode for daytime. The AI adapts its tone based on your live behavioral data.
          </p>
        </ScrollReveal>

        {/* Desktop: 3 cards in row */}
        <div className="hidden md:grid grid-cols-3 gap-6 mb-6">
          {screenshots.map((s, i) => (
            <ScrollReveal key={s.title} delay={i * 100}>
              <div className="rounded-2xl border border-border bg-surface overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-lg cursor-pointer">
                <div className="p-6 pb-4">
                  <span className="inline-block text-[10px] font-bold tracking-[1.5px] px-2.5 py-1 rounded bg-primary text-white dark:text-[#181445] mb-3">
                    {s.badge}
                  </span>
                  <h3 className="text-foreground text-base font-semibold mb-1.5">
                    {s.title}
                  </h3>
                  <p className="text-muted text-[13px] leading-relaxed">
                    {s.desc}
                  </p>
                </div>
                <div className="px-4 pb-4">
                  <Image
                    src={s.src}
                    alt={s.alt}
                    width={400}
                    height={400}
                    className="w-full rounded-xl shadow-md"
                  />
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Mobile: carousel */}
        <div className="md:hidden">
          <div className="rounded-2xl border border-border bg-surface overflow-hidden mb-4">
            <div className="p-5 pb-3">
              <span className="inline-block text-[10px] font-bold tracking-[1.5px] px-2.5 py-1 rounded bg-primary text-white dark:text-[#181445] mb-3">
                {screenshots[active].badge}
              </span>
              <h3 className="text-foreground text-base font-semibold mb-1">
                {screenshots[active].title}
              </h3>
              <p className="text-muted text-[13px] leading-relaxed">
                {screenshots[active].desc}
              </p>
            </div>
            <div className="px-4 pb-4">
              <Image
                src={screenshots[active].src}
                alt={screenshots[active].alt}
                width={400}
                height={400}
                className="w-full rounded-xl shadow-md"
              />
            </div>
          </div>
          <div className="flex justify-center gap-2">
            {screenshots.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`h-2 rounded-full transition-all ${
                  i === active
                    ? "w-6 bg-primary"
                    : "w-2 bg-border"
                }`}
                aria-label={`Screenshot ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
