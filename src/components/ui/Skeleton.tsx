// src/components/ui/Skeleton.tsx
// Skeletons match the exact shape of the content they replace

const shimmer = `
  relative overflow-hidden
  before:absolute before:inset-0
  before:-translate-x-full
  before:animate-[shimmer_1.5s_infinite]
  before:bg-gradient-to-r
  before:from-transparent before:via-white/10 before:to-transparent
`;

export const SkeletonText = ({ className = '' }: { className?: string }) => (
  <div className={`h-4 bg-[#2A2A2A] rounded-sm ${shimmer} ${className}`} />
);

export const SkeletonCard = () => (
  <div className="bg-clinical-white rounded-[10px] p-8 border-t-[3px] border-[#2A2A2A]">
    <div className="h-6 bg-[#E8E3DB] rounded-sm w-1/3 mb-4" />
    <div className="h-4 bg-[#E8E3DB] rounded-sm w-1/2 mb-8" />
    <div className="h-8 bg-[#E8E3DB] rounded-sm w-full mb-4" />
    <div className="h-4 bg-[#E8E3DB] rounded-sm w-3/4" />
  </div>
);

export const SkeletonLabCard = () => (
  <div className="bg-clinical-white rounded-[10px] p-8 border-t-[3px] border-[#E8E3DB]">
    <div className="flex justify-between mb-6">
      <div className="h-5 bg-[#E8E3DB] rounded-sm w-1/4" />
      <div className="h-5 bg-[#E8E3DB] rounded-sm w-16" />
    </div>
    <div className="h-12 bg-[#E8E3DB] rounded-sm w-1/3 mb-8" />
    {/* Range bar skeleton */}
    <div className="h-2 bg-[#E8E3DB] rounded-sm w-full mb-3" />
    <div className="flex gap-4">
      <div className="h-3 bg-[#E8E3DB] rounded-sm w-24" />
      <div className="h-3 bg-[#E8E3DB] rounded-sm w-24" />
    </div>
  </div>
);
