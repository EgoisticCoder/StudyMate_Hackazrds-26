import Hero from "./components/Hero";
import Features from "./components/Features";
import DashboardPreview from "./components/DashboardPreview";
import AIEngine from "./components/AIEngine";
import HowItWorks from "./components/HowItWorks";
import TechStack from "./components/TechStack";
import Testimonials from "./components/Testimonials";
import Download from "./components/Download";

export default function Home() {
  return (
    <>
      <Hero />
      <Features />
      <DashboardPreview />
      <AIEngine />
      <HowItWorks />
      <TechStack />
      <Testimonials />
      <Download />
    </>
  );
}
