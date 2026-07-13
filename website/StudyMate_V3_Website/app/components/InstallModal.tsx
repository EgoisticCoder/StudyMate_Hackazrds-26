"use client";

import { useEffect } from "react";

interface InstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InstallModal({ isOpen, onClose }: InstallModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl p-6 md:p-8 animate-[fadeUp_0.3s_ease-out]">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-muted hover:text-foreground transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>

        <h3 className="text-2xl font-bold text-foreground mb-2">Install StudyMate App</h3>
        <p className="text-muted mb-6 text-sm">
          The app is currently in a private development phase and is not hosted on public app stores. You can run it directly on your device via Expo Go.
        </p>

        <div className="space-y-4">
          <div className="bg-surface-dim border border-border rounded-lg p-4">
            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-primary/20 text-primary flex items-center justify-center text-xs">1</span>
              Download the Code
            </h4>
            <p className="text-sm text-muted mb-2">Clone the application code from the official GitHub repository:</p>
            <code className="block w-full bg-background p-2 rounded text-xs text-primary font-mono overflow-x-auto whitespace-nowrap">
              git clone https://github.com/TestingGuyz/StudyMate_V3_App.git
            </code>
          </div>

          <div className="bg-surface-dim border border-border rounded-lg p-4">
            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-primary/20 text-primary flex items-center justify-center text-xs">2</span>
              Install Dependencies
            </h4>
            <p className="text-sm text-muted mb-2">Ensure Node.js is installed, then run:</p>
            <code className="block w-full bg-background p-2 rounded text-xs text-primary font-mono overflow-x-auto whitespace-nowrap">
              cd StudyMate_V3_App && npm install
            </code>
          </div>

          <div className="bg-surface-dim border border-border rounded-lg p-4">
            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-primary/20 text-primary flex items-center justify-center text-xs">3</span>
              Start the App
            </h4>
            <p className="text-sm text-muted mb-2">Launch the Expo development server:</p>
            <code className="block w-full bg-background p-2 rounded text-xs text-primary font-mono overflow-x-auto whitespace-nowrap">
              npx expo start
            </code>
            <p className="text-sm text-muted mt-3">
              Download the <strong>Expo Go</strong> app on your iOS or Android device and scan the QR code that appears in your terminal.
            </p>
          </div>
        </div>

        <button 
          onClick={onClose}
          className="w-full mt-6 py-3 rounded-lg bg-primary text-white font-semibold glow-primary"
        >
          Understood
        </button>
      </div>
    </div>
  );
}
