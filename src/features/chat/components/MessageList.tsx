import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  type Ref,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
  hasMore: boolean;
  loadingOlder: boolean;
  connectionState: ConnectionState;
  seenMessageId: number | null;
  latestOwnMessageId: number | null;
  partnerLastReadId: number | null;
  reactions: Record<number, string | null>;
  onLoadOlder: () => Promise<void>;
  onBottomChange: (isAtBottom: boolean) => void;
  onToggleHeart: (messageId: number) => void;
  onSelectReaction: (messageId: number, emoji: string) => void;
}


function MessageListInner(
  {
    messages,
    currentUser,
    partnerDisplayName,
    typingUser,
    loading,
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
  }: MessageListProps,
  ref: Ref<MessageListHandle>,
) {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 94,
    overscan: 8,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

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
    const element = scrollParentRef.current;
    if (!element) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
      onBottomChange(distanceFromBottom < 140);
    };

    handleScroll();
    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
    };
  }, [onBottomChange]);

  const connectionLabel =
    connectionState === "connected"
      ? "Conversation"
      : connectionState === "connecting"
        ? "Connecting"
        : "Offline";

  return (
    <div className="relative z-[1] flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-none bg-transparent">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45 sm:px-5">
        <span className="truncate">{connectionLabel}</span>
        <button
          type="button"
          onClick={() => void onLoadOlder()}
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
        <div ref={scrollParentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4">
          <div
            className="relative w-full"
            style={{
              height: `${virtualizer.getTotalSize()}px`,
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const message = messages[virtualItem.index];
              if (!message) {
                return null;
              }

              const previousMessage = messages[virtualItem.index - 1] ?? null;
              const nextMessage = messages[virtualItem.index + 1] ?? null;
              const isGroupedWithPrevious = Boolean(previousMessage && previousMessage.sender === message.sender);
              const isGroupedWithNext = Boolean(nextMessage && nextMessage.sender === message.sender);

              return (
                <div
                  key={message.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  className="absolute left-0 top-0 w-full px-1 py-1.5"
                  style={{
                    contain: "layout paint style",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <MessageBubble
                    deliveryState={
                      message.sender === currentUser && message.id === latestOwnMessageId
                        ? (partnerLastReadId !== null && message.id <= partnerLastReadId ? "read" : "sent")
                        : null
                    }
                    isOwn={message.sender === currentUser}
                    isSeen={Boolean(seenMessageId && message.sender === currentUser && message.id === seenMessageId)}
                    isGroupedWithPrevious={isGroupedWithPrevious}
                    isGroupedWithNext={isGroupedWithNext}
                    message={message}
                    onSelectReaction={onSelectReaction}
                    onToggleHeart={onToggleHeart}
                    partnerDisplayName={partnerDisplayName}
                    reaction={reactions[message.id] ?? null}
                  />
                </div>
              );
            })}
          </div>

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
