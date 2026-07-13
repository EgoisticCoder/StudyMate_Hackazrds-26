"use client";

import ScrollReveal from "./ScrollReveal";

export default function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Tell us about yourself",
      desc: "6-step signup: class, board, ambition, motive, subject relationships, and commitment level. We build your cognitive profile from Day 1.",
    },
    {
      num: "02",
      title: "Study with focus",
      desc: "Use the deep work timer, take AI quizzes, ask doubts, grade your answers. Every interaction feeds the adaptive engine.",
    },
    {
      num: "03",
      title: "Get personalized nudges",
      desc: "Your AI identifies avoided subjects, tracks mood, detects fake stress, and surfaces the exact topics you need right now — no generic advice.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 bg-surface-dim">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-primary text-[11px] font-semibold tracking-[2px] uppercase mb-3">
            HOW IT WORKS
          </p>
          <h2 className="text-foreground text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight max-w-xl mb-12">
            From onboarding to exam day — your AI evolves with you
          </h2>
        </ScrollReveal>

        <div className="flex flex-col lg:flex-row items-stretch gap-0">
          {steps.map((s, i) => (
            <div key={s.num} className="flex flex-col lg:flex-row items-center">
              <ScrollReveal delay={i * 120} className="flex-1">
                <div className="rounded-2xl border border-border bg-surface p-8">
                  <span className="block text-4xl font-extrabold text-primary opacity-20 font-mono mb-4">
                    {s.num}
                  </span>
                  <h3 className="text-foreground text-lg font-semibold mb-2">
                    {s.title}
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {s.desc}
                  </p>
                </div>
              </ScrollReveal>
              {i < steps.length - 1 && (
                <div className="hidden lg:block w-12 min-w-12 h-0.5 bg-border" />
              )}
              {i < steps.length - 1 && (
                <div className="lg:hidden w-0.5 h-8 bg-border my-2" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
