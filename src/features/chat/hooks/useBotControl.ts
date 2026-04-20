import { useCallback, useEffect, useState } from "react";
import { getChatSocket } from "@/lib/socket";
import type { BotConfig } from "../components/BotPanel";


interface UseBotControlState {
  isRunning: boolean;
  messageCount: number;
}


export function useBotControl(): UseBotControlState & {
  startBot: (config: BotConfig) => void;
  stopBot: () => void;
} {
  return useBotControlInternal(true, null);
}


export function useBotControlInternal(
  enabled: boolean,
  username: string | null,
): UseBotControlState & {
  startBot: (config: BotConfig) => void;
  stopBot: () => void;
} {
  const [isRunning, setIsRunning] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  const socket = enabled && username ? getChatSocket(username) : null;

  const startBot = useCallback(
    (config: BotConfig) => {
      if (!enabled || !username || !socket || isRunning) {
        return;
      }

      if (!socket.connected) {
        socket.connect();
      }

      setMessageCount(0);
      socket.emit("start_bot", {
        words: config.words ?? [],
        speed: config.speed,
        target: config.target,
        mode: config.mode,
        delay: config.delay,
        useUploadedWordlist: config.useUploadedWordlist ?? false,
      });
    },
    [enabled, isRunning, socket, username],
  );

  const stopBot = useCallback(() => {
    if (!enabled || !username || !socket) {
      return;
    }

    setIsRunning(false);
    if (socket.connected) {
      socket.emit("stop_bot");
    }
  }, [enabled, socket, username]);

  useEffect(() => {
    if (!enabled || !username || !socket) {
      return;
    }

    const handleBotStarted = () => {
      setIsRunning(true);
    };

    const handleBotProgress = (data: { count: number }) => {
      setMessageCount(data.count);
    };

    const handleBotStopped = () => {
      setIsRunning(false);
    };

    const handleBotError = () => {
      setIsRunning(false);
    };

    socket.on("bot_started", handleBotStarted);
    socket.on("bot_progress", handleBotProgress);
    socket.on("bot_stopped", handleBotStopped);
    socket.on("bot_error", handleBotError);

    return () => {
      socket.off("bot_started", handleBotStarted);
      socket.off("bot_progress", handleBotProgress);
      socket.off("bot_stopped", handleBotStopped);
      socket.off("bot_error", handleBotError);
    };
  }, [enabled, socket, username]);

  return {
    isRunning,
    messageCount,
    startBot,
    stopBot,
  };
}
