import { CheckCheck } from "lucide-react";
import { useSwipeable } from "react-swipeable";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { ChatMessage } from "@/types/api";


const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});


function initialsFor(value: string) {
  return value.slice(0, 1).toUpperCase();
}


interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  partnerDisplayName: string;
  swipeEnabled: boolean;
  reaction: string | null;
  isSeen: boolean;
  deliveryState: "sent" | "read" | null;
  isGroupedWithPrevious: boolean;
  isGroupedWithNext: boolean;
  onToggleHeart: (messageId: string) => void;
  onSelectReaction: (messageId: string, emoji: string) => void;
  onSwipeReply: (message: ChatMessage) => void;
  onReplyNavigate: (messageId: string) => void;
}


export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  partnerDisplayName,
  swipeEnabled,
  reaction,
  isSeen,
  deliveryState,
  isGroupedWithPrevious,
  isGroupedWithNext,
  onToggleHeart,
  onSelectReaction,
  onSwipeReply,
  onReplyNavigate,
}: MessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const lastTapTimestampRef = useRef(0);
  const longPressTimeoutRef = useRef<number | null>(null);
  const suppressDoubleClickUntilRef = useRef(0);
  const timestamp = useMemo(() => {
    const date = new Date(message.timestamp);
    if (Number.isNaN(date.getTime())) {
      return "Just now";
    }

    return timeFormatter.format(date);
  }, [message.timestamp]);

  const emojiOptions = useMemo(
    () => ["\u2764\uFE0F", "\u{1F602}", "\u{1F525}", "\u{1F60D}", "\u{1F62D}", "\u{1F44D}"],
    [],
  );
  const entranceDelayMs = useMemo(() => (message.sequence % 5) * 24, [message.sequence]);
  const toggleHeartReaction = useCallback(() => {
    onToggleHeart(message.id);
  }, [message.id, onToggleHeart]);
  const replyPreviewText = useMemo(() => {
    if (!message.replyTo?.text) {
      return null;
    }

    return message.replyTo.text.length > 90
      ? `${message.replyTo.text.slice(0, 87)}...`
      : message.replyTo.text;
  }, [message.replyTo?.text]);

  useEffect(() => {
    return () => {
      if (longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }

      if (event.pointerType !== "touch" && event.pointerType !== "pen") {
        return;
      }

      const target = event.target as HTMLElement;
      if (target.closest("button")) {
        return;
      }

      const now = performance.now();
      if (now - lastTapTimestampRef.current < 260) {
        toggleHeartReaction();
        suppressDoubleClickUntilRef.current = now + 420;
        lastTapTimestampRef.current = 0;
        return;
      }

      lastTapTimestampRef.current = now;
    },
    [toggleHeartReaction],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && event.pointerType !== "pen") {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }

    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
    }

    longPressTimeoutRef.current = window.setTimeout(() => {
      setPickerOpen(true);
      longPressTimeoutRef.current = null;
    }, 420);
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (performance.now() < suppressDoubleClickUntilRef.current) {
        event.preventDefault();
        return;
      }

      toggleHeartReaction();
    },
    [toggleHeartReaction],
  );

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setPickerOpen((current) => !current);
  }, []);

  const swipeHandlers = useSwipeable({
    disabled: !swipeEnabled,
    trackMouse: false,
    trackTouch: true,
    preventScrollOnSwipe: false,
    delta: 50,
    onSwiping: ({ dir, deltaX, deltaY }) => {
      const canReplyFromThisDirection = (isOwn && dir === "Left") || (!isOwn && dir === "Right");
      if (!canReplyFromThisDirection) {
        return;
      }

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        return;
      }

      setIsSwiping(true);
      const nextDragX = isOwn ? -Math.min(Math.abs(deltaX), 88) : Math.min(Math.abs(deltaX), 88);
      setDragX(nextDragX);
    },
    onSwiped: () => {
      setIsSwiping(false);
      setDragX(0);
    },
    onSwipedLeft: ({ deltaX, deltaY }) => {
      if (!isOwn) {
        return;
      }

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        return;
      }

      if (Math.abs(deltaX) >= 64) {
        onSwipeReply(message);
      }
    },
    onSwipedRight: ({ deltaX, deltaY }) => {
      if (isOwn) {
        return;
      }

      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        return;
      }

      if (Math.abs(deltaX) >= 64) {
        onSwipeReply(message);
      }
    },
  });

  return (
    <div className={`flex w-full ${isOwn ? "justify-end" : "justify-start"} ${isGroupedWithPrevious ? "-mt-1" : ""}`}>
      {!isOwn ? (
        <div className={`mr-2 mt-auto hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white sm:flex ${isGroupedWithPrevious ? "opacity-0" : "opacity-100"}`}>
          {initialsFor(partnerDisplayName)}
        </div>
      ) : null}

      <div className={`group relative flex max-w-[85%] flex-col sm:max-w-[76%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isGroupedWithPrevious ? (
          <div className="mb-2 px-1 text-[11px] font-medium tracking-[0.01em] text-white/52 sm:mb-1.5">
            {isOwn ? "You" : partnerDisplayName} {"\u2022"} {timestamp}
          </div>
        ) : (
          <div className="mb-0.5 px-1 text-[9px] text-transparent">.</div>
        )}

        <div className="relative flex items-end gap-2">
          <div
            {...swipeHandlers}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className={`bubble-gloss relative rounded-[1.8rem] px-4 py-3 text-[15px] leading-[1.65] shadow-[0_14px_34px_rgba(0,0,0,0.2)] transition-all duration-200 will-change-transform sm:rounded-[1.65rem] sm:px-[1.05rem] sm:py-[0.72rem] sm:text-[14.5px] sm:leading-[1.55] ${
              isOwn
                ? `bubble-self border border-white/20 bg-[linear-gradient(135deg,#7c3aed_0%,#4f46e5_45%,#3b82f6_100%)] text-white shadow-[0_14px_34px_rgba(79,70,229,0.34),0_0_0_1px_rgba(255,255,255,0.06)] animate-in fade-in slide-in-from-bottom-2 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isGroupedWithPrevious ? "rounded-tr-[1.1rem]" : "rounded-br-[1rem]"
                  } ${isGroupedWithNext ? "rounded-br-[0.9rem]" : "rounded-br-[1rem]"}`
                : `bubble-other border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.11),rgba(255,255,255,0.07))] text-slate-50 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-[2px] animate-in fade-in slide-in-from-bottom-2 duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    isGroupedWithPrevious ? "rounded-tl-[1.1rem]" : "rounded-bl-[1rem]"
                  } ${isGroupedWithNext ? "rounded-bl-[0.9rem]" : "rounded-bl-[1rem]"}`
            } touch-manipulation`}
            style={{
              animationDelay: `${entranceDelayMs}ms`,
              transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
              transition: isSwiping ? "none" : "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {pickerOpen ? (
              <div className={`absolute ${isOwn ? "right-0" : "left-0"} bottom-full mb-2 flex max-w-[min(15rem,calc(100vw-4rem))] gap-1 rounded-full border border-white/10 bg-[#13151c]/96 px-2 py-2 shadow-[0_20px_40px_rgba(0,0,0,0.28)]`}>
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onSelectReaction(message.id, emoji);
                      setPickerOpen(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-base transition hover:bg-white/8"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            ) : null}

            {replyPreviewText && message.replyTo ? (
              <button
                type="button"
                onClick={() => onReplyNavigate(message.replyTo.id)}
                className={`mb-2.5 block w-full rounded-2xl border-l-2 px-3 py-2 text-left text-[11px] leading-4 transition ${
                  isOwn
                    ? "border-white/60 bg-white/16 text-white/95 hover:bg-white/22"
                    : "border-cyan-200/35 bg-white/10 text-white/85 hover:bg-white/14"
                }`}
              >
                <div className="font-semibold tracking-[0.02em] text-[10px] uppercase opacity-85">Replying to</div>
                <div className="mt-1 break-words whitespace-pre-wrap">{replyPreviewText}</div>
              </button>
            ) : null}

            <p className="whitespace-pre-wrap break-words tracking-[0.002em]">{message.text}</p>

            {reaction ? (
              <div className={`absolute -bottom-3 ${isOwn ? "right-3" : "left-3"} rounded-full border border-white/10 bg-[#13151c] px-2 py-0.5 text-sm shadow-[0_10px_20px_rgba(0,0,0,0.2)]`}>
                {reaction}
              </div>
            ) : null}
          </div>
        </div>

        {isOwn && deliveryState ? (
          <div className="mt-2.5 flex items-center gap-1.5 px-1 text-[10.5px] font-semibold tracking-[0.01em] text-white/45">
            <CheckCheck
              className={`h-3.5 w-3.5 ${deliveryState === "read" ? "text-sky-400 drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]" : "text-white/38"}`}
            />
            <span className={deliveryState === "read" ? "text-sky-300" : "text-white/42"}>
              {deliveryState === "read" ? "Read" : "Sent"}
            </span>
          </div>
        ) : isSeen ? (
          <div className="mt-2.5 px-1 text-[10.5px] font-semibold tracking-[0.01em] text-sky-300/90">Seen</div>
        ) : reaction ? (
          <div className="mt-3" />
        ) : null}

      </div>
    </div>
  );
});
