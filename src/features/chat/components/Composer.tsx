import { SmilePlus, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";


interface ComposerProps {
  draft: string;
  disabled: boolean;
  connectionLabel: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}


export function Composer({
  draft,
  disabled,
  connectionLabel,
  onDraftChange,
  onSubmit,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
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
    <div className="px-3 py-3 sm:px-4">
      <div className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
        {connectionLabel}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        className="flex items-end gap-2 sm:gap-3"
      >
        <div className="relative flex-1 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.04))] px-3 py-2 shadow-[0_18px_40px_rgba(0,0,0,0.22)] backdrop-blur-xl">
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
              className="mb-1 flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/8 hover:text-white"
              aria-label="Open emoji picker"
            >
              <SmilePlus className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={draft}
              disabled={disabled}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              rows={1}
              placeholder="Message..."
              className="max-h-40 w-full bg-transparent py-2 text-sm leading-6 text-white outline-none placeholder:text-white/28 sm:text-[15px] sm:leading-7"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={disabled || draft.trim().length === 0}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[linear-gradient(135deg,#8b5cf6,#3b82f6)] text-white shadow-[0_16px_30px_rgba(59,130,246,0.28)] transition hover:scale-[1.03] disabled:cursor-default disabled:opacity-55"
          aria-label="Send message"
        >
          <SendHorizontal className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
