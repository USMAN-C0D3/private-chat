import { ChevronUp, LoaderCircle, Play, Square, Trash2, Upload, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";

import { ApiError, api } from "@/lib/api";
import type { BotWordlistResponse } from "@/types/api";


export interface BotConfig {
  words?: string[];
  speed: number;
  target: number;
  mode: "sequential" | "random";
  delay?: number;
  useUploadedWordlist?: boolean;
}

interface BotPanelProps {
  onStart: (config: BotConfig) => void;
  onStop: () => void;
  isRunning: boolean;
  messageCount: number;
}

type WordSource = "inline" | "uploaded";


const EMPTY_WORDLIST_STATE: BotWordlistResponse = {
  hasWordlist: false,
  filename: null,
  lineCount: 0,
  updatedAt: null,
};


export function BotPanel({ onStart, onStop, isRunning, messageCount }: BotPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [wordlistText, setWordlistText] = useState("hello\nworld\nhow are you");
  const [speed, setSpeed] = useState(10);
  const [target, setTarget] = useState(21600);
  const [mode, setMode] = useState<"sequential" | "random">("sequential");
  const [delay, setDelay] = useState(0);
  const [source, setSource] = useState<WordSource>("inline");
  const [wordlistState, setWordlistState] = useState<BotWordlistResponse>(EMPTY_WORDLIST_STATE);
  const [botError, setBotError] = useState<string | null>(null);
  const [isWordlistLoading, setIsWordlistLoading] = useState(false);
  const [isWordlistUploading, setIsWordlistUploading] = useState(false);
  const [isWordlistClearing, setIsWordlistClearing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const loadWordlistMetadata = useCallback(async () => {
    setIsWordlistLoading(true);
    try {
      const payload = await api.getBotWordlist();
      setWordlistState(payload);
      if (payload.hasWordlist && source === "inline" && wordlistText.trim().length === 0) {
        setSource("uploaded");
      }
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setBotError(caughtError.message);
      } else {
        setBotError("Unable to load the uploaded wordlist.");
      }
    } finally {
      setIsWordlistLoading(false);
    }
  }, [source, wordlistText]);

  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    void loadWordlistMetadata();
  }, [isExpanded, loadWordlistMetadata]);

  const parsedInlineWords = useMemo(
    () =>
      wordlistText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [wordlistText],
  );

  const handleStart = useCallback(() => {
    setBotError(null);

    if (source === "uploaded") {
      if (!wordlistState.hasWordlist) {
        setBotError("Upload a .txt wordlist first.");
        return;
      }

      onStart({
        speed: Math.max(1, Math.min(1000, speed)),
        target: Math.max(1, Math.min(100000, target)),
        mode,
        delay: delay > 0 ? delay : undefined,
        useUploadedWordlist: true,
      });
      return;
    }

    if (parsedInlineWords.length === 0) {
      setBotError("Please enter at least one message in the wordlist.");
      return;
    }

    onStart({
      words: parsedInlineWords,
      speed: Math.max(1, Math.min(1000, speed)),
      target: Math.max(1, Math.min(100000, target)),
      mode,
      delay: delay > 0 ? delay : undefined,
    });
  }, [delay, mode, onStart, parsedInlineWords, source, speed, target, wordlistState.hasWordlist]);

  const handleStop = useCallback(() => {
    onStop();
  }, [onStop]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      if (!file) {
        return;
      }

      setBotError(null);
      setIsWordlistUploading(true);
      try {
        const payload = await api.uploadBotWordlist(file);
        setWordlistState(payload);
        setSource("uploaded");
      } catch (caughtError) {
        if (caughtError instanceof ApiError) {
          setBotError(caughtError.message);
        } else {
          setBotError("Unable to upload this wordlist.");
        }
      } finally {
        event.target.value = "";
        setIsWordlistUploading(false);
      }
    },
    [],
  );

  const handleClearUploadedWordlist = useCallback(async () => {
    setBotError(null);
    setIsWordlistClearing(true);
    try {
      await api.clearBotWordlist();
      setWordlistState(EMPTY_WORDLIST_STATE);
      setSource("inline");
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setBotError(caughtError.message);
      } else {
        setBotError("Unable to remove the uploaded wordlist.");
      }
    } finally {
      setIsWordlistClearing(false);
    }
  }, []);

  const helperLabel =
    source === "uploaded"
      ? wordlistState.hasWordlist
        ? `${wordlistState.lineCount.toLocaleString()} lines ready from ${wordlistState.filename ?? "wordlist.txt"}`
        : "Upload a .txt wordlist to use this source."
      : `${parsedInlineWords.length.toLocaleString()} inline lines ready`;

  return (
    <div className="relative inline-flex">
      {isMounted
        ? createPortal(
            <AnimatePresence>
              {isExpanded ? (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="pointer-events-auto fixed right-4 top-[5.25rem] z-[2147483647] max-h-[calc(100svh-7.5rem)] w-[min(24rem,calc(100vw-2rem))] max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/40 via-slate-900/40 to-slate-950/60 p-4 shadow-[0_20px_60px_rgba(139,92,246,0.18)] backdrop-blur-xl sm:right-6 sm:top-[5.5rem] sm:p-5"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-violet-500/20 p-1.5">
                        <Zap className="h-4 w-4 text-violet-300" />
                      </div>
                      <h3 className="text-sm font-bold text-white">Bot Control</h3>
                    </div>
                    {isRunning ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                        Running
                      </div>
                    ) : null}
                  </div>

                  {botError ? (
                    <div className="mb-4 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs text-rose-100">
                      {botError}
                    </div>
                  ) : null}

                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-semibold text-white/80">Word Source</label>
                      <span className="text-[10px] uppercase tracking-[0.18em] text-white/45">
                        {isWordlistLoading ? "Checking" : "Ready"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSource("inline")}
                        disabled={isRunning}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          source === "inline"
                            ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/8"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Inline
                      </button>
                      <button
                        type="button"
                        onClick={() => setSource("uploaded")}
                        disabled={isRunning || (!wordlistState.hasWordlist && isWordlistLoading)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          source === "uploaded"
                            ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/8"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Uploaded .txt
                      </button>
                    </div>
                    <div className="mt-2 text-[11px] text-white/55">{helperLabel}</div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,text/plain"
                    className="hidden"
                    onChange={handleFileSelection}
                  />

                  <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-white/80">Uploaded Wordlist</div>
                        <div className="mt-1 text-[11px] text-white/50">
                          Upload a full `.txt` file once and reuse it.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleUploadClick}
                        disabled={isRunning || isWordlistUploading}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-white/12 disabled:cursor-wait disabled:opacity-60"
                      >
                        {isWordlistUploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        Upload
                      </button>
                    </div>

                    {wordlistState.hasWordlist ? (
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/15 bg-emerald-400/8 px-3 py-2 text-[11px] text-emerald-100">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{wordlistState.filename}</div>
                          <div className="mt-0.5 text-emerald-100/75">
                            {wordlistState.lineCount.toLocaleString()} lines uploaded
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleClearUploadedWordlist}
                          disabled={isRunning || isWordlistClearing}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200/15 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-50 transition hover:bg-emerald-100/10 disabled:cursor-wait disabled:opacity-60"
                        >
                          {isWordlistClearing ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-white/45">
                        No uploaded wordlist yet.
                      </div>
                    )}
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-xs font-semibold text-white/80">
                      Inline Messages
                    </label>
                    <textarea
                      value={wordlistText}
                      onChange={(event) => setWordlistText(event.target.value)}
                      disabled={isRunning}
                      placeholder="hello&#10;world&#10;how are you"
                      className="h-24 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder-white/40 transition focus:border-violet-400/50 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="mt-2 text-[11px] text-white/45">
                      Use this for quick manual lists. Choose “Uploaded .txt” above for large files.
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-semibold text-white/80">Speed</label>
                      <span className="rounded-full bg-violet-500/20 px-2 py-1 text-xs font-bold text-violet-200">
                        {speed} msg/s
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="1000"
                      value={speed}
                      onChange={(event) => setSpeed(parseInt(event.target.value, 10))}
                      disabled={isRunning}
                      className="h-2 w-full rounded-lg bg-white/10 accent-violet-400 transition disabled:opacity-50"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-white/40">
                      <span>1</span>
                      <span>1000</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-xs font-semibold text-white/80">
                      Target Messages
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={target}
                      onChange={(event) => setTarget(Math.max(1, parseInt(event.target.value, 10) || 1))}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition focus:border-violet-400/50 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-xs font-semibold text-white/80">Mode</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMode("sequential")}
                        disabled={isRunning}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          mode === "sequential"
                            ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/8"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Sequential
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode("random")}
                        disabled={isRunning}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                          mode === "random"
                            ? "border-violet-400/50 bg-violet-500/20 text-violet-200"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/8"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        Random
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-xs font-semibold text-white/80">
                      Initial Delay (seconds)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="3600"
                      value={delay}
                      onChange={(event) => setDelay(Math.max(0, parseInt(event.target.value, 10) || 0))}
                      disabled={isRunning}
                      className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white transition focus:border-violet-400/50 focus:bg-white/8 focus:outline-none focus:ring-1 focus:ring-violet-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>

                  <div className="mb-4 rounded-lg bg-white/5 p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                      Progress
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-violet-300">{messageCount}</span>
                      <span className="text-xs text-white/40">/ {target.toLocaleString()}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (messageCount / target) * 100)}%` }}
                        transition={{ type: "spring", stiffness: 100, damping: 30 }}
                        className="h-full bg-gradient-to-r from-violet-400 to-violet-600"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!isRunning ? (
                      <button
                        type="button"
                        onClick={handleStart}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-500 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_16px_rgba(139,92,246,0.25)] transition hover:scale-[1.02] hover:shadow-[0_12px_24px_rgba(139,92,246,0.35)]"
                      >
                        <Play className="h-4 w-4" />
                        Start Bot
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStop}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-rose-500 to-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-[0_8px_16px_rgba(244,63,94,0.25)] transition hover:scale-[1.02] hover:shadow-[0_12px_24px_rgba(244,63,94,0.35)]"
                      >
                        <Square className="h-4 w-4" />
                        Stop Bot
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsExpanded(false)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/75 transition hover:bg-white/10"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <motion.button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`rounded-full border px-3 py-2 text-xs font-semibold shadow-[0_12px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl transition sm:text-sm ${
          isRunning
            ? "animate-pulse border-emerald-400/30 bg-gradient-to-br from-emerald-950/50 to-emerald-900/40 text-white"
            : "border-white/10 bg-white/7 text-white hover:border-violet-400/50 hover:bg-white/10"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className={`h-4 w-4 ${isRunning ? "animate-pulse text-emerald-300" : "text-violet-300"}`} />
            <span className="text-xs font-bold text-white">
              {isRunning ? `Bot (${messageCount})` : "Bot"}
            </span>
          </div>
          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronUp className="h-4 w-4 text-white/60" />
          </motion.div>
        </div>
      </motion.button>
    </div>
  );
}
