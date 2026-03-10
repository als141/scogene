"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "scogene-install-dismissed";
const DISMISS_DURATION = 3 * 24 * 60 * 60 * 1000; // 3日間

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 既にインストール済み
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((navigator as any).standalone) return;

    // 前回閉じてから3日以内は非表示
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && Date.now() - Number(dismissedAt) < DISMISS_DURATION) {
      return;
    }

    // iOS Safari 判定
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) &&
      !/Chrome|CriOS|FxiOS/.test(navigator.userAgent);

    if (isIOS && isSafari) {
      setShowIOSGuide(true);
      // 少し遅延して表示（ページ読み込み直後はうるさい）
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }

    // Chromium 系: beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setVisible(true), 1500);
    };
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setVisible(false);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setTimeout(() => setVisible(false), 300);
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed bottom-0 inset-x-0 z-50 p-4 transition-all duration-300 ${
        dismissed
          ? "translate-y-full opacity-0"
          : "translate-y-0 opacity-100 animate-fade-in-up"
      }`}
    >
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-xl shadow-black/10">
        {/* iOS Safari ガイド */}
        {showIOSGuide && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm">
                S
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">
                  ScoGene をホーム画面に追加
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  アプリのように素早くアクセスできます
                </p>
              </div>
              <button
                onClick={handleDismiss}
                className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                </span>
                <span>
                  下の共有ボタン
                  <svg
                    className="inline mx-1 -mt-0.5"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>
                  をタップ
                </span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="shrink-0 text-muted-foreground/60"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                <span>「ホーム画面に追加」</span>
              </div>
            </div>
          </div>
        )}

        {/* Chrome / Android インストールボタン */}
        {deferredPrompt && !showIOSGuide && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm">
              S
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                ScoGene をインストール
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                ホーム画面から素早くアクセス
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                後で
              </button>
              <Button
                onClick={handleInstall}
                size="sm"
                className="h-8 px-4 text-xs font-semibold shadow-sm"
              >
                追加
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
