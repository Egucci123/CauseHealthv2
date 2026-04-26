// src/components/dashboard/BiologicalAgeWidget.tsx
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLatestLabValues, useLatestLabDraw } from '../../hooks/useLabData';
import { useAuthStore } from '../../store/authStore';
import { computeBioAgeFromLabs, type BioAgeResult } from '../../lib/biologicalAge';

const colorFor = (cat: BioAgeResult['category']) => {
  if (cat === 'younger') return '#2A9D8F';
  if (cat === 'older') return '#C94F4F';
  return '#D4A574';
};

const labelFor = (cat: BioAgeResult['category'], delta: number) => {
  const abs = Math.abs(delta);
  if (cat === 'younger') return `${abs.toFixed(1)} years younger`;
  if (cat === 'older') return `${abs.toFixed(1)} years older`;
  return 'Matches your age';
};

export const BiologicalAgeWidget = () => {
  const navigate = useNavigate();
  const profile = useAuthStore(s => s.profile);
  const { data: latestDraw, isLoading: drawLoading } = useLatestLabDraw();
  const { data: values, isLoading: valuesLoading } = useLatestLabValues();

  const loading = drawLoading || valuesLoading;
  const result = !loading && values && latestDraw
    ? computeBioAgeFromLabs(values, profile?.dateOfBirth, latestDraw.drawDate)
    : null;

  // Loading state
  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-3 bg-clinical-cream rounded-sm w-1/3 mb-4" />
        <div className="h-16 bg-clinical-cream rounded-lg w-2/3 mb-3" />
        <div className="h-3 bg-clinical-cream rounded-sm w-1/2" />
      </div>
    );
  }

  // No labs yet
  if (!latestDraw || !values || values.length === 0) {
    return (
      <div>
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Biological Age</p>
        <p className="text-body text-clinical-charcoal text-sm mb-3">Upload your bloodwork to calculate your biological age — a single number showing how your body compares to your chronological age.</p>
        <button onClick={() => navigate('/labs/upload')} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline flex items-center gap-1">
          Upload labs <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
      </div>
    );
  }

  // No DOB on profile
  if (!profile?.dateOfBirth) {
    return (
      <div>
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Biological Age</p>
        <p className="text-body text-clinical-charcoal text-sm mb-3">Add your date of birth in Settings to calculate your biological age.</p>
        <button onClick={() => navigate('/settings')} className="text-precision text-[0.68rem] text-primary-container font-bold tracking-widest uppercase hover:underline flex items-center gap-1">
          Go to settings <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
        </button>
      </div>
    );
  }

  // Missing markers
  if (result && 'missing' in result) {
    return (
      <div>
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Biological Age</p>
        <p className="text-body text-clinical-charcoal text-sm mb-3">
          We need {result.missing.length} more {result.missing.length === 1 ? 'marker' : 'markers'} to compute your bio age.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {result.missing.slice(0, 4).map(m => (
            <span key={m} className="text-precision text-[0.55rem] text-clinical-charcoal bg-clinical-cream px-2 py-1" style={{ borderRadius: '3px' }}>{m}</span>
          ))}
          {result.missing.length > 4 && (
            <span className="text-precision text-[0.55rem] text-clinical-stone px-2 py-1">+{result.missing.length - 4} more</span>
          )}
        </div>
        <p className="text-precision text-[0.6rem] text-clinical-stone leading-relaxed">A standard CBC + CMP + hs-CRP covers all 9 markers needed.</p>
      </div>
    );
  }

  // Compute failed
  if (!result || !('result' in result)) {
    return (
      <div>
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase mb-3">Biological Age</p>
        <p className="text-body text-clinical-stone text-sm">Could not compute biological age from current data.</p>
      </div>
    );
  }

  const { phenoAge, chronologicalAge, delta, category } = result.result;
  const accent = colorFor(category);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-precision text-[0.68rem] font-bold text-clinical-stone tracking-widest uppercase">Biological Age</p>
        <span className="text-precision text-[0.55rem] text-clinical-stone tracking-wider">PhenoAge</span>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex items-baseline gap-3 mb-3"
      >
        <span className="text-authority text-6xl font-bold leading-none" style={{ color: accent }}>
          {phenoAge.toFixed(1)}
        </span>
        <span className="text-body text-clinical-stone text-sm">years</span>
      </motion.div>

      <div className="flex items-center gap-2 mb-4">
        <span
          className="text-precision text-[0.6rem] font-bold tracking-widest uppercase px-2 py-1"
          style={{ borderRadius: '3px', backgroundColor: `${accent}15`, color: accent }}
        >
          {labelFor(category, delta)}
        </span>
        <span className="text-precision text-[0.6rem] text-clinical-stone">vs chronological {chronologicalAge.toFixed(0)}</span>
      </div>

      <p className="text-body text-clinical-stone text-xs leading-relaxed mb-3">
        {category === 'younger'
          ? 'Your blood biomarkers suggest your body is biologically younger than your years. Keep doing what you\'re doing.'
          : category === 'older'
          ? 'Your blood biomarkers suggest accelerated biological aging. Your wellness plan and clinical prep have specific actions to slow this.'
          : 'Your biological age matches your chronological age — a healthy baseline.'}
      </p>

      <button
        onClick={() => navigate(`/labs/${latestDraw.id}`)}
        className="text-precision text-[0.6rem] text-primary-container font-bold tracking-widest uppercase hover:underline flex items-center gap-1"
      >
        See what drives it <span className="material-symbols-outlined text-[12px]">arrow_forward</span>
      </button>
    </div>
  );
};
