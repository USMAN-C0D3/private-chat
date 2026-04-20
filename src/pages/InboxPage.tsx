import { motion } from "motion/react";
import { ChevronRight, LogOut, Search, UserRound } from "lucide-react";
import { startTransition, useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";
import { ApiError, api } from "@/lib/api";
import type { InboxResponse } from "@/types/api";


function formatPreviewTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}


function initialsFor(username: string) {
  return username.slice(0, 1).toUpperCase();
}


export function InboxPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [thread, setThread] = useState<InboxResponse["thread"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const hasUnreadMessage = Boolean(thread?.lastMessage && thread.lastMessage.sender !== user);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const payload = await api.getInbox();
        if (!active) {
          return;
        }

        setThread(payload.thread);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        if (caughtError instanceof ApiError) {
          setError(caughtError.message);
        } else {
          setError("Unable to load your messages right now.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      startTransition(() => {
        navigate("/", { replace: true });
      });
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-4 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6rem] top-[12vh] h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute right-[-4rem] top-[18vh] h-80 w-80 rounded-full bg-violet-500/14 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-4xl flex-col">
        <div className="glass-panel-strong flex flex-1 flex-col rounded-[2rem] overflow-hidden">
          <header className="border-b border-white/8 px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white">
                  {user ? initialsFor(user) : <UserRound className="h-5 w-5" />}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white">Messages</h1>
                  <p className="text-sm text-muted">@{user}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/24 hover:bg-white/10 disabled:cursor-wait disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  {isLoggingOut ? "Leaving..." : "Logout"}
                </span>
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3 text-sm text-muted">
              <Search className="h-4 w-4 text-white/40" />
              Search is ready for the moment more private threads are added.
            </div>
          </header>

          <div className="flex-1 px-4 py-4 sm:px-5">
            {loading ? (
              <div className="glass-panel rounded-[1.6rem] px-5 py-4 text-sm text-muted">
                Loading your conversation list...
              </div>
            ) : error ? (
              <div className="rounded-[1.5rem] border border-rose-400/20 bg-rose-400/10 px-5 py-4 text-sm text-rose-100">
                {error}
              </div>
            ) : thread ? (
              <motion.button
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                type="button"
                onClick={() => navigate("/chat")}
                className="group flex w-full items-center gap-4 rounded-[1.8rem] border border-white/10 bg-white/6 px-4 py-4 text-left shadow-[0_14px_40px_rgba(0,0,0,0.15)] transition duration-200 hover:-translate-y-0.5 hover:border-white/18 hover:bg-white/10 hover:shadow-[0_24px_60px_rgba(0,0,0,0.24)]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(124,58,237,0.92),rgba(37,99,235,0.92))] text-lg font-bold text-white shadow-[0_14px_28px_rgba(37,99,235,0.18)] ring-1 ring-white/10 transition group-hover:scale-[1.02]">
                  {initialsFor(thread.title)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex min-w-0 items-center gap-2">
                      <p className="truncate text-base font-semibold text-white">{thread.title}</p>
                      {hasUnreadMessage ? (
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-sky-400 shadow-[0_0_0_4px_rgba(56,189,248,0.18)] animate-pulse"
                          aria-label="New message"
                          title="New message"
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasUnreadMessage ? (
                        <span className="rounded-full bg-sky-400/14 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200">
                          New
                        </span>
                      ) : null}
                      <span className="text-xs text-muted">
                        {thread.lastMessage ? formatPreviewTimestamp(thread.lastMessage.timestamp) : ""}
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted transition group-hover:text-white/72">
                    {thread.lastMessage?.text ?? "Start the conversation."}
                  </p>
                </div>

                <ChevronRight className="h-5 w-5 text-white/50 transition group-hover:translate-x-0.5 group-hover:text-white/75" />
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="rounded-[1.8rem] border border-white/10 bg-white/6 px-5 py-6"
              >
                <h2 className="text-xl font-bold text-white">Waiting for the conversation</h2>
                <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
                  Once the other private account signs in and sends a message, the conversation will appear
                  here automatically.
                </p>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
