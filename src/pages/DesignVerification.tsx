// src/pages/DesignVerification.tsx
import { Badge, SeverityBadge, CodeTag } from '../components/ui/Badge';
import { SectionLabel } from '../components/ui/SectionLabel';
import {
  PrimaryCard, AlertCard, ContextCard, SupportCard,
  InterventionBox, ClinicalQuote, SectionHeader,
} from '../components/ui/Card';
import { Button, ClinicalLink } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { OptimalRangeBar } from '../components/lab/OptimalRangeBar';
import { Sidebar } from '../components/layout/Sidebar';
import { TopBar } from '../components/layout/TopBar';
import { MobileNav } from '../components/layout/MobileNav';

export const DesignVerification = () => (
  <div className="flex min-h-screen">
    {/* Live sidebar */}
    <Sidebar currentPath="/dashboard" />

    <main className="flex-1 md:ml-72 min-h-screen bg-clinical-cream">
      <TopBar title="Design Verification" subtitle="Component Library" />

      <div className="p-8 max-w-6xl mx-auto space-y-16">

        {/* ── Two-Zone Proof ── */}
        <section>
          <SectionHeader
            title="Two-Zone Layout"
            description="Dark structural zone + warm data zone. The foundational design principle."
          />
          <div className="mt-8 grid grid-cols-2 gap-4 h-32">
            <div className="bg-[#131313] rounded-[10px] flex items-center justify-center">
              <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase">
                Zone 1 — #131313 Structure
              </p>
            </div>
            <div className="bg-clinical-cream border border-outline-variant/20 rounded-[10px] flex items-center justify-center">
              <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase">
                Zone 2 — #F5F0E8 Data
              </p>
            </div>
          </div>
        </section>

        {/* ── Typography ── */}
        <section>
          <SectionHeader title="Typography System" />
          <div className="mt-8 bg-clinical-white rounded-[10px] p-8 space-y-6">
            <div>
              <SectionLabel>Fraunces Serif — Headlines</SectionLabel>
              <p className="text-authority text-5xl text-clinical-charcoal font-bold">
                Your doctor has 12 minutes.
              </p>
              <p className="text-authority text-3xl text-primary-container font-semibold mt-2">
                We have everything they miss.
              </p>
            </div>
            <div>
              <SectionLabel>DM Sans — Body Copy</SectionLabel>
              <p className="text-body text-clinical-charcoal text-lg leading-relaxed">
                Elevated ALT in this context is consistent with hepatocellular stress.
                Given concurrent atorvastatin and mesalamine use, drug-induced hepatotoxicity
                should be considered first.
              </p>
            </div>
            <div>
              <SectionLabel>JetBrains Mono — Clinical Precision</SectionLabel>
              <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase">
                Nutrient Depletion Matrix · ICD-10: K50.90 · Value: 97 IU/L
              </p>
              <p className="text-precision text-4xl text-clinical-charcoal mt-2">
                97 <span className="text-xl text-clinical-stone">IU/L</span>
              </p>
            </div>
          </div>
        </section>

        {/* ── Badges ── */}
        <section>
          <SectionHeader
            title="Severity Badges"
            description="Sharp-cornered clinical labels. No border-radius. These are not pills."
          />
          <div className="mt-8 bg-clinical-white rounded-[10px] p-8">
            <SectionLabel>Status Badges</SectionLabel>
            <div className="flex gap-4 flex-wrap mb-8">
              <Badge status="urgent" />
              <Badge status="monitor" />
              <Badge status="optimal" />
              <Badge status="brand" label="INFO" />
            </div>

            <SectionLabel>Severity Badges (Medication Depletions)</SectionLabel>
            <div className="flex gap-4 flex-wrap mb-8">
              <SeverityBadge severity="critical" />
              <SeverityBadge severity="moderate" />
              <SeverityBadge severity="low" />
            </div>

            <SectionLabel>Code Tags</SectionLabel>
            <div className="flex gap-4 flex-wrap">
              <CodeTag code="K50.90" prefix="ICD-10" />
              <CodeTag code="94420-S" prefix="Rx ID" />
              <CodeTag code="G72.0" prefix="ICD-10" />
            </div>
          </div>
        </section>

        {/* ── Optimal Range Bar ── */}
        <section>
          <SectionHeader
            title="Optimal Range Bar"
            description="The signature UI element. Appears on every lab marker. Build it precisely."
          />
          <div className="mt-8 space-y-6">

            {/* Urgent — value critically elevated */}
            <PrimaryCard status="urgent">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-body text-clinical-charcoal font-semibold text-lg">ALT (SGPT)</h3>
                  <SectionLabel className="mb-0 mt-1">Liver</SectionLabel>
                </div>
                <Badge status="urgent" />
              </div>
              <div className="mb-6">
                <span className="text-precision text-5xl text-clinical-charcoal font-medium">97</span>
                <span className="text-body text-clinical-stone text-xl ml-2">IU/L</span>
              </div>
              <OptimalRangeBar
                value={97}
                unit="IU/L"
                optimalLow={0}
                optimalHigh={25}
                standardLow={0}
                standardHigh={44}
              />
            </PrimaryCard>

            {/* Monitor — suboptimal */}
            <PrimaryCard status="monitor">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-body text-clinical-charcoal font-semibold text-lg">Vitamin D (25-OH)</h3>
                  <SectionLabel className="mb-0 mt-1">Nutrients</SectionLabel>
                </div>
                <Badge status="monitor" />
              </div>
              <div className="mb-6">
                <span className="text-precision text-5xl text-clinical-charcoal font-medium">24</span>
                <span className="text-body text-clinical-stone text-xl ml-2">ng/mL</span>
              </div>
              <OptimalRangeBar
                value={24}
                unit="ng/mL"
                optimalLow={50}
                optimalHigh={70}
                standardLow={20}
                standardHigh={100}
              />
            </PrimaryCard>

            {/* Optimal */}
            <PrimaryCard status="optimal">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-body text-clinical-charcoal font-semibold text-lg">eGFR</h3>
                  <SectionLabel className="mb-0 mt-1">Kidney</SectionLabel>
                </div>
                <Badge status="optimal" />
              </div>
              <div className="mb-6">
                <span className="text-precision text-5xl text-clinical-charcoal font-medium">94</span>
                <span className="text-body text-clinical-stone text-xl ml-2">mL/min</span>
              </div>
              <OptimalRangeBar
                value={94}
                unit="mL/min"
                optimalLow={90}
                optimalHigh={120}
                standardLow={60}
                standardHigh={120}
              />
            </PrimaryCard>

          </div>
        </section>

        {/* ── Card Patterns ── */}
        <section>
          <SectionHeader title="Card Patterns" />
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">

            {/* Primary card — medication depletion */}
            <div className="lg:col-span-8">
              <PrimaryCard status="brand">
                <div className="flex justify-between items-start mb-10">
                  <div>
                    <h3 className="text-authority text-3xl text-clinical-charcoal font-semibold">
                      Atorvastatin
                    </h3>
                    <p className="text-body text-clinical-stone font-medium mt-1">Brand: Lipitor</p>
                  </div>
                  <CodeTag code="94420-S" prefix="Rx ID" />
                </div>

                <SectionLabel>Nutrient Depletion Matrix</SectionLabel>
                <table className="w-full text-left mb-10">
                  <thead>
                    <tr className="text-precision text-[0.68rem] text-clinical-stone border-b border-outline-variant/10">
                      <th className="pb-3 font-medium">NUTRIENT</th>
                      <th className="pb-3 font-medium">SEVERITY</th>
                      <th className="pb-3 font-medium">CLINICAL IMPACT</th>
                    </tr>
                  </thead>
                  <tbody className="text-body text-clinical-charcoal">
                    <tr className="border-b border-outline-variant/5">
                      <td className="py-5 font-bold">CoQ10</td>
                      <td className="py-5"><SeverityBadge severity="critical" /></td>
                      <td className="py-5 text-clinical-stone">Mitochondrial dysfunction.</td>
                    </tr>
                    <tr className="border-b border-outline-variant/5">
                      <td className="py-5 font-bold">Vitamin D3</td>
                      <td className="py-5"><SeverityBadge severity="moderate" /></td>
                      <td className="py-5 text-clinical-stone">Reduced synthesis efficiency.</td>
                    </tr>
                  </tbody>
                </table>

                <ClinicalQuote>
                  Reported muscle pain and fatigue are consistent with CoQ10 depletion
                  at this statin dosage.
                </ClinicalQuote>

                <div className="mt-6">
                  <InterventionBox>
                    CoQ10 (ubiquinol form) 200mg daily with food.
                  </InterventionBox>
                </div>
              </PrimaryCard>
            </div>

            {/* Side panels */}
            <div className="lg:col-span-4 space-y-6">
              <ContextCard>
                <SectionLabel icon="clinical_notes" light>Patient Correlation</SectionLabel>
                <div className="space-y-4">
                  <div>
                    <div className="text-authority text-2xl font-bold">84%</div>
                    <div className="text-body text-sm opacity-80">Marker confidence score</div>
                  </div>
                  <div className="pt-4 border-t border-on-tertiary-container/20">
                    <p className="text-body text-sm">
                      Patient shows elevated CPK levels (+12% above baseline).
                    </p>
                  </div>
                </div>
              </ContextCard>

              <SupportCard>
                <SectionLabel>Mechanism of Action</SectionLabel>
                <p className="text-body text-clinical-charcoal text-sm leading-relaxed">
                  HMG-CoA reductase inhibitors block the synthesis of mevalonate,
                  a precursor not only to cholesterol but also to coenzyme Q10.
                </p>
                <div className="mt-4 pt-4 border-t border-outline-variant/10">
                  <ClinicalLink>VIEW LITERATURE</ClinicalLink>
                </div>
              </SupportCard>
            </div>
          </div>
        </section>

        {/* ── Alert Cards ── */}
        <section>
          <SectionHeader title="Alert Cards — Left Border Pattern" />
          <div className="mt-8 space-y-4">
            <AlertCard status="urgent">
              <div className="flex justify-between items-start">
                <div>
                  <Badge status="urgent" className="mb-2" />
                  <p className="text-body text-clinical-charcoal font-medium">
                    ALT 97 IU/L — 3.9x above optimal range
                  </p>
                  <p className="text-body text-clinical-stone text-sm mt-1">
                    Possible contributors: atorvastatin hepatotoxicity, mesalamine.
                  </p>
                </div>
                <ClinicalLink>VIEW IN PLAN</ClinicalLink>
              </div>
            </AlertCard>

            <AlertCard status="monitor">
              <div className="flex justify-between items-start">
                <div>
                  <Badge status="monitor" className="mb-2" />
                  <p className="text-body text-clinical-charcoal font-medium">
                    Vitamin D 24 ng/mL — below optimal threshold
                  </p>
                  <p className="text-body text-clinical-stone text-sm mt-1">
                    IBD and immunosuppressant use elevate deficiency risk.
                  </p>
                </div>
                <ClinicalLink>VIEW IN PLAN</ClinicalLink>
              </div>
            </AlertCard>

            <AlertCard status="optimal">
              <div className="flex justify-between items-start">
                <div>
                  <Badge status="optimal" className="mb-2" />
                  <p className="text-body text-clinical-charcoal font-medium">
                    eGFR 94 mL/min — within optimal range
                  </p>
                  <p className="text-body text-clinical-stone text-sm mt-1">
                    Kidney function is well-maintained. Continue monitoring.
                  </p>
                </div>
              </div>
            </AlertCard>
          </div>
        </section>

        {/* ── Buttons ── */}
        <section>
          <SectionHeader
            title="Buttons"
            description="6px border-radius. Never pill-shaped. Never rounded-full."
          />
          <div className="mt-8 bg-clinical-white rounded-[10px] p-8 space-y-6">
            <div className="flex gap-4 flex-wrap">
              <Button variant="primary" size="lg">Upload My Labs — Free</Button>
              <Button variant="primary" size="md">Generate Plan</Button>
              <Button variant="primary" size="sm">Save</Button>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Button variant="secondary" size="lg">View Full Analysis</Button>
              <Button variant="secondary" size="md">Add to Doctor Prep</Button>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Button variant="ghost" size="md">Cancel</Button>
              <Button variant="danger" size="md">Delete</Button>
              <Button variant="primary" size="md" loading>Generating...</Button>
            </div>
            <div className="flex gap-4 flex-wrap">
              <Button variant="primary" size="md" icon="biotech">Run Analysis</Button>
              <Button variant="primary" size="md" icon="open_in_new" iconPosition="right">
                Download PDF
              </Button>
            </div>
          </div>
        </section>

        {/* ── Inputs ── */}
        <section>
          <SectionHeader title="Form Inputs" />
          <div className="mt-8 bg-clinical-white rounded-[10px] p-8 space-y-6 max-w-lg">
            <Input
              label="Patient Name"
              placeholder="Enter full name"
            />
            <Input
              label="Lab Value"
              placeholder="97"
              type="number"
              hint="Enter the value as shown on your lab report"
            />
            <Input
              label="Email Address"
              placeholder="you@example.com"
              type="email"
              error="Please enter a valid email address"
            />
            <Select
              label="Biological Sex"
              options={[
                { value: '', label: 'Select...' },
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
                { value: 'other', label: 'Prefer not to say' },
              ]}
            />
          </div>
        </section>

        {/* ── Color Palette ── */}
        <section>
          <SectionHeader title="Color System" />
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'surface #131313',      bg: 'bg-[#131313]',     text: 'text-white' },
              { name: 'container-low #1C1B1B',bg: 'bg-[#1C1B1B]',     text: 'text-white' },
              { name: 'clinical-cream',        bg: 'bg-clinical-cream', text: 'text-clinical-charcoal', border: true },
              { name: 'clinical-white',        bg: 'bg-clinical-white', text: 'text-clinical-charcoal', border: true },
              { name: 'forest #1B4332',        bg: 'bg-primary-container', text: 'text-white' },
              { name: 'gold #D4A574',          bg: 'bg-[#D4A574]',     text: 'text-[#1A1A1A]' },
              { name: 'critical #C94F4F',      bg: 'bg-[#C94F4F]',     text: 'text-white' },
              { name: 'amber #E8922A',         bg: 'bg-[#E8922A]',     text: 'text-white' },
              { name: 'teal #1B423A',          bg: 'bg-tertiary-container', text: 'text-on-tertiary-container' },
              { name: 'outline-variant',       bg: 'bg-outline-variant', text: 'text-white' },
            ].map((color) => (
              <div key={color.name} className={`${color.bg} rounded-[10px] p-4 h-20 flex items-end ${color.border ? 'border border-outline-variant/20' : ''}`}>
                <p className={`text-precision text-[0.6rem] tracking-wider ${color.text}`}>
                  {color.name}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom padding for mobile nav */}
        <div className="h-8" />
      </div>
    </main>

    <MobileNav />
  </div>
);
