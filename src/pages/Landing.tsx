// src/pages/Landing.tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { LandingNav }        from '../components/landing/LandingNav';
import { HeroSection }       from '../components/landing/HeroSection';
import { StatsBar }          from '../components/landing/StatsBar';
import { ProblemSection }    from '../components/landing/ProblemSection';
import { HowItWorks }        from '../components/landing/HowItWorks';
import { TwoDrawJourney }    from '../components/landing/TwoDrawJourney';
import { FeaturesSection }   from '../components/landing/FeaturesSection';
import { ConditionsSection } from '../components/landing/ConditionsSection';
import { VsFunction }        from '../components/landing/VsFunction';
import { PricingSection }    from '../components/landing/PricingSection';
import { TrustSection }      from '../components/landing/TrustSection';
import { LandingFooter }     from '../components/landing/LandingFooter';

export const Landing = () => {
  const { hash } = useLocation();

  // When user lands on /#section (from any page), smooth-scroll to that section.
  // Runs whenever the hash changes; small delay lets sections finish rendering.
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace(/^#/, '');
    const tryScroll = (attempt = 0) => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (attempt < 10) {
        setTimeout(() => tryScroll(attempt + 1), 60);
      }
    };
    tryScroll();
  }, [hash]);

  return (
  <div className="min-h-screen">
    <LandingNav />
    <HeroSection />
    <StatsBar />
    <ProblemSection />
    <HowItWorks />
    <TwoDrawJourney />
    <FeaturesSection />
    <ConditionsSection />
    <VsFunction />
    <PricingSection />
    <TrustSection />
    <LandingFooter />
  </div>
  );
};
