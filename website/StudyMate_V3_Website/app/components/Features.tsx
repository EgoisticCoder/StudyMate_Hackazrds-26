"use client";

import ScrollReveal from "./ScrollReveal";

const features = [
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    ),
    title: "Adaptive Behavioral Engine",
    desc: "7 behavioral rules computed live from Neo4j before every AI call. Your weaknesses are NEVER static — recency-weighted scoring reclassifies you in real-time.",
    highlight: true,
    badge: "CORE",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
    ),
    title: "Syllabus Mapping",
    desc: "Direct integration with ICSE and CBSE guidelines. Every quiz and note is scoped to your exact curriculum.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    ),
    title: "Cognitive Analytics",
    desc: "Four behavioral states per subject — EMPIRICALLY_WEAK, AVOIDED_AND_WEAK, AVOIDED_BUT_STRONG, ACTIVE_AND_STRONG.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    ),
    title: "Deep Work Mode",
    desc: "Zero distractions. Full screen, always dark, only the timer. Subject-tagged Pomodoro sessions logged to Neo4j.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    ),
    title: "AI Answer Grader",
    desc: "Photograph your handwritten answer. Get marks per category, examiner feedback, missed points, and model answer outlines.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    ),
    title: "AI Doubt Solver",
    desc: "Type or photograph any question. Full student context injected — responses reference your actual weak areas and profile.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    ),
    title: "Anti-Fake-Stress Detection",
    desc: "Claims stress but hasn't studied? We know. Genuine burnout gets real rest advice. Avoidance gets 15-min micro-sessions.",
  },
  {
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    ),
    title: "Smart Calendar & Exams",
    desc: "Track exams, study sessions, and events with intelligent scheduling and push notifications.",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-primary text-[11px] font-semibold tracking-[2px] uppercase mb-3">
            ENGINEERED FOR FOCUS
          </p>
          <h2 className="text-foreground text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight max-w-xl mb-12">
            Minimalist tools built for top-tier academic performance
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <ScrollReveal
              key={f.title}
              delay={i * 80}
              className={f.highlight ? "sm:col-span-2" : ""}
            >
              <div
                className={`relative rounded-2xl border p-7 h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${
                  f.highlight
                    ? "bg-gradient-to-br from-[#1E1B4B] to-[#070235] text-white border-transparent"
                    : "bg-surface border-border hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
                }`}
              >
                {f.badge && (
                  <span className="absolute top-4 right-4 text-[9px] font-bold tracking-[1.5px] px-2 py-0.5 rounded bg-accent text-black">
                    {f.badge}
                  </span>
                )}
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${
                    f.highlight
                      ? "bg-white/15 text-white"
                      : "bg-surface-dim text-primary"
                  }`}
                >
                  {f.icon}
                </div>
                <h3 className={`text-base font-semibold mb-2 ${f.highlight ? "text-white" : "text-foreground"}`}>
                  {f.title}
                </h3>
                <p
                  className={`text-[13px] leading-relaxed ${
                    f.highlight ? "text-white/80" : "text-muted"
                  }`}
                >
                  {f.desc}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
