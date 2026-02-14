"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface FileUploadZoneProps {
  label: string;
  description: string;
  accept: string;
  files: File[];
  onFilesChange: (files: File[]) => void;
  required?: boolean;
  icon: React.ReactNode;
}

export function FileUploadZone({
  label,
  description,
  accept,
  files,
  onFilesChange,
  required,
  icon,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      onFilesChange([...files, ...droppedFiles]);
    },
    [files, onFilesChange]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const selected = Array.from(e.target.files);
        onFilesChange([...files, ...selected]);
      }
    },
    [files, onFilesChange]
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        {required && (
          <span className="text-xs text-destructive font-medium">必須</span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`upload-zone relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 sm:p-8 cursor-pointer transition-all ${
          isDragging
            ? "upload-zone-active border-primary bg-primary/5"
            : files.length > 0
              ? "border-success/40 bg-success/5 hover:border-success/60"
              : "border-muted-foreground/20 bg-muted/30 hover:border-primary/40 hover:bg-primary/3"
        }`}
      >
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
            files.length > 0
              ? "bg-success/10 text-success"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {icon}
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">
            {files.length > 0
              ? `${files.length}件のファイルを選択済み`
              : "ドラッグ&ドロップ"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1.5">
          {files.map((file, i) => (
            <div
              key={`${file.name}-${i}`}
              className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm animate-fade-in-up"
            >
              <span className="flex-1 truncate text-foreground">
                {file.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatSize(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(i);
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                </svg>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
