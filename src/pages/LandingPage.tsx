import { motion } from "motion/react";
import { ArrowRight, LogOut, MessageCircleHeart, UserRound } from "lucide-react";
import { startTransition } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";


export function LandingPage() {
  const navigate = useNavigate();
  const { user, partner, logout } = useAuth();

  async function handleLogout() {
    await logout();
    startTransition(() => {
      navigate("/", { replace: true });
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ x: [0, 24, 0], y: [0, 18, 0], opacity: [0.14, 0.28, 0.14] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[6%] top-[12%] h-72 w-72 rounded-full bg-cyan-400/14 blur-3xl"
        />
        <motion.div
          animate={{ x: [0, -26, 0], y: [0, -20, 0], opacity: [0.12, 0.24, 0.12] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[4%] top-[18%] h-80 w-80 rounded-full bg-violet-500/14 blur-3xl"
        />
      </div>

      <main className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <header className="flex items-center justify-between">
          <div className="glass-panel flex items-center gap-3 rounded-full px-4 py-2 text-sm text-muted">
            <span className="hero-title text-base font-bold text-white">Private Chat</span>
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Signed in as {user}
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/24 hover:bg-white/10"
          >
            <span className="inline-flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </span>
          </button>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7 }}
              className="glass-panel mb-6 inline-flex items-center gap-3 rounded-full px-4 py-2 text-sm text-muted"
            >
              <MessageCircleHeart className="h-4 w-4 text-cyan-300" />
              A simpler private DM experience.
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.05 }}
              className="hero-title gradient-text max-w-4xl text-5xl font-bold leading-[0.95] sm:text-6xl lg:text-7xl"
            >
              Your conversation space is ready.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.12 }}
              className="mt-6 max-w-2xl text-lg leading-8 text-muted sm:text-xl"
            >
              {partner
                ? `You can open the inbox and start chatting with ${partner} right away.`
                : "The first account is ready. Create or sign in with the second account from another browser to start messaging."}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.85, delay: 0.2 }}
              className="mt-10 flex flex-wrap gap-4"
            >
              <button
                type="button"
                onClick={() => navigate("/inbox")}
                className="rounded-[1.35rem] bg-[linear-gradient(135deg,rgba(124,58,237,0.95),rgba(37,99,235,0.95),rgba(34,211,238,0.88))] px-6 py-4 text-base font-bold text-white shadow-[0_18px_45px_rgba(37,99,235,0.3)] transition hover:scale-[1.02]"
              >
                <span className="inline-flex items-center gap-2">
                  Open messages
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.18 }}
            className="glass-panel-strong accent-border rounded-[2rem] p-5 sm:p-6"
          >
            <div className="flex items-center justify-between text-sm text-muted">
              <span>Preview</span>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/8 px-3 py-1 text-cyan-100">
                Private DM
              </span>
            </div>

            <div className="mt-6 rounded-[1.7rem] border border-white/10 bg-black/16 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg font-bold text-white">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-base font-semibold text-white">{partner ?? "Waiting for second account"}</p>
                  <p className="text-sm text-muted">
                    {partner ? "Open the thread and start chatting." : "Another user can join from a second login."}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="max-w-[78%] rounded-[1.4rem] rounded-bl-md border border-white/10 bg-white/7 px-4 py-3 text-sm text-slate-100">
                  Hey, the chat looks much cleaner now.
                </div>
                <div className="ml-auto max-w-[78%] rounded-[1.4rem] rounded-br-md bg-[linear-gradient(135deg,rgba(124,58,237,0.94),rgba(37,99,235,0.92))] px-4 py-3 text-sm text-white">
                  Exactly. It feels more like a normal DM.
                </div>
              </div>
            </div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
