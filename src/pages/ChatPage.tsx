import { motion } from "motion/react";
import { ArrowLeft, ChevronDown, ChevronUp, ImageOff, ImagePlus, LoaderCircle, LogOut, ShieldCheck } from "lucide-react";
import {
  startTransition,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";
import { BotPanel } from "@/features/chat/components/BotPanel";
import { Composer } from "@/features/chat/components/Composer";
import { MessageList, type MessageListHandle } from "@/features/chat/components/MessageList";
import { useBotControlInternal } from "@/features/chat/hooks/useBotControl";
import { useChatRoom } from "@/features/chat/hooks/useChatRoom";
import { useChatWallpaper } from "@/features/chat/hooks/useChatWallpaper";
import type { ChatMessage, ChatReplyTarget } from "@/types/api";


function formatNewMessagesLabel(count: number) {
  return `${count.toLocaleString()} new message${count === 1 ? "" : "s"}`;
}


function initialsFor(value: string) {
  return value.slice(0, 1).toUpperCase();
}


export function ChatPage() {
  const navigate = useNavigate();
  const { user, userDisplayName, partnerDisplayName: authPartnerDisplayName, logout } = useAuth();
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatReplyTarget | null>(null);
  const [reactions, setReactions] = useState<Record<number, string | null>>({});
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const typingTimeoutRef = useRef<number | null>(null);
  const listRef = useRef<MessageListHandle | null>(null);
  const wallpaperInputRef = useRef<HTMLInputElement | null>(null);
  const previousMessageLengthRef = useRef(0);
  const previousLastMessageIdRef = useRef<number | null>(null);
  const initializedRef = useRef(false);

  const isAdmin = user === "usman";
  const { isRunning: isBotRunning, messageCount: botMessageCount, startBot, stopBot } = useBotControlInternal(isAdmin, user);

  const {
    loading,
    loadingOlder,
    isSending,
    messages,
    partner,
    partnerDisplayName,
    connectionState,
    typingUser,
    onlineUsers,
    hasMore,
    partnerLastReadId,
    error,
    loadOlder,
    refreshMessages,
    sendMessage,
    setTypingActive,
    markRead,
    clearError,
  } = useChatRoom(Boolean(user), user);
  const {
    wallpaperUrl,
    isProcessing: isWallpaperProcessing,
    error: wallpaperError,
    setWallpaperFromFile,
    clearWallpaper,
    clearError: clearWallpaperError,
  } = useChatWallpaper(user);
  const deferredMessages = useDeferredValue(messages);

  const activePartnerDisplayName = useMemo(
    () => partnerDisplayName ?? authPartnerDisplayName ?? "Private chat",
    [authPartnerDisplayName, partnerDisplayName],
  );

  const isPartnerOnline = useMemo(() => {
    if (!partner) {
      return false;
    }

    return onlineUsers.includes(partner);
  }, [onlineUsers, partner]);

  const connectionLabel = useMemo(() => {
    if (connectionState === "connected") {
      return isPartnerOnline ? "Online" : "Offline";
    }

    if (connectionState === "connecting") {
      return "Connecting...";
    }

    return "Offline";
  }, [connectionState, isPartnerOnline]);

  const seenMessageId = useMemo(() => {
    if (!user || messages.length === 0 || partnerLastReadId === null) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.sender === user && message.id <= partnerLastReadId) {
        return message.id;
      }
    }

    return null;
  }, [messages, partnerLastReadId, user]);

  const latestOwnMessageId = useMemo(() => {
    if (!user || messages.length === 0) {
      return null;
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.sender === user) {
        return message.id;
      }
    }

    return null;
  }, [messages, user]);

  const composerStatusLabel = useMemo(() => {
    if (typingUser) {
      return `${typingUser} is typing...`;
    }

    if (connectionState === "connecting") {
      return "Connecting...";
    }

    if (connectionState === "disconnected") {
      return "Offline";
    }

    return isPartnerOnline ? "Active now" : "Private room";
  }, [connectionState, isPartnerOnline, typingUser]);

  const wallpaperStyle = useMemo(() => {
    if (!wallpaperUrl) {
      return undefined;
    }

    return {
      backgroundImage: `url("${wallpaperUrl}")`,
      backgroundPosition: "center",
      backgroundSize: "cover",
    };
  }, [wallpaperUrl]);

  const handleBottomChange = useCallback((nextIsAtBottom: boolean) => {
    setIsAtBottom(nextIsAtBottom);
    if (nextIsAtBottom) {
      setNewMessageCount(0);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentLength = messages.length;
    const currentLastMessageId = messages[currentLength - 1]?.id ?? null;

    if (!initializedRef.current) {
      initializedRef.current = true;
      previousMessageLengthRef.current = currentLength;
      previousLastMessageIdRef.current = currentLastMessageId;
      if (currentLength > 0) {
        window.requestAnimationFrame(() => {
          listRef.current?.scrollToBottom("auto");
        });
      }
      return;
    }

    const lengthDiff = currentLength - previousMessageLengthRef.current;
    const appendedNewMessages =
      lengthDiff > 0 && currentLastMessageId !== previousLastMessageIdRef.current;

    if (appendedNewMessages) {
      if (isAtBottom) {
        window.requestAnimationFrame(() => {
          listRef.current?.scrollToBottom("smooth");
        });
      } else {
        setNewMessageCount((current) => current + lengthDiff);
      }
    }

    previousMessageLengthRef.current = currentLength;
    previousLastMessageIdRef.current = currentLastMessageId;
  }, [isAtBottom, messages]);

  const scheduleTypingReset = useCallback(() => {
    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = window.setTimeout(() => {
      setTypingActive(false);
    }, 1200);
  }, [setTypingActive]);

  const handleDraftChange = useCallback(
    (nextDraft: string) => {
      setDraft(nextDraft);

      const isActive = nextDraft.trim().length > 0;
      setTypingActive(isActive);

      if (!isActive) {
        if (typingTimeoutRef.current !== null) {
          window.clearTimeout(typingTimeoutRef.current);
        }
        return;
      }

      scheduleTypingReset();
    },
    [scheduleTypingReset, setTypingActive],
  );

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const sent = sendMessage(text, replyTarget);
    if (!sent) {
      return;
    }

    setDraft("");
    setReplyTarget(null);
    setTypingActive(false);
    setNewMessageCount(0);

    if (typingTimeoutRef.current !== null) {
      window.clearTimeout(typingTimeoutRef.current);
    }
  }, [draft, replyTarget, sendMessage, setTypingActive]);

  const handleSwipeReply = useCallback((message: ChatMessage) => {
    setReplyTarget({
      id: message.id,
      text: message.text,
    });
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    startTransition(() => {
      navigate("/", { replace: true });
    });
  }, [logout, navigate]);

  const handleToggleHeart = useCallback((messageId: number) => {
    setReactions((current) => ({
      ...current,
      [messageId]: current[messageId] === "\u2764\uFE0F" ? null : "\u2764\uFE0F",
    }));
  }, []);

  const handleSelectReaction = useCallback((messageId: number, emoji: string) => {
    setReactions((current) => ({
      ...current,
      [messageId]: emoji,
    }));
  }, []);

  const goToTop = useCallback(() => {
    listRef.current?.scrollToTop("smooth");
  }, []);

  const goToBottom = useCallback(() => {
    setNewMessageCount(0);
    listRef.current?.scrollToBottom("smooth");
  }, []);

  const handleWallpaperSelection = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      await setWallpaperFromFile(file);
      event.target.value = "";
    },
    [setWallpaperFromFile],
  );

  const markLatestIncomingAsRead = useCallback(() => {
    if (!user || !isAtBottom || typeof document === "undefined" || document.visibilityState !== "visible") {
      return;
    }

    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.sender === user) {
      return;
    }

    markRead(latestMessage.id);
  }, [isAtBottom, markRead, messages, user]);

  useEffect(() => {
    markLatestIncomingAsRead();
  }, [markLatestIncomingAsRead]);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshMessages();
        markLatestIncomingAsRead();
      }
    };

    const handleWindowFocus = () => {
      void refreshMessages();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [markLatestIncomingAsRead, refreshMessages]);

  return (
    <div className="relative flex h-[100svh] flex-col overflow-hidden bg-[#0f1014]">
      <div className="pointer-events-none absolute inset-0">
        <div className="chat-mesh absolute inset-0" />
        <div className="chat-noise absolute inset-0 opacity-40" />
        <div className="chat-grid absolute inset-0" />
        <div className="chat-vignette absolute inset-0" />
        <motion.div
          animate={{ opacity: [0.12, 0.2, 0.12], x: [0, 18, 0], y: [0, 14, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[5%] top-[10%] h-72 w-72 rounded-full bg-violet-500/14 blur-3xl"
        />
        <motion.div
          animate={{ opacity: [0.08, 0.16, 0.08], x: [0, -20, 0], y: [0, -14, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[6%] top-[20%] h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl"
        />
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 px-3 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-4">
          <div className="topbar-luxe mx-auto flex w-full max-w-4xl items-center justify-between gap-3 rounded-[1.4rem] px-3.5 py-3 sm:px-4 sm:py-3.5">
            <div className="flex min-w-0 items-center gap-3.5 pr-1 sm:gap-4">
              <button
                type="button"
                onClick={() => navigate("/inbox")}
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-white/90 transition hover:bg-white/8 active:scale-95"
                aria-label="Go back"
              >
                <ArrowLeft className="h-[1.375rem] w-[1.375rem]" />
              </button>

              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(0,0,0,0.2)]">
                {initialsFor(activePartnerDisplayName)}
              </div>

              <div className="min-w-0">
                <div className="flex min-w-0 max-w-full items-center gap-2.5">
                  <div className="max-w-[120px] truncate text-base font-semibold text-white sm:max-w-[200px] sm:text-[1.02rem]">
                    {activePartnerDisplayName}
                  </div>
                  {newMessageCount > 0 ? (
                    <span
                      className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.18)] animate-pulse"
                      aria-label="New messages"
                      title="New messages"
                    />
                  ) : null}
                </div>
                <div className="mt-2 flex min-w-0 items-center gap-3">
                  <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/7 px-3.5 py-[0.4375rem] text-[11px] font-semibold text-white/70 shadow-[0_12px_26px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:text-xs">
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${isPartnerOnline ? "bg-emerald-400" : "bg-white/25"}`} />
                    <span className="truncate">{connectionLabel}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="ml-2 flex flex-shrink-0 items-center gap-2 sm:ml-5 sm:gap-2.5">
              <input
                ref={wallpaperInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleWallpaperSelection}
              />
              <button
                type="button"
                onClick={() => wallpaperInputRef.current?.click()}
                disabled={isWallpaperProcessing}
                className="rounded-full border border-white/10 bg-white/7 px-3.5 py-2.5 text-xs font-semibold text-white/85 shadow-[0_12px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/10 active:scale-95 disabled:cursor-wait disabled:opacity-70 sm:text-sm"
                aria-label={wallpaperUrl ? "Change wallpaper" : "Upload wallpaper"}
              >
                <span className="inline-flex items-center gap-2">
                  {isWallpaperProcessing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  <span className="hidden sm:inline">{wallpaperUrl ? "Change" : "Wallpaper"}</span>
                </span>
              </button>
              {wallpaperUrl ? (
                <button
                  type="button"
                  onClick={clearWallpaper}
                  className="rounded-full border border-white/10 bg-white/7 px-3.5 py-2.5 text-xs font-semibold text-white/85 shadow-[0_12px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl transition hover:bg-white/10 active:scale-95 sm:text-sm"
                  aria-label="Remove wallpaper"
                >
                  <span className="inline-flex items-center gap-2">
                    <ImageOff className="h-4 w-4" />
                    <span className="hidden sm:inline">Reset</span>
                  </span>
                </button>
              ) : null}
              {isAdmin ? (
                <BotPanel
                  isRunning={isBotRunning}
                  messageCount={botMessageCount}
                  onStart={startBot}
                  onStop={stopBot}
                />
              ) : null}
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-white/10 active:scale-95 sm:text-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </span>
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="mx-auto mt-3 w-full max-w-4xl px-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              <span>{error}</span>
              <button
                type="button"
                onClick={clearError}
                className="rounded-full border border-rose-200/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        {wallpaperError ? (
          <div className="mx-auto mt-3 w-full max-w-4xl px-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 rounded-[1rem] border border-amber-400/18 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              <span>{wallpaperError}</span>
              <button
                type="button"
                onClick={clearWallpaperError}
                className="rounded-full border border-amber-200/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-2 py-2 sm:px-4 sm:py-4">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] shadow-[0_30px_90px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute inset-0">
              {wallpaperUrl ? (
                <>
                  <div className="absolute inset-0 scale-[1.03] opacity-55" style={wallpaperStyle} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,18,0.18),rgba(3,7,18,0.38),rgba(3,7,18,0.56))]" />
                  <div className="absolute inset-0 backdrop-blur-[2px]" />
                </>
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))]" />
              )}
            </div>
            <MessageList
              ref={listRef}
              connectionState={connectionState}
              currentUser={user ?? ""}
              error={error}
              hasMore={hasMore}
              loading={loading}
              loadingOlder={loadingOlder}
              messages={deferredMessages}
              latestOwnMessageId={latestOwnMessageId}
              onBottomChange={handleBottomChange}
              onLoadOlder={loadOlder}
              onSelectReaction={handleSelectReaction}
              onSwipeReply={handleSwipeReply}
              onToggleHeart={handleToggleHeart}
              partnerDisplayName={activePartnerDisplayName}
              partnerLastReadId={partnerLastReadId}
              reactions={reactions}
              seenMessageId={seenMessageId}
              typingUser={typingUser}
            />
          </div>
        </main>

        <div className="z-20 border-t border-white/8 bg-[linear-gradient(180deg,rgba(15,16,20,0.18),rgba(15,16,20,0.92)_32%,rgba(15,16,20,1))] px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 sm:px-4">
          <div className="mx-auto w-full max-w-4xl">
            {!isAtBottom || newMessageCount > 0 ? (
              <div className="mb-2 flex justify-center">
                <div className="inline-flex max-w-full items-center gap-1 rounded-full border border-white/10 bg-[#171920]/92 p-1 shadow-[0_16px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={goToTop}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/8"
                  >
                    <ChevronUp className="h-4 w-4" />
                    Go to top
                  </button>

                  <button
                    type="button"
                    onClick={goToBottom}
                    className="inline-flex max-w-[14rem] items-center gap-2 rounded-full bg-[linear-gradient(135deg,#8b5cf6,#3b82f6)] px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(59,130,246,0.22)] transition hover:scale-[1.02]"
                  >
                    <ChevronDown className="h-4 w-4" />
                    <span className="truncate">
                      {newMessageCount > 0 ? formatNewMessagesLabel(newMessageCount) : "Latest messages"}
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
            <Composer
              connectionLabel={composerStatusLabel}
              disabled={connectionState === "disconnected"}
              draft={draft}
              isSending={isSending}
              onCancelReply={handleCancelReply}
              onDraftChange={handleDraftChange}
              onSubmit={handleSend}
              replyTarget={replyTarget}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
