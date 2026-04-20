import { CheckCheck } from "lucide-react";
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
  reaction: string | null;
  isSeen: boolean;
  deliveryState: "sent" | "read" | null;
  isGroupedWithPrevious: boolean;
  isGroupedWithNext: boolean;
  onToggleHeart: (messageId: number) => void;
  onSelectReaction: (messageId: number, emoji: string) => void;
}


export const MessageBubble = memo(function MessageBubble({
  message,
  isOwn,
  partnerDisplayName,
  reaction,
  isSeen,
  deliveryState,
  isGroupedWithPrevious,
  isGroupedWithNext,
  onToggleHeart,
  onSelectReaction,
}: MessageBubbleProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const entranceDelayMs = useMemo(() => (message.id % 5) * 24, [message.id]);
  const toggleHeartReaction = useCallback(() => {
    onToggleHeart(message.id);
  }, [message.id, onToggleHeart]);

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

  return (
    <div className={`flex w-full ${isOwn ? "justify-end" : "justify-start"} ${isGroupedWithPrevious ? "-mt-1" : ""}`}>
      {!isOwn ? (
        <div className={`mr-2 mt-auto hidden h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white sm:flex ${isGroupedWithPrevious ? "opacity-0" : "opacity-100"}`}>
          {initialsFor(partnerDisplayName)}
        </div>
      ) : null}

      <div className={`group relative flex max-w-[80%] flex-col sm:max-w-[74%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isGroupedWithPrevious ? (
          <div className="mb-1.5 px-1 text-[11px] font-medium tracking-[0.01em] text-white/52">
            {isOwn ? "You" : partnerDisplayName} {"\u2022"} {timestamp}
          </div>
        ) : (
          <div className="mb-0.5 px-1 text-[9px] text-transparent">.</div>
        )}

        <div className="relative flex items-end gap-2">
          <div
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            className={`bubble-gloss relative rounded-[1.5rem] px-[0.95rem] py-[0.58rem] text-[14px] leading-[1.5] shadow-[0_12px_30px_rgba(0,0,0,0.18)] transition-all duration-200 sm:px-[1.05rem] sm:py-[0.66rem] sm:text-[14.5px] sm:leading-[1.53] ${
              isOwn
                ? `bubble-self bg-[linear-gradient(135deg,#8b5cf6,#3b82f6)] text-white animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    isGroupedWithPrevious ? "rounded-tr-[1rem]" : "rounded-br-md"
                  } ${isGroupedWithNext ? "rounded-br-[0.7rem]" : "rounded-br-md"}`
                : `bubble-other text-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    isGroupedWithPrevious ? "rounded-tl-[1rem]" : "rounded-bl-md"
                  } ${isGroupedWithNext ? "rounded-bl-[0.7rem]" : "rounded-bl-md"}`
            } touch-manipulation`}
            style={{ animationDelay: `${entranceDelayMs}ms` }}
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
