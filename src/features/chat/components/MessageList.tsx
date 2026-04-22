import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { LoaderCircle, MessageCircleHeart } from "lucide-react";

import type { ChatMessage } from "@/types/api";

import { MessageBubble } from "./MessageBubble";

import type { ConnectionState } from "../hooks/useChatRoom";


export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  scrollToTop: (behavior?: ScrollBehavior) => void;
}

interface MessageListProps {
  messages: ChatMessage[];
  currentUser: string;
  partnerDisplayName: string;
  typingUser: string | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  connectionState: ConnectionState;
  seenMessageId: string | null;
  latestOwnMessageId: string | null;
  partnerLastReadId: number | null;
  reactions: Record<string, string | null>;
  onLoadOlder: () => Promise<void>;
  onBottomChange: (isAtBottom: boolean) => void;
  onToggleHeart: (messageId: string) => void;
  onSelectReaction: (messageId: string, emoji: string) => void;
  onSwipeReply: (message: ChatMessage) => void;
}


function MessageListInner(
  {
    messages,
    currentUser,
    partnerDisplayName,
    typingUser,
    loading,
    error,
    hasMore,
    loadingOlder,
    connectionState,
    seenMessageId,
    latestOwnMessageId,
    partnerLastReadId,
    reactions,
    onLoadOlder,
    onBottomChange,
    onToggleHeart,
    onSelectReaction,
    onSwipeReply,
  }: MessageListProps,
  ref: Ref<MessageListHandle>,
) {
  const WINDOW_SIZE = 300;
  const LOAD_OLDER_THRESHOLD_PX = 120;
  const scrollParentRef = useRef<HTMLDivElement | null>(null);
  const [swipeEnabled, setSwipeEnabled] = useState(false);
  const [visibleStartIndex, setVisibleStartIndex] = useState(0);
  const visibleStartIndexRef = useRef(0);
  const atBottomRef = useRef(true);
  const loadingOlderRef = useRef(loadingOlder);
  const hasMoreRef = useRef(hasMore);
  const onLoadOlderRef = useRef(onLoadOlder);
  const loadOlderInFlightRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const prependingAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  const messageIndexByIdRef = useRef(new Map<string, number>());
  const prevMessageCountRef = useRef(messages.length);
  const prevFirstMessageIdRef = useRef<string | null>(messages[0]?.id ?? null);

  const updateVisibleStartIndex = useCallback((nextIndex: number) => {
    const boundedStart = Math.max(0, nextIndex);
    if (boundedStart !== visibleStartIndexRef.current) {
      visibleStartIndexRef.current = boundedStart;
      setVisibleStartIndex(boundedStart);
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom(behavior = "smooth") {
        const element = scrollParentRef.current;
        if (!element) {
          return;
        }

        element.scrollTo({ top: element.scrollHeight, behavior });
      },
      scrollToTop(behavior = "smooth") {
        const element = scrollParentRef.current;
        if (!element) {
          return;
        }

        element.scrollTo({ top: 0, behavior });
      },
    }),
    [],
  );

  useEffect(() => {
    loadingOlderRef.current = loadingOlder;
  }, [loadingOlder]);

  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  useEffect(() => {
    onLoadOlderRef.current = onLoadOlder;
  }, [onLoadOlder]);

  useEffect(() => {
    const map = new Map<string, number>();
    messages.forEach((message, index) => {
      map.set(message.id, index);
    });
    messageIndexByIdRef.current = map;
  }, [messages]);

  useEffect(() => {
    const nextStart = Math.max(0, messages.length - WINDOW_SIZE);
    updateVisibleStartIndex(nextStart);
  }, [messages.length, updateVisibleStartIndex]);

  const requestOlder = useCallback(async () => {
    if (loadOlderInFlightRef.current || loadingOlderRef.current || !hasMoreRef.current) {
      return;
    }

    const element = scrollParentRef.current;
    if (element) {
      prependingAnchorRef.current = {
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
      };
    }

    loadOlderInFlightRef.current = true;
    try {
      await onLoadOlderRef.current();
    } finally {
      loadOlderInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const previousCount = prevMessageCountRef.current;
    const previousFirstId = prevFirstMessageIdRef.current;
    const currentFirstId = messages[0]?.id ?? null;
    const prependedCount = Math.max(0, messages.length - previousCount);
    const didPrepend = prependedCount > 0 && currentFirstId !== previousFirstId;

    if (didPrepend) {
      updateVisibleStartIndex(Math.max(0, visibleStartIndexRef.current - prependedCount));

      const anchor = prependingAnchorRef.current;
      if (anchor) {
        window.requestAnimationFrame(() => {
          const element = scrollParentRef.current;
          if (!element) {
            return;
          }

          const nextScrollTop = anchor.scrollTop + (element.scrollHeight - anchor.scrollHeight);
          element.scrollTop = nextScrollTop;
        });
      }
    }

    prependingAnchorRef.current = null;
    prevMessageCountRef.current = messages.length;
    prevFirstMessageIdRef.current = currentFirstId;
  }, [messages, updateVisibleStartIndex]);

  useEffect(() => {
    const element = scrollParentRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      if (scrollRafRef.current !== null) {
        return;
      }

      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
        const nextIsAtBottom = distanceFromBottom < 140;
        if (atBottomRef.current !== nextIsAtBottom) {
          atBottomRef.current = nextIsAtBottom;
          onBottomChange(nextIsAtBottom);
        }

        if (element.scrollTop <= LOAD_OLDER_THRESHOLD_PX && hasMoreRef.current && !loadingOlderRef.current) {
          void requestOlder();
        }
      });
    };

    handleScroll();
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
      element.removeEventListener("scroll", handleScroll);
    };
  }, [onBottomChange, requestOlder]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(max-width: 768px), (pointer: coarse)");
    const update = () => setSwipeEnabled(media.matches);
    update();

    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  const handleReplyNavigate = useCallback(
    (targetMessageId: string) => {
      const targetIndex = messageIndexByIdRef.current.get(targetMessageId);
      if (targetIndex === undefined) {
        return;
      }

      const currentStart = visibleStartIndexRef.current;
      const currentEnd = currentStart + WINDOW_SIZE - 1;
      if (targetIndex < currentStart || targetIndex > currentEnd) {
        updateVisibleStartIndex(Math.max(0, targetIndex - Math.floor(WINDOW_SIZE / 2)));
      }

      window.requestAnimationFrame(() => {
        const targetElement = document.getElementById(`message-${targetMessageId}`);
        if (!targetElement) {
          return;
        }

        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        targetElement.classList.add("ring-2", "ring-amber-300/70", "bg-amber-100/10", "rounded-2xl", "transition-colors");
        window.setTimeout(() => {
          targetElement.classList.remove("ring-2", "ring-amber-300/70", "bg-amber-100/10", "rounded-2xl", "transition-colors");
        }, 1400);
      });
    },
    [updateVisibleStartIndex],
  );

  const visibleMessages = useMemo(
    () => messages.slice(visibleStartIndex, visibleStartIndex + WINDOW_SIZE),
    [messages, visibleStartIndex],
  );

  const connectionLabel =
    connectionState === "connected"
      ? "Conversation"
      : connectionState === "connecting"
        ? "Connecting"
        : "Offline";

  return (
    <div className="relative z-[1] flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-transparent">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45 sm:px-5 sm:py-[1.125rem]">
        <span className="truncate">{connectionLabel}</span>
        <button
          type="button"
          onClick={() => void requestOlder()}
          disabled={!hasMore || loadingOlder}
          className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-white/85 shadow-[0_10px_18px_rgba(0,0,0,0.16)] transition hover:border-white/18 hover:bg-white/10 disabled:cursor-default disabled:opacity-45"
        >
          {loadingOlder ? "Loading..." : hasMore ? "Earlier messages" : "Latest messages"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="glass-panel flex items-center gap-3 rounded-full px-4 py-3 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin text-cyan-200" />
            Loading conversation
          </div>
        </div>
      ) : error ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-100 shadow-[0_14px_30px_rgba(0,0,0,0.2)]">
            <p className="font-semibold">Unable to load messages</p>
            <p className="mt-2 text-rose-100/85">{error}</p>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-[1.6rem] border border-white/10 bg-white/5 text-cyan-100">
            <MessageCircleHeart className="h-8 w-8" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-white">Start the conversation</h3>
          <p className="mt-2 max-w-md text-sm leading-7 text-muted">
            Messages will appear here in a smooth, lightweight DM timeline.
          </p>
        </div>
      ) : (
        <div ref={scrollParentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4 sm:py-4.5">
          {visibleMessages.map((message, index) => {
              const absoluteIndex = visibleStartIndex + index;
              const previousMessage = messages[absoluteIndex - 1] ?? null;
              const nextMessage = messages[absoluteIndex + 1] ?? null;
              const isGroupedWithPrevious = Boolean(previousMessage && previousMessage.sender === message.sender);
              const isGroupedWithNext = Boolean(nextMessage && nextMessage.sender === message.sender);

              return (
                <div
                  key={message.id}
                  id={`message-${message.id}`}
                  data-index={absoluteIndex}
                  className="w-full px-1 py-2"
                >
                  <MessageBubble
                    deliveryState={
                      message.sender === currentUser && message.id === latestOwnMessageId
                        ? (partnerLastReadId !== null && message.sequence <= partnerLastReadId ? "read" : "sent")
                        : null
                    }
                    isOwn={message.sender === currentUser}
                    isSeen={Boolean(seenMessageId && message.sender === currentUser && message.id === seenMessageId)}
                    isGroupedWithPrevious={isGroupedWithPrevious}
                    isGroupedWithNext={isGroupedWithNext}
                    message={message}
                    onReplyNavigate={handleReplyNavigate}
                    onSelectReaction={onSelectReaction}
                    onSwipeReply={onSwipeReply}
                    onToggleHeart={onToggleHeart}
                    partnerDisplayName={partnerDisplayName}
                    reaction={reactions[message.id] ?? null}
                    swipeEnabled={swipeEnabled}
                  />
                </div>
              );
            })}

          {typingUser ? (
            <div className="px-2 pt-3">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-[#1a1c23]/95 px-4 py-2 text-sm text-muted shadow-[0_12px_28px_rgba(0,0,0,0.24)] backdrop-blur-xl">
                <span>{typingUser} is typing</span>
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-200" />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}


export const MessageList = memo(forwardRef(MessageListInner));
