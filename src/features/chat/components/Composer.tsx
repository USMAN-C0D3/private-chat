import { LoaderCircle, Reply, SmilePlus, SendHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ChatReplyTarget } from "@/types/api";


interface ComposerProps {
  draft: string;
  disabled: boolean;
  isSending: boolean;
  connectionLabel: string;
  replyTarget: ChatReplyTarget | null;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  onCancelReply: () => void;
}


export function Composer({
  draft,
  disabled,
  isSending,
  connectionLabel,
  replyTarget,
  onDraftChange,
  onSubmit,
  onCancelReply,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastSubmitAtRef = useRef(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const emojis = useMemo(
    () => [
      "\u2764\uFE0F",
      "\u{1F602}",
      "\u{1F62D}",
      "\u{1F979}",
      "\u{1F60D}",
      "\u{1F525}",
      "\u2728",
      "\u{1F648}",
      "\u{1F44D}",
      "\u{1F90D}",
      "\u{1F970}",
      "\u{1F62E}",
    ],
    [],
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  return (
    <div className="px-3 py-3 sm:px-4 sm:py-4">
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted sm:mb-2.5">
        {connectionLabel}
      </div>

      {replyTarget ? (
        <div className="mb-2 rounded-2xl border border-white/12 bg-white/6 px-3 py-2.5 text-white/85 shadow-[0_12px_26px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:mb-3 sm:px-4 sm:py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">
                <Reply className="h-3.5 w-3.5" />
                Replying to
              </div>
              <p className="mt-1 truncate text-sm text-white/92">{replyTarget.text}</p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex items-end gap-2.5 sm:gap-3"
      >
        <div className="relative flex-1 rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] px-3 py-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl sm:px-4 sm:py-3">
          {pickerOpen ? (
            <div className="absolute bottom-full left-0 mb-2 grid w-[min(15rem,calc(100vw-2.5rem))] grid-cols-6 gap-2 rounded-[1.2rem] border border-white/10 bg-[#111319]/95 p-3 shadow-[0_20px_40px_rgba(0,0,0,0.28)]">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onDraftChange(`${draft}${emoji}`);
                    setPickerOpen(false);
                  }}
                  className="rounded-xl bg-white/5 py-2 text-lg transition hover:bg-white/10"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen((current) => !current)}
              className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition hover:bg-white/8 hover:text-white active:scale-95"
              aria-label="Open emoji picker"
            >
              <SmilePlus className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled || isSending}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();

                  const now = Date.now();
                  if (now - lastSubmitAtRef.current < 400) {
                    return;
                  }

                  if (isSending) {
                    return;
                  }

                  lastSubmitAtRef.current = now;
                  onSubmit();
                }
              }}
              rows={1}
              placeholder="Message..."
              className="max-h-40 w-full bg-transparent py-2 text-[15px] leading-6 text-white outline-none placeholder:text-white/28 sm:text-[15px] sm:leading-7"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={disabled || isSending || draft.trim().length === 0}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b5cf6,#3b82f6)] text-white shadow-[0_16px_30px_rgba(59,130,246,0.28)] transition hover:scale-[1.03] active:scale-95 disabled:cursor-default disabled:opacity-55"
          aria-label="Send message"
        >
          <SendHorizontal className={`h-5 w-5 ${isSending ? "animate-pulse" : ""}`} />
        </button>
        {isSending ? (
          <span className="ml-1.5 inline-flex items-center gap-1.5 self-center text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <span>Sending</span>
            <span className="inline-flex items-center gap-0.5" aria-hidden="true">
              <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-100/80 [animation-delay:-0.2s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-100/80 [animation-delay:-0.1s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-cyan-100/80" />
            </span>
          </span>
        ) : null}
      </form>
    </div>
  );
}
