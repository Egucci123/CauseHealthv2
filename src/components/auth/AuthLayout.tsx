// src/components/auth/AuthLayout.tsx

interface AuthLayoutProps {
  children:    React.ReactNode;
  title:       string;
  subtitle?:   string;
  maxWidth?:   'sm' | 'md';
}

export const AuthLayout = ({
  children,
  title,
  subtitle,
  maxWidth = 'md',
}: AuthLayoutProps) => {
  const widths = { sm: 'max-w-sm', md: 'max-w-md' };

  return (
    <div className="min-h-screen bg-[#131313] flex flex-col">
      <nav className="px-6 py-5 flex justify-between items-center border-b border-[#414844]/15">
        <a href="/" className="text-xl font-serif text-white hover:opacity-90 transition-opacity">
          CauseHealth<span className="text-primary-container">.</span>
        </a>
        <p className="text-precision text-[0.68rem] text-on-surface-variant tracking-widest uppercase hidden md:block">
          Clinical Health Intelligence
        </p>
      </nav>

      {/* items-start on mobile — login card is taller than short viewports,
          so vertical-centering pushes the top of the card (Google button +
          magic-link button) above the fold and the user only sees the email
          form. md:items-center restores the desktop look on bigger screens. */}
      <div className="flex-1 flex items-start md:items-center justify-center px-6 py-8 md:py-12">
        <div className={`w-full ${widths[maxWidth]}`}>
          <div className="bg-clinical-white rounded-[10px] overflow-hidden shadow-card-md">
            <div className="bg-[#1C1B1B] px-8 py-6 border-b border-[#414844]/20">
              <h1 className="text-authority text-2xl text-white font-semibold">
                {title}
              </h1>
              {subtitle && (
                <p className="text-body text-on-surface-variant text-sm mt-1">
                  {subtitle}
                </p>
              )}
            </div>
            <div className="p-8">
              {children}
            </div>
          </div>

          <p className="text-precision text-[0.6rem] text-on-surface-variant/40 text-center mt-6 tracking-wide leading-relaxed">
            CauseHealth. is an educational platform.
            Content is not medical advice.
          </p>
        </div>
      </div>
    </div>
  );
};
