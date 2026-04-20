import { motion } from "motion/react";
import { Navigate, Outlet } from "react-router";

import { useAuth } from "@/app/providers/AuthProvider";


function SessionSplash() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(124,58,237,0.16),transparent_26%)]" />
      <motion.div
        animate={{ opacity: [0.55, 1, 0.55], scale: [0.98, 1.02, 0.98] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        className="glass-panel-strong accent-border relative flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] px-8 py-10 text-center"
      >
        <div className="hero-title text-2xl font-bold gradient-text">Private Chat</div>
        <div className="h-2 w-28 overflow-hidden rounded-full bg-white/10">
          <motion.div
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
            className="h-full w-16 rounded-full bg-[linear-gradient(90deg,rgba(124,58,237,0.9),rgba(37,99,235,0.95),rgba(34,211,238,0.85))]"
          />
        </div>
        <p className="text-sm text-muted">Restoring your private session.</p>
      </motion.div>
    </div>
  );
}


export function ProtectedRoute() {
  const { status, isAuthenticated } = useAuth();

  if (status === "loading") {
    return <SessionSplash />;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  return <Outlet />;
}


export function PublicOnlyRoute() {
  const { status, isAuthenticated } = useAuth();

  if (status === "loading") {
    return <SessionSplash />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/inbox" />;
  }

  return <Outlet />;
}
