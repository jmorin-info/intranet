'use client';

import React, { useCallback } from 'react';
import { cn } from './utils';
import { Upload, FileText, X } from 'lucide-react';

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  selectedFile?: File | null;
  onClear?: () => void;
  error?: string;
  className?: string;
}

export function FileUploadZone({
  onFileSelect,
  accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.md,.txt,.png,.jpg,.jpeg,.webp,.gif',
  maxSizeMB = 50,
  selectedFile,
  onClear,
  error,
  className,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelect(file);
    },
    [onFileSelect],
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  if (selectedFile) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 rounded-btn border border-gray-300 bg-gray-50 px-4 py-3',
          className,
        )}
      >
        <FileText className="h-8 w-8 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-seal-navy truncate">{selectedFile.name}</p>
          <p className="text-xs text-seal-gray-500">{formatSize(selectedFile.size)}</p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Retirer le fichier"
          >
            <X className="h-4 w-4 text-seal-gray-500" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-btn border-2 border-dashed px-6 py-8 cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary-light'
            : 'border-gray-300 dark:border-slate-600 hover:border-primary hover:bg-primary-light/50 dark:hover:bg-slate-800',
          error && 'border-red-500',
        )}
      >
        <Upload className={cn('h-8 w-8', isDragging ? 'text-primary' : 'text-seal-gray-500')} />
        <div className="text-center">
          <p className="text-sm font-semibold text-seal-navy dark:text-white">
            Glissez-deposez un fichier ici
          </p>
          <p className="text-xs text-seal-gray-500 dark:text-slate-400 mt-1">
            ou cliquez pour parcourir — PDF, Word, Excel, PowerPoint (max {maxSizeMB} Mo)
          </p>
        </div>
        <input
          type="file"
          accept={accept}
          onChange={handleChange}
          className="hidden"
        />
      </label>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
