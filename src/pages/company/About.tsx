// src/pages/company/About.tsx
import { LandingNav } from '../../components/landing/LandingNav';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { Button } from '../../components/ui/Button';

export const About = () => (
  <div className="min-h-screen bg-clinical-cream">
    <LandingNav />
    <main className="max-w-3xl mx-auto px-6 py-24 md:py-32">
      <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-primary-container mb-3">About</p>
      <h1 className="text-authority text-4xl md:text-6xl text-clinical-charcoal font-bold mb-8 leading-tight">
        It started with my<br />sister's bloodwork.
      </h1>

      <div className="space-y-7 text-body text-clinical-charcoal text-lg leading-relaxed">
        <p>
          I'm not a doctor. I'm a blue-collar guy who got obsessed with health
          intelligence the hard way — by watching the people I love get failed by
          12-minute appointments.
        </p>

        <p>
          My sister was 18 when her labs started coming back with weird platelet counts.
          Her doctor shrugged. "Within range, more or less. Recheck in a year." We were
          told to stop worrying.
        </p>

        <p>
          I couldn't. So I dropped her numbers into an AI tool, asked it the questions
          her doctor never had time to ask, and learned that the pattern she had —
          elevated platelets, RDW drift, a couple of other things on the same panel —
          had a name: <strong>essential thrombocythemia</strong>. A bone marrow disorder.
          Rare. Treatable when caught early. Catastrophic when missed.
        </p>

        <p>
          Confirmed at her next appointment when we asked specifically for the JAK2
          mutation test. Positive. She's on treatment now. She's fine.
        </p>

        <div className="bg-clinical-white rounded-[14px] border-t-[3px] border-[#C94F4F] p-7 my-10">
          <p className="text-precision text-[0.68rem] font-bold tracking-widest uppercase text-[#C94F4F] mb-3">The thing that haunted me</p>
          <p className="text-authority text-2xl text-clinical-charcoal font-bold mb-3 leading-tight">
            Her labs had been telling us the answer for two years.
          </p>
          <p className="text-body text-clinical-stone text-base">
            The information was right there. Nobody had time to read it.
          </p>
        </div>

        <p>
          That's when I realized: <strong>150 million Americans have labs sitting in
          MyChart they don't understand.</strong> Most of them have something useful
          buried in there — a deficiency, a pattern, a medication side-effect, an early
          warning. Their doctors aren't bad. They have 12 minutes. The math doesn't work.
        </p>

        <p>
          Then it happened to me. I went in with my own symptoms — fatigue, weight
          gain, gut stuff — and my doctor's whole answer was a stack of prescriptions.
          Statin for cholesterol. PPI for the gut. Something for sleep. He didn't
          ask why my body was acting this way. He didn't run a single deeper test.
          He just threw medicine at me.
        </p>

        <p>
          I went home, looked at my own bloodwork, and saw it instantly: insulin
          resistance, a vitamin D crash, and a fatty liver waiting to happen. None
          of which a statin was going to fix. <strong>I was being treated for symptoms,
          not causes.</strong> I had enough.
        </p>

        <p>
          So I built CauseHealth. The thing I wished existed when I was reading my
          sister's labs at midnight, and the thing I needed when my own doctor handed
          me four prescriptions instead of an explanation. Upload any PDF — or take a
          photo of paper labs. Get a doctor-grade summary in 30 seconds. The exact
          tests to ask for. The patterns nobody has time to find. A 90-day plan to
          fix the cause, not just the symptom.
        </p>

        <p>
          We don't replace your doctor. We make the next 12 minutes you spend with them
          the most useful 12 minutes of your year.
        </p>

        <p className="text-precision text-base text-clinical-stone tracking-wide pt-6">
          — Evan, founder
        </p>

        <div className="pt-6">
          <a href="/contact">
            <Button variant="primary" size="lg" icon="mail">Get in Touch</Button>
          </a>
        </div>
      </div>
    </main>
    <LandingFooter />
  </div>
);
