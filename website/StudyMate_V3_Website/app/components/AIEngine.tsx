"use client";

import ScrollReveal from "./ScrollReveal";

const cards = [
  {
    num: "01",
    title: "buildStudentContext()",
    desc: 'Runs before every single AI call. Pulls 7 parallel Neo4j queries — quiz scores, mood logs, study sessions, subject relationships — and computes a live behavioral profile in real time.',
  },
  {
    num: "02",
    title: "Recency Weighting",
    desc: "Last 7 days = 3.0× weight. Last 30 days = 1.5×. Older = 0.5×. A student who improves is immediately reclassified. No stale labels, ever.",
  },
  {
    num: "03",
    title: "Four Behavioral States",
    desc: "Each subject classified as: EMPIRICALLY_WEAK, AVOIDED_AND_WEAK, AVOIDED_BUT_STRONG, ACTIVE_AND_STRONG. Each gets a completely different AI tone.",
  },
  {
    num: "04",
    title: "Boring ≠ Weak",
    desc: "Cross-references signup interest sliders against live performance. Hates Bio but scores 85%? That's AVOIDED_BUT_STRONG. Treated completely differently from actual weakness.",
  },
  {
    num: "05",
    title: "Ambition Mapping",
    desc: "Doctor → Bio + Chemistry are priority. Engineer → Maths + Physics. If a priority subject enters AVOIDED_AND_WEAK, the AI escalates urgency and connects it to their career goal.",
  },
  {
    num: "06",
    title: "Crisis Detection",
    desc: "Stress = 5 for 3 consecutive days → automatic crisis card with iCall 9152987821. Non-negotiable. No animation. Appears instantly. Student safety is paramount.",
  },
];

export default function AIEngine() {
  return (
    <section id="engine" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-primary text-[11px] font-semibold tracking-[2px] uppercase mb-3">
            UNDER THE HOOD
          </p>
          <h2 className="text-foreground text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight max-w-xl mb-12">
            The adaptive engine that makes StudyMate different
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <ScrollReveal key={c.num} delay={i * 80}>
              <div className="rounded-2xl border border-border bg-surface p-7 h-full transition-all hover:-translate-y-0.5">
                <span className="block text-3xl font-extrabold text-primary opacity-20 font-mono mb-3">
                  {c.num}
                </span>
                <h3 className="text-foreground text-base font-semibold mb-2">
                  {c.title}
                </h3>
                <p className="text-muted text-[13px] leading-relaxed">
                  {c.desc}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
