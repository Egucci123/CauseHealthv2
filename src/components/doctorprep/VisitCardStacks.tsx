// src/components/doctorprep/VisitCardStacks.tsx
// Three vertical card stacks: Tell your doctor · Ask for these tests · Ask these questions.
// Reads from new fields (tell_doctor, questions_to_ask) added to the AI output.
// Falls back to executive_summary / patient_questions for older docs.

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
  // TELL DOCTOR — fall back to executive_summary if new field missing
  const tellDoctor: { emoji: string; headline: string; detail?: string }[] = Array.isArray(doc.tell_doctor) && doc.tell_doctor.length > 0
    ? doc.tell_doctor
    : Array.isArray(doc.executive_summary)
    ? doc.executive_summary.map((s: string) => ({ emoji: '💬', headline: s }))
    : [];

  // ASK FOR TESTS — combine essential + advanced
  const tests: { emoji?: string; test_name: string; why_short?: string; clinical_justification?: string; priority?: string }[] = [
    ...(Array.isArray(doc.tests_to_request) ? doc.tests_to_request : []),
    ...(Array.isArray(doc.advanced_screening) ? doc.advanced_screening : []),
  ];

  // ASK QUESTIONS — fall back to patient_questions
  const questions: { emoji: string; question: string; why?: string }[] = Array.isArray(doc.questions_to_ask) && doc.questions_to_ask.length > 0
    ? doc.questions_to_ask
    : Array.isArray(doc.patient_questions)
    ? doc.patient_questions.map((q: string) => ({ emoji: '❓', question: q }))
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Stack title="Tell your doctor" subtitle="Lead with these" accent="#C94F4F">
        {tellDoctor.length === 0 ? (
          <p className="text-body text-clinical-stone text-sm py-2">Nothing to mention.</p>
        ) : tellDoctor.map((c, i) => (
          <Card key={i} emoji={c.emoji || '💬'} headline={c.headline} detail={c.detail} accent="#C94F4F" />
        ))}
      </Stack>

      <Stack title="Ask for these tests" subtitle="With reasons your doctor will recognize" accent="#1B423A">
        {tests.length === 0 ? (
          <p className="text-body text-clinical-stone text-sm py-2">No new tests recommended.</p>
        ) : tests.map((t, i) => (
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
  );
};
