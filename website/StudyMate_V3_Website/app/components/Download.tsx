"use client";

import { useState } from "react";
import ScrollReveal from "./ScrollReveal";
import InstallModal from "./InstallModal";

export default function Download() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const options = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      ),
      title: "Download App",
      sub: "via GitHub Source",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
      ),
      title: "Expo Go",
      sub: "Run Locally",
    },
  ];

  return (
    <>
      <section id="download" className="py-24 px-6 bg-surface-dim">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1">
            <ScrollReveal>
              <p className="text-primary text-[11px] font-semibold tracking-[2px] uppercase mb-3">
                GET STARTED
              </p>
              <h2 className="text-foreground text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight max-w-md mb-4">
                Start studying smarter today
              </h2>
              <p className="text-muted text-base leading-relaxed max-w-md mb-8">
                Since this is an exclusive development build, the app is not available on public app stores. Follow our quick installation guide to run it on your device.
              </p>
            </ScrollReveal>

            <div className="flex flex-col sm:flex-row gap-3">
              {options.map((o, i) => (
                <ScrollReveal key={o.title} delay={i * 100}>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-4 px-6 py-4 rounded-xl border border-border bg-surface text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary w-full sm:w-auto"
                  >
                    <span className="text-primary">{o.icon}</span>
                    <div>
                      <strong className="block text-foreground text-sm">
                        {o.title}
                      </strong>
                      <span className="text-muted text-xs">{o.sub}</span>
                    </div>
                  </button>
                </ScrollReveal>
              ))}
            </div>
          </div>

          {/* QR Code */}
          <ScrollReveal className="shrink-0">
            <div className="w-[200px] p-6 rounded-2xl border border-border bg-surface text-center">
              <div className="w-[152px] h-[152px] mx-auto mb-3 rounded-lg bg-surface-dim flex items-center justify-center text-muted">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4" rx="1"/><rect x="18" y="18" width="4" height="4" rx="1"/></svg>
              </div>
              <p className="text-muted text-xs font-medium">Scan with Expo Go locally</p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <InstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
