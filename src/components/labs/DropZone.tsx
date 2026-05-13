// src/components/labs/DropZone.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import { logEvent } from '../../lib/clientLog';
import { detectPartialUpload, type PartialSignal } from '../../lib/labs/partialUploadDetector';

interface DropZoneProps { onFilesSelect: (files: File[]) => void; disabled?: boolean; }

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

export const DropZone = ({ onFilesSelect, disabled }: DropZoneProps) => {
  const [error, setError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [partialSignals, setPartialSignals] = useState<Record<string, PartialSignal>>({});
  const [acknowledgedPartial, setAcknowledgedPartial] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Run partial-upload heuristic against staged PDFs in the background.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const file of stagedFiles) {
        const key = `${file.name}_${file.size}`;
        if (partialSignals[key]) continue;
        if (file.type !== 'application/pdf') continue;
        try {
          const sig = await detectPartialUpload(file);
          if (cancelled) return;
          setPartialSignals(prev => ({ ...prev, [key]: sig }));
          if (sig.suspect) {
            logEvent('partial_upload_suspected', {
              file_name: file.name, file_size: file.size,
              detected_panels: sig.detectedPanels, marker_count: sig.markerCount,
              page_count: sig.pageCount, diagnostics: sig.diagnostics,
            });
          }
        } catch { /* swallow — non-blocking nudge */ }
      }
    })();
    return () => { cancelled = true; };
  }, [stagedFiles]);

  // Reset the "I know, upload anyway" flag whenever the staged set changes.
  useEffect(() => { setAcknowledgedPartial(false); }, [stagedFiles.length]);

  const suspectFiles = stagedFiles.filter(f => partialSignals[`${f.name}_${f.size}`]?.suspect);
  const hasPartialWarning = suspectFiles.length > 0 && !acknowledgedPartial;

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    logEvent('dropzone_drop', {
      accepted_count: acceptedFiles.length,
      rejected_count: rejectedFiles.length,
      rejected_codes: rejectedFiles.map(r => r.errors[0]?.code),
      file_names: acceptedFiles.map(f => f.name).slice(0, 10),
      file_sizes: acceptedFiles.map(f => f.size),
    });
    setError(null);
    if (rejectedFiles.length > 0) {
      const code = rejectedFiles[0].errors[0]?.code;
      if (code === 'file-too-large') setError('One or more files are too large. Maximum size is 20MB each.');
      else if (code === 'file-invalid-type') setError('Only PDF or photo files are accepted.');
      else if (code === 'too-many-files') setError('Maximum 10 files at a time.');
      else setError('File not accepted. Please try a different file.');
      return;
    }
    if (acceptedFiles.length > 0) {
      setStagedFiles(prev => {
        const existing = new Set(prev.map(f => `${f.name}_${f.size}`));
        const newFiles = acceptedFiles.filter(f => !existing.has(`${f.name}_${f.size}`));
        return [...prev, ...newFiles].slice(0, 10);
      });
    }
  }, []);

  const removeFile = (index: number) => setStagedFiles(prev => prev.filter((_, i) => i !== index));

  const handleUpload = () => {
    // Belt-and-suspenders: log via clientLog AND directly to console AND to
    // a window-level marker so we have THREE ways to verify this fired.
    try {
      logEvent('dropzone_upload_clicked', {
        staged_count: stagedFiles.length,
        disabled: !!disabled,
        total_bytes: stagedFiles.reduce((s, f) => s + f.size, 0),
        file_names: stagedFiles.map(f => f.name).slice(0, 10),
      });
    } catch (e) {
      // Fallback: write directly to client_events even if logEvent throws
      try {
        // @ts-ignore
        if (window.__chEvents) window.__chEvents.push({
          t: new Date().toISOString().slice(11, 23),
          event: 'dropzone_upload_clicked_fallback',
          payload: { staged_count: stagedFiles.length, error: String(e).slice(0, 100) },
        });
      } catch {}
    }
    // @ts-ignore — set window marker so I can poll it
    (window as any).__lastUploadClick = { at: Date.now(), count: stagedFiles.length };
    console.log('[DropZone] handleUpload called', { staged: stagedFiles.length, disabled });
    if (stagedFiles.length > 0) { onFilesSelect(stagedFiles); setStagedFiles([]); }
  };

  const handleCameraInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) onDrop(files, []);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop, accept: ACCEPTED_TYPES, maxSize: 20 * 1024 * 1024, maxFiles: 10, multiple: true, disabled,
  });

  const fileTypeLabel = (f: File) => f.type.startsWith('image/') ? 'photo' : 'PDF';
  const fileTypeIcon = (f: File) => f.type.startsWith('image/') ? 'photo_camera' : 'description';

  return (
    <div className="space-y-4">
      <div {...getRootProps()} className={`relative border-2 border-dashed rounded-[10px] flex flex-col items-center justify-center p-12 text-center cursor-pointer transition-all duration-200 ${disabled ? 'opacity-50 cursor-not-allowed border-outline-variant/20' : isDragReject ? 'border-[#C94F4F] bg-[#C94F4F]/5' : isDragActive ? 'border-primary-container bg-primary-container/5' : 'border-outline-variant/30 bg-clinical-white hover:border-primary-container/50'}`}>
        <input {...getInputProps()} />
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 transition-colors ${isDragActive ? 'bg-primary-container/10' : 'bg-clinical-cream'}`}>
          <span className="material-symbols-outlined text-3xl" style={{ color: isDragActive ? '#1B4332' : '#6B6B6B' }}>{isDragActive ? 'download' : 'upload_file'}</span>
        </div>
        <AnimatePresence mode="wait">
          {isDragActive ? (
            <motion.p key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-authority text-xl text-primary-container font-semibold">Drop your lab here</motion.p>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-authority text-xl text-clinical-charcoal font-semibold mb-2">
                {stagedFiles.length > 0 ? 'Add more files' : 'Drop your lab here'}
              </p>
              <p className="text-body text-clinical-stone text-sm mb-5">
                {stagedFiles.length > 0
                  ? 'or click to add another PDF or photo'
                  : 'PDF or photo of your paper lab — both work'}
              </p>
              <div className="flex gap-2 justify-center flex-wrap">
                <Button variant="secondary" size="sm" disabled={disabled}>Browse Files</Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={disabled}
                  icon="photo_camera"
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); cameraInputRef.current?.click(); }}
                >
                  Take a Photo
                </Button>
              </div>
              {/* Hidden camera input — `capture` triggers the rear camera on mobile */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCameraInput}
                onClick={(e) => e.stopPropagation()}
                className="hidden"
              />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {['LabCorp', 'Quest', 'Hospital portals', 'Photo of paperwork'].map(fmt => (
            <span key={fmt} className="text-precision text-[0.6rem] text-clinical-stone tracking-wider bg-clinical-cream px-2 py-1" style={{ borderRadius: '3px' }}>{fmt}</span>
          ))}
        </div>
      </div>

      {/* Staged files list */}
      <AnimatePresence>
        {stagedFiles.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-clinical-white rounded-[10px] border border-outline-variant/20 overflow-hidden">
            <div className="px-5 py-3 border-b border-outline-variant/10">
              <p className="text-precision text-[0.68rem] text-clinical-stone tracking-widest uppercase font-bold">
                {stagedFiles.length} {stagedFiles.length === 1 ? 'file' : 'files'} ready
              </p>
            </div>
            <div className="divide-y divide-outline-variant/10">
              {stagedFiles.map((file, i) => (
                <div key={`${file.name}_${file.size}`} className="px-5 py-3 flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary-container text-[18px]">{fileTypeIcon(file)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-clinical-charcoal text-sm truncate">{file.name || `${fileTypeLabel(file)}.${file.type.split('/')[1] ?? 'bin'}`}</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone">{(file.size / 1024 / 1024).toFixed(1)} MB · {fileTypeLabel(file)}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-clinical-stone hover:text-[#C94F4F] transition-colors p-1">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
            {/* Partial-upload warning — soft nudge before allowing upload */}
            <AnimatePresence>
              {hasPartialWarning && (
                <motion.div
                  key="partial-warning"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-outline-variant/10 bg-[#FFF8E1] px-5 py-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined text-[#B07A1A] text-[20px] flex-shrink-0 mt-0.5">warning</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body text-clinical-charcoal text-sm font-semibold mb-1">
                        {suspectFiles.length === 1
                          ? 'This looks like a partial lab report'
                          : `${suspectFiles.length} files look like partial lab reports`}
                      </p>
                      <p className="text-body text-clinical-charcoal text-xs mb-3 leading-relaxed">
                        {(() => {
                          const sig = partialSignals[`${suspectFiles[0].name}_${suspectFiles[0].size}`];
                          if (!sig) return 'Single test panel detected.';
                          const parts: string[] = [];
                          if (sig.detectedPanels.length <= 1) parts.push(`only ${sig.detectedPanels.length || 'one'} panel detected`);
                          if (sig.markerCount > 0 && sig.markerCount < 18) parts.push(`only ${sig.markerCount} markers found`);
                          if (sig.pageCount === 1) parts.push('single-page PDF');
                          const detail = parts.length ? ` — ${parts.join(', ')}.` : '.';
                          return `Most full bloodwork orders include 30–50 markers across CMP, CBC, Lipid, A1c, and more${detail} If you have more results, export the full lab report instead of one test panel.`;
                        })()}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setShowHelp(s => !s); }}
                          className="text-precision text-[0.65rem] tracking-wide uppercase font-bold text-[#1B423A] hover:underline"
                        >
                          {showHelp ? 'Hide instructions' : 'How to export the full report'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAcknowledgedPartial(true);
                            logEvent('partial_upload_acknowledged', {
                              suspect_count: suspectFiles.length,
                              file_names: suspectFiles.map(f => f.name),
                            });
                          }}
                          className="text-precision text-[0.65rem] tracking-wide uppercase font-bold text-clinical-stone hover:text-clinical-charcoal"
                        >
                          Upload anyway
                        </button>
                      </div>
                      <AnimatePresence>
                        {showHelp && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 text-body text-clinical-charcoal text-xs leading-relaxed space-y-2"
                          >
                            <p><strong>MyChart / Epic:</strong> Go to "Test Results" → tap the menu (⋮) → "Download" or "Print" the full results list. Don't tap into a single test — that exports one panel only.</p>
                            <p><strong>LabCorp Patient:</strong> "Results" → select the visit date → "Download PDF" of the entire visit.</p>
                            <p><strong>Quest MyQuest:</strong> "Test Results" → open the visit → "Download Report" (not individual analytes).</p>
                            <p><strong>Other portals:</strong> Look for "Download full report" or "Print all results" — anything labeled "Test Details" is usually a single panel.</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="px-5 py-4 border-t border-outline-variant/10">
              <Button
                variant="primary"
                size="md"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleUpload(); }}
                disabled={hasPartialWarning}
                className="w-full justify-center"
              >
                {hasPartialWarning
                  ? 'Review warning above'
                  : `Upload ${stagedFiles.length === 1 ? 'File' : `All ${stagedFiles.length} Files`}`}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide text-center">PDF or photo · Max 20MB each · Up to 10 files · Encrypted and private</p>
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-[#C94F4F]/10 border border-[#C94F4F]/30 rounded-lg p-4 flex items-start gap-3">
            <span className="material-symbols-outlined text-[#C94F4F] text-[18px] flex-shrink-0">error</span>
            <p className="text-body text-[#C94F4F] text-sm">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
