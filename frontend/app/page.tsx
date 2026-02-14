"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Header } from "@/components/header";
import { FileUploadZone } from "@/components/file-upload-zone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { submitForGradingStream, type GradingResult } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [problemFiles, setProblemFiles] = useState<File[]>([]);
  const [answerFiles, setAnswerFiles] = useState<File[]>([]);
  const [answerKeyFiles, setAnswerKeyFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [streamStatus, setStreamStatus] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  // Register service worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const canSubmit = problemFiles.length > 0 && answerFiles.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setStreamStatus("接続中...");

    try {
      await submitForGradingStream(
        problemFiles,
        answerFiles,
        {
          onSubmission: (id) => {
            setSubmissionId(id);
          },
          onStatus: (message) => {
            setStreamStatus(message);
          },
          onReasoning: () => {
            setStreamStatus("推論中...");
          },
          onToolCalled: (info) => {
            setStreamStatus(info);
          },
          onToolOutput: () => {
            setStreamStatus("ツール実行完了、分析中...");
          },
          onTextDelta: () => {
            setStreamStatus("回答を生成中...");
          },
          onResult: (grading: GradingResult) => {
            toast.success(
              `採点完了: ${grading.total_score}/${grading.max_total_score}点`
            );
            if (submissionId) {
              router.push(`/results/${submissionId}`);
            }
          },
          onError: (error) => {
            toast.error(error);
            setStreamStatus("");
          },
          onDone: () => {
            if (submissionId) {
              router.push(`/results/${submissionId}`);
            }
          },
        },
        answerKeyFiles.length > 0 ? answerKeyFiles : undefined,
        notes || undefined
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "エラーが発生しました"
      );
    } finally {
      setIsSubmitting(false);
      setStreamStatus("");
    }
  }, [canSubmit, problemFiles, answerFiles, answerKeyFiles, notes, submissionId, router]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        {/* Hero */}
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            数学の解答を採点
          </h1>
          <p className="mt-2 text-sm sm:text-base text-muted-foreground leading-relaxed">
            問題と解答をアップロードするだけ。AIが高校教師レベルで
            <br className="hidden sm:block" />
            途中式まで含めた詳細な採点を行います。
          </p>
        </div>

        <div className="space-y-5">
          {/* Problem upload */}
          <FileUploadZone
            label="問題"
            description="写真またはPDFをアップロード（複数可）"
            accept="image/*,.pdf"
            files={problemFiles}
            onFilesChange={setProblemFiles}
            required
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            }
          />

          {/* Answer upload */}
          <FileUploadZone
            label="生徒の解答"
            description="写真またはPDFをアップロード（複数可）"
            accept="image/*,.pdf"
            files={answerFiles}
            onFilesChange={setAnswerFiles}
            required
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            }
          />

          <Separator />

          {/* Optional: Answer key */}
          {!showAnswerKey ? (
            <button
              type="button"
              onClick={() => setShowAnswerKey(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <path d="M8 3v10M3 8h10" />
              </svg>
              模範解答を追加（任意）
            </button>
          ) : (
            <div className="animate-fade-in-up">
              <FileUploadZone
                label="模範解答（任意）"
                description="正解がある場合はアップロードしてください"
                accept="image/*,.pdf"
                files={answerKeyFiles}
                onFilesChange={setAnswerKeyFiles}
                icon={
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                }
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">
              追加の指示（任意）
            </label>
            <Textarea
              placeholder="例：配点は各問5点、計算過程を重視して採点してください..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full h-12 text-base font-semibold shadow-sm"
            size="lg"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="opacity-25"
                  />
                  <path
                    d="M4 12a8 8 0 018-8"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
                {streamStatus || "AIが採点中..."}
              </span>
            ) : (
              "採点を開始"
            )}
          </Button>

          {!canSubmit && (
            <p className="text-center text-xs text-muted-foreground">
              問題と解答の両方をアップロードしてください
            </p>
          )}
        </div>

        {/* Features */}
        <div className="mt-12 sm:mt-16">
          <Separator className="mb-8" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 stagger-children">
            <Card className="border-0 shadow-none bg-muted/40">
              <CardContent className="p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold">途中式も評価</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  計算過程や論理の流れまで丁寧に確認し、部分点を適切に付与します。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-muted/40">
              <CardContent className="p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold">赤ペン添削</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  解答用紙に直接マーク。正誤、注意点を視覚的にフィードバック。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-none bg-muted/40">
              <CardContent className="p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold">学習アドバイス</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  弱点分析に基づく具体的な学習アドバイスで次に繋がる指導を。
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
