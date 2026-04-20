import { motion } from "motion/react";
import { LockKeyhole } from "lucide-react";
import { startTransition, useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";
import { ApiError } from "@/lib/api";


export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError(null);
      setIsSubmitting(true);

      try {
        await login({ username, password });
        startTransition(() => {
          navigate("/inbox", { replace: true });
        });
      } catch (caughtError) {
        if (caughtError instanceof ApiError) {
          setError(caughtError.message);
        } else {
          setError("Unable to sign in right now.");
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [login, navigate, password, username],
  );

  return (
    <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ opacity: [0.08, 0.16, 0.08], x: [0, 16, 0], y: [0, 14, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[10%] top-[15%] h-72 w-72 rounded-full bg-cyan-400/12 blur-3xl"
        />
        <motion.div
          animate={{ opacity: [0.06, 0.14, 0.06], x: [0, -18, 0], y: [0, -16, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute right-[12%] top-[22%] h-80 w-80 rounded-full bg-violet-500/12 blur-3xl"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="glass-panel-strong w-full max-w-[22rem] rounded-[2rem] px-5 py-6 shadow-[0_25px_80px_rgba(3,8,24,0.3)] sm:max-w-sm sm:px-6"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/8 text-cyan-100">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-[1.75rem] font-bold tracking-tight text-white">Usman&apos;s Private Room</h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            Sign in to open the private conversation.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-[1rem] border border-rose-400/18 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted-strong">Username</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              placeholder="Enter your username"
              className="w-full rounded-[1rem] border border-white/10 bg-white/6 px-4 py-3.5 text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/25 focus:bg-white/8"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted-strong">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              placeholder="Enter your password"
              className="w-full rounded-[1rem] border border-white/10 bg-white/6 px-4 py-3.5 text-white outline-none transition placeholder:text-white/28 focus:border-cyan-300/25 focus:bg-white/8"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-[1rem] bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
