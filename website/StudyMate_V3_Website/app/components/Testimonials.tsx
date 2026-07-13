"use client";

import ScrollReveal from "./ScrollReveal";

const testimonials = [
  {
    text: "StudyMate caught that I was avoiding Chemistry for 3 weeks. The nudges were annoyingly accurate — but they worked.",
    name: "Ananya K.",
    school: "ICSE Class 10",
  },
  {
    text: "The focus timer + mood check-in combo changed how I study. I actually look forward to sessions now. My streak is at 23 days.",
    name: "Rohan M.",
    school: "CBSE Class 12",
  },
  {
    text: "Answer grader marked my physics answer exactly like my teacher would. Brutal but honest. My board exam prep improved massively.",
    name: "Priya S.",
    school: "ICSE Class 9",
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <ScrollReveal>
          <p className="text-primary text-[11px] font-semibold tracking-[2px] uppercase mb-3">
            STUDENT STORIES
          </p>
          <h2 className="text-foreground text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight max-w-xl mb-12">
            Built by a student, for students
          </h2>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t, i) => (
            <ScrollReveal key={t.name} delay={i * 100}>
              <div className="rounded-2xl border border-border bg-surface p-7 h-full transition-all hover:-translate-y-0.5">
                <div className="text-accent text-base tracking-widest mb-4">
                  ★★★★★
                </div>
                <p className="text-foreground text-[15px] leading-relaxed italic mb-5">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div className="text-muted text-[13px]">
                  <strong className="text-foreground font-semibold">
                    {t.name}
                  </strong>{" "}
                  · {t.school}
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
