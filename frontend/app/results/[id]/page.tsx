"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Header } from "@/components/header";
import { ScoreCircle } from "@/components/score-circle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import {
  connectGradingStream,
  getGradingResult,
  type GradingResult,
  type QuestionGrading,
} from "@/lib/api";

// ── ストリーミング中のログ表示 ──

interface StreamLog {
  id: number;
  type: "status" | "reasoning" | "tool" | "text" | "error";
  text: string;
  timestamp: number;
}

function StreamingView({ logs, status }: { logs: StreamLog[]; status: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      {/* Spinner + Status */}
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-[3px] border-muted animate-spin border-t-primary" />
        </div>
        <div className="text-center">
          <p className="text-base font-semibold">{status}</p>
          <p className="text-xs text-muted-foreground mt-1">
            OpenAI Agents SDK が採点を実行中
          </p>
        </div>
      </div>

      {/* Live log */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            採点ログ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={scrollRef}
            className="h-48 overflow-y-auto rounded-lg bg-muted/30 p-3 font-mono text-xs space-y-1"
          >
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex gap-2 ${
                  log.type === "error"
                    ? "text-destructive"
                    : log.type === "tool"
                      ? "text-chart-3"
                      : log.type === "reasoning"
                        ? "text-primary"
                        : "text-muted-foreground"
                }`}
              >
                <span className="shrink-0 opacity-50">
                  {new Date(log.timestamp).toLocaleTimeString("ja-JP", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className={`shrink-0 w-14 text-right ${
                    log.type === "tool"
                      ? "text-chart-3"
                      : log.type === "reasoning"
                        ? "text-primary"
                        : ""
                  }`}
                >
                  [{log.type}]
                </span>
                <span className="break-all">{log.text}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-muted-foreground animate-gentle-pulse">
                接続中...
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 問題カード ──

function QuestionCard({ q }: { q: QuestionGrading }) {
  return (
    <Card
      className={`overflow-hidden transition-all ${
        q.is_correct
          ? "border-success/30"
          : q.score > 0
            ? "border-warning/30"
            : "border-destructive/30"
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${
                q.is_correct
                  ? "bg-success"
                  : q.score > 0
                    ? "bg-warning text-warning-foreground"
                    : "bg-destructive"
              }`}
            >
              {q.is_correct ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7l3 3 5-5" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l6 6M10 4l-6 6" /></svg>
              )}
            </div>
            <div>
              <CardTitle className="text-sm">問{q.question_number}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{q.question_summary}</p>
            </div>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs font-bold tabular-nums">
            {q.score}/{q.max_score}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">生徒の解答</p>
            <p className="text-sm font-mono">{q.student_answer}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">正解</p>
            <p className="text-sm font-mono">{q.correct_answer}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">正誤の詳細</p>
          <p className="text-sm leading-relaxed">{q.correctness_detail}</p>
        </div>

        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-1">途中式・プロセスの評価</p>
          <p className="text-sm leading-relaxed">{q.process_evaluation}</p>
        </div>

        {q.partial_credit_reason && (
          <div className="rounded-lg bg-warning/10 border border-warning/20 p-3">
            <p className="text-xs font-semibold text-warning-foreground mb-1">部分点の理由</p>
            <p className="text-sm leading-relaxed">{q.partial_credit_reason}</p>
          </div>
        )}

        <div className="rounded-lg bg-primary/5 border border-primary/10 p-3">
          <p className="text-xs font-semibold text-primary mb-1">改善アドバイス</p>
          <p className="text-sm leading-relaxed">{q.improvement_hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── メインページ ──

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<GradingResult | null>(null);
  const [annotatedUrls, setAnnotatedUrls] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [streamStatus, setStreamStatus] = useState("接続中...");
  const [logs, setLogs] = useState<StreamLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const logIdRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);

  function addLog(type: StreamLog["type"], text: string) {
    logIdRef.current += 1;
    setLogs((prev) => [
      ...prev,
      { id: logIdRef.current, type, text, timestamp: Date.now() },
    ]);
  }

  useEffect(() => {
    if (!id) return;

    // まず DB から既存の結果を確認
    getGradingResult(id)
      .then((res) => {
        if (res.status === "completed" && res.result) {
          // 既に完了 → 結果を直接表示
          setResult(res.result);
          setAnnotatedUrls(res.annotated_image_urls);
          setIsStreaming(false);
          return;
        }

        if (res.status === "error") {
          setError(res.error || "採点中にエラーが発生しました");
          setIsStreaming(false);
          return;
        }

        // 未完了 → SSE ストリーム接続
        startStream();
      })
      .catch(() => {
        // DB にまだない or エラー → ストリーム接続を試みる
        startStream();
      });

    function startStream() {
      addLog("status", "サーバーに接続中...");

      const es = connectGradingStream(id, {
        onStatus: (msg) => {
          setStreamStatus(msg);
          addLog("status", msg);
        },
        onReasoning: (text) => {
          setStreamStatus("推論中...");
          addLog("reasoning", text);
        },
        onTextDelta: (delta) => {
          setStreamStatus("回答を生成中...");
          addLog("text", delta);
        },
        onToolCalled: (info) => {
          setStreamStatus(info);
          addLog("tool", info);
        },
        onToolOutput: (info) => {
          setStreamStatus("ツール完了、分析中...");
          addLog("tool", info);
        },
        onResult: (grading, urls) => {
          setResult(grading);
          if (urls.length > 0) setAnnotatedUrls(urls);
          setIsStreaming(false);
          setStreamStatus("完了");
          addLog("status", `採点完了: ${grading.total_score}/${grading.max_total_score}点`);
        },
        onError: (err) => {
          setError(err);
          setIsStreaming(false);
          addLog("error", err);
        },
        onDone: () => {
          setIsStreaming(false);
        },
      });

      esRef.current = es;
    }

    return () => {
      esRef.current?.close();
    };
  }, [id]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8l4-4" />
          </svg>
          新しい採点
        </Link>

        {/* ── ストリーミング中 ── */}
        {isStreaming && (
          <StreamingView logs={logs} status={streamStatus} />
        )}

        {/* ── エラー ── */}
        {error && !isStreaming && (
          <Card className="border-destructive/30">
            <CardContent className="p-6 text-center">
              <p className="text-destructive font-medium">{error}</p>
              <Button asChild variant="outline" className="mt-4">
                <Link href="/">もう一度やり直す</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── 採点結果 ── */}
        {result && !isStreaming && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Score */}
            <div className="flex flex-col items-center gap-4 py-4">
              <ScoreCircle
                score={result.total_score}
                maxScore={result.max_total_score}
              />
              <Badge variant="secondary">{result.difficulty_assessment}</Badge>
            </div>

            <Separator />

            <Tabs defaultValue="details" className="w-full">
              <TabsList className="w-full">
                <TabsTrigger value="details" className="flex-1 text-xs sm:text-sm">
                  問題別の採点
                </TabsTrigger>
                <TabsTrigger value="overview" className="flex-1 text-xs sm:text-sm">
                  総合評価
                </TabsTrigger>
                {annotatedUrls.length > 0 && (
                  <TabsTrigger value="images" className="flex-1 text-xs sm:text-sm">
                    添削画像
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="details" className="mt-4">
                <div className="space-y-4 stagger-children">
                  {result.questions.map((q, i) => (
                    <QuestionCard key={i} q={q} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <Card>
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold mb-2">総合評価</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {result.overall_evaluation}
                    </p>
                  </CardContent>
                </Card>

                <Card className="border-success/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-success mb-2">良い点</h3>
                    <ul className="space-y-1.5">
                      {result.strengths.map((s, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-success shrink-0 mt-0.5">
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 7l3 3 5-5" /></svg>
                          </span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-destructive/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-destructive mb-2">改善点</h3>
                    <ul className="space-y-1.5">
                      {result.weaknesses.map((w, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-destructive shrink-0 mt-1">
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><circle cx="5" cy="5" r="3" /></svg>
                          </span>
                          {w}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-primary/20">
                  <CardContent className="p-4 sm:p-5">
                    <h3 className="text-sm font-semibold text-primary mb-2">学習アドバイス</h3>
                    <ul className="space-y-1.5">
                      {result.study_advice.map((a, i) => (
                        <li key={i} className="flex gap-2 text-sm leading-relaxed">
                          <span className="text-primary shrink-0 mt-0.5 font-bold text-xs">{i + 1}.</span>
                          {a}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>

              {annotatedUrls.length > 0 && (
                <TabsContent value="images" className="mt-4">
                  <div className="grid grid-cols-1 gap-4">
                    {annotatedUrls.map((url, i) => (
                      <Dialog key={i}>
                        <DialogTrigger asChild>
                          <button className="group relative overflow-hidden rounded-xl border bg-muted/30 hover:border-primary/30 transition-all">
                            <Image src={url} alt={`添削画像 ${i + 1}`} width={800} height={600} className="w-full h-auto object-contain" unoptimized />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 text-white text-xs px-3 py-1.5 rounded-full">拡大表示</span>
                            </div>
                          </button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl p-2">
                          <Image src={url} alt={`添削画像 ${i + 1}`} width={1600} height={1200} className="w-full h-auto" unoptimized />
                        </DialogContent>
                      </Dialog>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>

            <div className="pt-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/">新しい採点を始める</Link>
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
