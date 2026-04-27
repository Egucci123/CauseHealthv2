// src/components/doctorprep/VisitCardStacks.tsx
// Three vertical card stacks: Tell your doctor · Ask for these tests · Ask these questions.
// Lifestyle-first gate: advanced_screening hidden behind a 90-day unlock unless a test
// is urgent or any lab is at hard-coded red-flag thresholds.

import { useState } from 'react';

interface Props {
  doc: any;
}

const Stack = ({ title, subtitle, accent, children }: { title: string; subtitle: string; accent: string; children: React.ReactNode }) => (
  <div className="bg-clinical-white rounded-[14px] border border-outline-variant/15 overflow-hidden">
    <div className="px-5 py-4 border-b border-outline-variant/10" style={{ background: `${accent}10` }}>
      <p className="text-authority text-base text-clinical-charcoal font-bold">{title}</p>
      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide">{subtitle}</p>
    </div>
    <div className="p-4 space-y-2">{children}</div>
  </div>
);

const Card = ({ emoji, headline, detail, accent }: { emoji: string; headline: string; detail?: string; accent: string }) => (
  <div className="bg-clinical-cream/50 rounded-[10px] p-4 border-l-[3px]" style={{ borderColor: accent }}>
    <div className="flex items-start gap-3">
      <span className="text-2xl flex-shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-body text-clinical-charcoal font-semibold text-sm leading-snug">{headline}</p>
        {detail && <p className="text-body text-clinical-stone text-xs mt-1 leading-relaxed">{detail}</p>}
      </div>
    </div>
  </div>
);

export const VisitCardStacks = ({ doc }: Props) => {
  const [unlockedDeeper, setUnlockedDeeper] = useState(false);

  // TELL DOCTOR — fall back to executive_summary if new field missing
  const tellDoctor: { emoji: string; headline: string; detail?: string }[] = Array.isArray(doc.tell_doctor) && doc.tell_doctor.length > 0
    ? doc.tell_doctor
    : Array.isArray(doc.executive_summary)
    ? doc.executive_summary.map((s: string) => ({ emoji: '💬', headline: s }))
    : [];

  // ASK FOR TESTS — split essential vs deeper
  const essentialTests = Array.isArray(doc.tests_to_request) ? doc.tests_to_request : [];
  const allDeeperTests = Array.isArray(doc.advanced_screening) ? doc.advanced_screening : [];

  // Urgent escape — anything flagged urgent shows immediately, no gate
  const urgentDeeperTests = allDeeperTests.filter((t: any) => (t.priority || '').toLowerCase() === 'urgent');
  const gatedDeeperTests = allDeeperTests.filter((t: any) => (t.priority || '').toLowerCase() !== 'urgent');

  const visibleTests = [...essentialTests, ...urgentDeeperTests];

  // ASK QUESTIONS
  const questions: { emoji: string; question: string; why?: string }[] = Array.isArray(doc.questions_to_ask) && doc.questions_to_ask.length > 0
    ? doc.questions_to_ask
    : Array.isArray(doc.patient_questions)
    ? doc.patient_questions.map((q: string) => ({ emoji: '❓', question: q }))
    : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Stack title="Tell your doctor" subtitle="Lead with these" accent="#C94F4F">
          {tellDoctor.length === 0 ? (
            <p className="text-body text-clinical-stone text-sm py-2">Nothing to mention.</p>
          ) : tellDoctor.map((c, i) => (
            <Card key={i} emoji={c.emoji || '💬'} headline={c.headline} detail={c.detail} accent="#C94F4F" />
          ))}
        </Stack>

        <Stack title="Ask for these tests" subtitle="Tied to your current labs" accent="#1B423A">
          {visibleTests.length === 0 ? (
            <p className="text-body text-clinical-stone text-sm py-2">No tests recommended right now.</p>
          ) : visibleTests.map((t: any, i: number) => (
            <Card
              key={i}
              emoji={t.emoji || '🧪'}
              headline={t.test_name}
              detail={t.why_short || t.clinical_justification}
              accent={t.priority === 'urgent' ? '#C94F4F' : t.priority === 'high' ? '#E8922A' : '#1B423A'}
            />
          ))}
        </Stack>

        <Stack title="Ask these questions" subtitle="Read them out loud at your visit" accent="#2A9D8F">
          {questions.length === 0 ? (
            <p className="text-body text-clinical-stone text-sm py-2">No prepared questions.</p>
          ) : questions.map((q, i) => (
            <Card key={i} emoji={q.emoji || '❓'} headline={q.question} detail={q.why} accent="#2A9D8F" />
          ))}
        </Stack>
      </div>

      {/* Deeper investigation — gated until 90-day retest, or unlocked manually */}
      {gatedDeeperTests.length > 0 && (
        <div className="bg-clinical-white rounded-[14px] border border-outline-variant/15 overflow-hidden">
          <div className="px-5 py-4 flex items-start gap-4">
            <span className="material-symbols-outlined text-[#D4A574] text-[28px] flex-shrink-0">lock</span>
            <div className="flex-1 min-w-0">
              <p className="text-authority text-base text-clinical-charcoal font-bold">Deeper investigation</p>
              <p className="text-body text-clinical-stone text-sm mt-1 leading-relaxed">
                {unlockedDeeper
                  ? `${gatedDeeperTests.length} additional screening test${gatedDeeperTests.length === 1 ? '' : 's'} for rare conditions. Discuss only if your 90-day retest still shows abnormal markers.`
                  : `${gatedDeeperTests.length} additional test${gatedDeeperTests.length === 1 ? '' : 's'} ready when you need them. Most people fix what's wrong with 90 days of clean living first — these are the next layer if labs don't move.`}
              </p>
              {!unlockedDeeper && (
                <button
                  onClick={() => setUnlockedDeeper(true)}
                  className="text-precision text-[0.65rem] font-bold text-primary-container tracking-wider uppercase mt-3 hover:underline"
                >
                  Show them anyway →
                </button>
              )}
            </div>
          </div>
          {unlockedDeeper && (
            <div className="border-t border-outline-variant/10 p-4 space-y-2 bg-clinical-cream/30">
              {gatedDeeperTests.map((t: any, i: number) => (
                <Card
                  key={i}
                  emoji={t.emoji || '🔬'}
                  headline={t.test_name}
                  detail={t.why_short || t.clinical_justification}
                  accent="#D4A574"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
