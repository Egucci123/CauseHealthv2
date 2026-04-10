// src/components/labs/DropZone.tsx
import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';

interface DropZoneProps { onFilesSelect: (files: File[]) => void; disabled?: boolean; }

export const DropZone = ({ onFilesSelect, disabled }: DropZoneProps) => {
  const [error, setError] = useState<string | null>(null);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    setError(null);
    if (rejectedFiles.length > 0) {
      const code = rejectedFiles[0].errors[0]?.code;
      if (code === 'file-too-large') setError('One or more files are too large. Maximum size is 20MB each.');
      else if (code === 'file-invalid-type') setError('Only PDF files are accepted.');
      else if (code === 'too-many-files') setError('Maximum 10 files at a time.');
      else setError('File not accepted. Please try a different file.');
      return;
    }
    if (acceptedFiles.length > 0) {
      setStagedFiles(prev => {
        // Dedupe by name+size
        const existing = new Set(prev.map(f => `${f.name}_${f.size}`));
        const newFiles = acceptedFiles.filter(f => !existing.has(`${f.name}_${f.size}`));
        const combined = [...prev, ...newFiles].slice(0, 10);
        return combined;
      });
    }
  }, []);

  const removeFile = (index: number) => {
    setStagedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (stagedFiles.length > 0) {
      onFilesSelect(stagedFiles);
      setStagedFiles([]);
    }
  };

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'] }, maxSize: 20 * 1024 * 1024, maxFiles: 10, multiple: true, disabled,
  });

  return (
    <div className="space-y-4">
      <div {...getRootProps()} className={`relative border-2 border-dashed rounded-[10px] flex flex-col items-center justify-center p-12 text-center cursor-pointer transition-all duration-200 ${disabled ? 'opacity-50 cursor-not-allowed border-outline-variant/20' : isDragReject ? 'border-[#C94F4F] bg-[#C94F4F]/5' : isDragActive ? 'border-primary-container bg-primary-container/5' : 'border-outline-variant/30 bg-clinical-white hover:border-primary-container/50'}`}>
        <input {...getInputProps()} />
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 transition-colors ${isDragActive ? 'bg-primary-container/10' : 'bg-clinical-cream'}`}>
          <span className="material-symbols-outlined text-3xl" style={{ color: isDragActive ? '#1B4332' : '#6B6B6B' }}>{isDragActive ? 'download' : 'upload_file'}</span>
        </div>
        <AnimatePresence mode="wait">
          {isDragActive ? (
            <motion.p key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-authority text-xl text-primary-container font-semibold">Drop your lab reports here</motion.p>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="text-authority text-xl text-clinical-charcoal font-semibold mb-2">
                {stagedFiles.length > 0 ? 'Add more lab reports' : 'Drop your lab reports here'}
              </p>
              <p className="text-body text-clinical-stone text-sm mb-5">
                {stagedFiles.length > 0 ? 'or click to browse for additional files' : 'or click to browse — add multiple PDFs before uploading'}
              </p>
              <Button variant="secondary" size="sm" disabled={disabled}>Browse Files</Button>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {['LabCorp', 'Quest Diagnostics', 'Hospital Systems', 'Any PDF Lab Report'].map(fmt => (
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
                  <span className="material-symbols-outlined text-primary-container text-[18px]">description</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-clinical-charcoal text-sm truncate">{file.name}</p>
                    <p className="text-precision text-[0.6rem] text-clinical-stone">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-clinical-stone hover:text-[#C94F4F] transition-colors p-1">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-outline-variant/10">
              <Button variant="primary" size="md" onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleUpload(); }} className="w-full justify-center">
                Upload {stagedFiles.length === 1 ? 'File' : `All ${stagedFiles.length} Files`}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-precision text-[0.6rem] text-clinical-stone tracking-wide text-center">PDF only · Maximum 20MB each · Up to 10 files · Your files are encrypted and private</p>
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
