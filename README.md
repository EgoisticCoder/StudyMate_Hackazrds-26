<img width="4320" height="1440" alt="hh26 main poster 2 with sponsors 3x1 (4320 x 1440 px) (2)" src="https://github.com/user-attachments/assets/c698b2cd-da84-4cb0-9276-125c6a7244aa" />

# 🚀 StudyMate AI

> The AI study partner that sees your focus, hears your doubts, and knows when avoidance is hiding as stress.

---

## 📌 Problem & Domain

Traditional EdTech apps treat every student as a static database — the same flashcards, the same quizzes, the same generic chatbot, regardless of who's on the other end.

High-pressure curricula like **CBSE and ICSE** create a problem most platforms never catch: **cognitive stress and subject avoidance**. When a student finds a subject difficult, they don't always study less — they avoid it entirely, then mask that avoidance by over-studying subjects they already excel at, or by simply claiming "stress." A platform that only tracks scores has no way to tell the difference between a student who is genuinely burnt out and one who is quietly avoiding the subject they're afraid of failing.

StudyMate AI shifts the paradigm from content delivery to a **behavioral and cognitive feedback loop** — combining a graph database, multimodal LLM reasoning, real-time on-device vision, and conversational voice processing into one adaptive study partner.

**Themes Selected:**
- [x] Learning & Knowledge Systems
- [x] Human Experience & Productivity
- [ ] Climate & Sustainability Systems
- [ ] HealthTech & Bio Platforms
- [ ] Work, Finance & Digital Economy
- [ ] Infrastructure, Mobility & Smart Systems
- [ ] Trust, Identity & Security
- [ ] Media, Social & Interactive Platforms
- [ ] Public Systems, Governance and Civic Tech
- [ ] Developer Tools & Software Infrastructure

---

## 🎯 Objective

**Target users:** ICSE/CBSE students (primarily secondary level) navigating high-pressure exam curricula, plus parents who want visibility into not just grades, but the behavioral patterns behind them.

**The pain point:** Score-based tracking can't distinguish a student who is genuinely overwhelmed from one who is avoiding a subject and calling it stress. Generic AI tutors don't adapt to board-specific rubrics, regional language/accent needs, or a student's actual psychological state.

**The value StudyMate provides:**
- Detects *subject avoidance* vs. *genuine burnout* using behavioral correlation, not self-reported mood alone
- Grades handwritten answers against actual CBSE/ICSE board rubrics, not generic AI judgment
- Runs hands-free voice tutoring in regional Indian languages via Sarvam AI
- Gives parents read-only visibility into weaknesses and stress patterns without invading the student's primary experience

---

## 🧠 Team & Approach

### Team Name:
MPBian

### Team Code:
H6WNIVJ4

### Team Members:
- Abhinav Gupta — Full-Stack & AI/ML Lead

### Your Approach:
- Chose this problem from direct exposure to the ICSE high-pressure curriculum and the gap between what students report ("I'm stressed") and what's actually happening (avoidance).
- Key technical challenge: building a context-injection pipeline that compiles a student's full psychological and academic profile (8 parallel Cypher query threads — strengths, behavioral state, stress verdict, parental notes) into a single LLM prompt in real time, without blowing past latency budgets.
- Pivoted from a purely score-based weakness tracker to a **4-state behavioral classification engine** (Mastering, Underperforming, Avoiding, Struggling) after realizing static accuracy scores couldn't explain *why* a student was falling behind.
- Integrated Sarvam AI's Saaras (STT) and Bulbul (TTS) to meet the hard track requirement and to solve a real gap — general-purpose LLM voice stacks consistently mishandle Indian regional accents and board-specific terminology.

---

## 🛠️ Tech Stack

### Core Technologies Used:
- **Frontend:** Expo / React Native (mobile app), Next.js (landing website)
- **Backend:** Vercel Serverless Functions / Next.js API routes (proxy layer for all AI service calls)
- **Database:** Neo4j AuraDB (graph database — primary store for behavioral/cognitive state), SQLite (on-device local indexing for notes RAG)
- **APIs:** Sarvam AI (Saaras V3, Bulbul V3, Sarvam 105B, Sarvam Vision, Sarvam Mayura)
- **Hosting:** Vercel (web + serverless proxies), EAS Build (Android APK)

### Additional Technologies Used:
- [x] AI / ML
- [ ] Web3 / Blockchain
- [ ] Cyber Security
- [x] Cloud

---

## 🏆 Sponsored Track

- [x] **Expo Track** – The entire mobile application is built natively in Expo/React Native, including camera-based vision telemetry (`expo-camera`), SVG mind maps (`react-native-svg`), audio I/O for voice mode, and haptic feedback — not a thin wrapper.
- [x] **Neo4j Track** – AuraDB is the primary database, not a secondary cache. Student activity is modeled as a graph (`ATTEMPTED`, `LOGGED_MOOD`, `STUDIED`, `HAS_RELATIONSHIP`, etc.), enabling multi-hop Cypher queries that correlate quiz performance drops with mood logs and study-session patterns — the core mechanism behind avoidance detection.

> **Neo4j implementation note:** Before every LLM interaction, an 8-thread parallel Cypher query loop (`buildStudentContext`) pulls recency-weighted subject mastery, behavioral state classification, cognitive edge flags (e.g. `LOVES_BUT_STRUGGLES`), parental observations, and a calculated stress verdict — compiled into a single context-injected prompt.

---

## ✨ Key Features

- ✅ **Anti-Fake-Stress Detection** — Correlates self-reported stress logs against actual quiz attempts via Cypher query; flags genuine burnout vs. subject avoidance and routes each to a different intervention.
- ✅ **On-Device Focus Vision** — Front-camera telemetry monitors study-session focus, flags distraction twice-consecutive, with a 60-second grace timer and gamified "Focus Orbs" for engagement.
- ✅ **Hands-Free Voice Tutor** — Sarvam Saaras (STT) + Bulbul (TTS) power real-time verbal quizzing, explanation grading, and step-by-step spoken corrections.
- ✅ **AI Handwritten Answer Grader** — OCR + board-rubric evaluation of photographed answer sheets, with spelling/formula error flags and model-answer comparison.
- ✅ **Interactive Mind Maps** — SVG-rendered syllabus concept maps that color-code by mastery level.
- ✅ **Local RAG Notes + Spaced Repetition** — On-device SQLite indexing for uploaded notes (no server-side embedding cost), auto-generated flashcards on Ebbinezer-interval review.
- ✅ **Parent Portal** — Read-only access to weaknesses, diagnostics, and stress analytics, with a private channel to feed observations back into the AI context.
- ✅ **Gamification Layer** — XP, streaks, daily missions, and an XP shop for themes/avatars to sustain engagement beyond the study session itself.

---

## 📽️ Demo & Deliverables

- **Demo Video Link:** `[Add demo video link]`
- **Deployment Link:** [studymatev3web.vercel.app](add url here)
- **PPT Link:** [StudyMate Presenation](https://gamma.app/docs/The-AI-study-partner-that-sees-your-focus-hears-your-doubts-and-k-t8akqjfu4p1q9ao)

---

## ✅ Tasks & Bonus Checklist

- [ ] All team members completed the mandatory social task
- [ ] Bonus Task 1 – Badge sharing
- [ ] Bonus Task 2 – Blog/article

---

## 🧪 How to Run the Project

### Requirements:
- Node.js (v18+) and npm/yarn
- Expo CLI (`npm install -g expo-cli`) for the mobile app
- A Neo4j AuraDB instance (connection URI + credentials)
- API keys: Sarvam AI

### Local Setup:
```bash
# Clone the repository
git clone https://github.com/EgoisticCoder/StudyMate_Hackazards-26.git
cd StudyMate_Hackazards-26

# --- Mobile app ---
cd app
npm install
cp .env.example .env   # fill in Neo4j, Groq, and Sarvam credentials
npx expo start

# --- Landing website ---
cd website
npm install
cp .env.example .env
npm run dev
```

---

## 🧬 Future Scope

- 📈 Expand beyond ICSE/CBSE to state boards, competitive exam prep (JEE/NEET foundation tracks etc) and expansion towards International Curriculum
- 🌐 Broader language coverage for additional regional languages beyond current support
- 🛡️ On-device local LLM inference for a fully offline study mode
- 🧑‍🏫 Teacher-facing dashboard alongside the existing parent portal
- 🔋 Battery/performance optimization for the continuous vision-focus monitoring feature

---

## 📎 Resources / Credits

- [Neo4j AuraDB](https://neo4j.com/cloud/platform/aura-graph-database/) — graph database engine
- [Sarvam AI](https://www.sarvam.ai/) — Saaras (STT) and Bulbul (TTS)
- [Expo](https://expo.dev/) — React Native framework
- [Vercel](https://vercel.com/) — hosting and serverless functions

---

## 🏁 Final Words

`[Write this one yourself — judges can tell a templated reflection from a real one. A line on the Sarvam integration blocker you had to solve, or what surprised you about the behavioral engine working in practice, will land better than anything generic I'd draft here.]`

---

## License

MIT License

Copyright (c) 2026 Abhinav Gupta

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
