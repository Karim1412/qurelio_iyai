import { Navbar }          from '@/components/landing/Navbar';
import { HeroSection }     from '@/components/landing/HeroSection';
import { WhyQurelio }      from '@/components/landing/WhyQurelio';
import { HowItWorks }      from '@/components/landing/HowItWorks';
import { PricingSection }  from '@/components/landing/PricingSection';
import { PricingComparison } from '@/components/landing/PricingComparison';
import { PricingScaleBilling } from '@/components/landing/PricingScaleBilling';
import { PricingFAQ }      from '@/components/landing/PricingFAQ';
import { ContactSection } from '@/components/landing/AboutContact';
import { NextLanding }    from '@/components/landing/NextLanding';
import { Footer }          from '@/components/landing/Footer';
import { TranslationProvider } from '@/components/landing/TranslationProvider';
import { SoftSection, SoftScrollProgress } from '@/components/landing/SoftSection';

export default function HomePage() {
  return (
    <TranslationProvider>
      <div data-translate-root>
        <SoftScrollProgress />
        <Navbar />
        <main>
          {/* Hero keeps its own entrance: no wrapper to avoid double-animation */}
          <HeroSection />

          <SoftSection rise={32} parallax={26} duration={1.15}>
            <WhyQurelio />
          </SoftSection>

          <SoftSection rise={28} parallax={20} duration={1.1}>
            <HowItWorks />
          </SoftSection>

          <div>
            <SoftSection rise={26} parallax={18} duration={1.05}>
              <PricingSection />
            </SoftSection>
            <SoftSection rise={24} parallax={16} duration={1.05} scale={false}>
              <PricingComparison />
            </SoftSection>
            <SoftSection rise={24} parallax={16} duration={1.05} scale={false}>
              <PricingScaleBilling />
            </SoftSection>
            <SoftSection rise={24} parallax={16} duration={1.05} scale={false}>
              <PricingFAQ />
            </SoftSection>
            <SoftSection rise={24} parallax={16} duration={1.05} scale={false}>
              <ContactSection />
            </SoftSection>
          </div>

          <div>
            {/* Footer has its own scroll-driven shutter reveal, no wrapper to avoid stacking transforms (text blur). */}
            <Footer />
          </div>
        </main>
      </div>
    </TranslationProvider>
  );
}
