import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { ApiError, api } from "@/lib/api";
import { getChatSocket } from "@/lib/socket";
import type {
  ChatErrorPayload,
  ChatBootstrapResponse,
  ChatMessage,
  ChatReplyTarget,
  ChatStatePayload,
  MessagesReadPayload,
  PresencePayload,
  ReceiveMessagePayload,
  ReceiveMessagesBatchPayload,
  TypingPayload,
  Username,
} from "@/types/api";


export type ConnectionState = "connecting" | "connected" | "disconnected";

const MESSAGE_FLUSH_BATCH_SIZE = 1200;
const CHAT_BOOTSTRAP_RETRY_COUNT = 2;
const CHAT_BOOTSTRAP_RETRY_DELAY_MS = 600;


interface UseChatRoomState {
  loading: boolean;
  loadingOlder: boolean;
  isSending: boolean;
  messages: ChatMessage[];
  partner: Username | null;
  partnerDisplayName: string | null;
  viewer: Username | null;
  viewerDisplayName: string | null;
  hasMore: boolean;
  nextCursor: number | null;
  typingUser: string | null;
  connectionState: ConnectionState;
  onlineUsers: Username[];
  viewerLastReadId: number | null;
  partnerLastReadId: number | null;
  error: string | null;
  loadOlder: () => Promise<void>;
  refreshMessages: () => Promise<void>;
  sendMessage: (text: string, replyTo?: ChatReplyTarget | null) => boolean;
  setTypingActive: (active: boolean) => void;
  markRead: (messageId: number) => void;
  clearError: () => void;
}


function integrateMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) {
    return existing;
  }

  if (existing.length === 0) {
    return incoming;
  }

  const firstExistingId = existing[0].id;
  const lastExistingId = existing[existing.length - 1].id;
  const firstIncomingId = incoming[0].id;
  const lastIncomingId = incoming[incoming.length - 1].id;

  if (lastIncomingId < firstExistingId) {
    return [...incoming, ...existing];
  }

  if (firstIncomingId > lastExistingId) {
    return [...existing, ...incoming];
  }

  const seenIds = new Set(existing.map((message) => message.id));
  const merged = existing.slice();
  for (const message of incoming) {
    if (!seenIds.has(message.id)) {
      merged.push(message);
    }
  }

  merged.sort((left, right) => left.id - right.id);
  return merged;
}


export function useChatRoom(enabled: boolean, username: Username | null): UseChatRoomState {
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [partner, setPartner] = useState<Username | null>(null);
  const [partnerDisplayName, setPartnerDisplayName] = useState<string | null>(null);
  const [viewer, setViewer] = useState<Username | null>(null);
  const [viewerDisplayName, setViewerDisplayName] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [onlineUsers, setOnlineUsers] = useState<Username[]>([]);
  const [viewerLastReadId, setViewerLastReadId] = useState<number | null>(null);
  const [partnerLastReadId, setPartnerLastReadId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingMessagesRef = useRef<ChatMessage[]>([]);
  const flushHandleRef = useRef<number | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const viewerRef = useRef<string | null>(null);
  const viewerLastReadRef = useRef<number>(0);
  const refreshInFlightRef = useRef(false);
  const bootstrapRequestIdRef = useRef(0);
  const sendLockRef = useRef(false);
  const sendUnlockTimerRef = useRef<number | null>(null);

  const delay = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }, []);

  const applyBootstrapPayload = useCallback((payload: ChatBootstrapResponse) => {
    viewerRef.current = payload.viewer;
    setMessages((current) => integrateMessages(payload.messages, current));
    setPartner(payload.partner);
    setPartnerDisplayName(payload.partnerDisplayName);
    setViewer(payload.viewer);
    setViewerDisplayName(payload.viewerDisplayName);
    setHasMore(payload.hasMore);
    setNextCursor(payload.nextCursor);
    setViewerLastReadId(payload.viewerLastReadId);
    setPartnerLastReadId(payload.partnerLastReadId);
    viewerLastReadRef.current = payload.viewerLastReadId ?? 0;
  }, []);

  const fetchBootstrapWithRetry = useCallback(async () => {
    let attempt = 0;
    while (attempt <= CHAT_BOOTSTRAP_RETRY_COUNT) {
      try {
        return await api.getChatBootstrap();
      } catch (caughtError) {
        console.error("Failed to load chat bootstrap:", caughtError);
        if (attempt >= CHAT_BOOTSTRAP_RETRY_COUNT) {
          throw caughtError;
        }

        attempt += 1;
        await delay(CHAT_BOOTSTRAP_RETRY_DELAY_MS * attempt);
      }
    }

    throw new Error("Unable to load chat bootstrap.");
  }, [delay]);

  const refreshMessages = useCallback(async () => {
    if (!enabled || refreshInFlightRef.current) {
      return;
    }

    const requestId = ++bootstrapRequestIdRef.current;
    refreshInFlightRef.current = true;
    try {
      const payload = await fetchBootstrapWithRetry();
      if (requestId !== bootstrapRequestIdRef.current) {
        return;
      }

      applyBootstrapPayload(payload);
      setError(null);
    } catch (caughtError) {
      if (requestId !== bootstrapRequestIdRef.current) {
        return;
      }

      console.error("Failed to refresh messages:", caughtError);
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Unable to refresh the chat room.");
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [applyBootstrapPayload, enabled, fetchBootstrapWithRetry]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const socket = getChatSocket(username);
    let active = true;

    setLoading(true);
    setLoadingOlder(false);
    setMessages([]);
    setHasMore(false);
    setNextCursor(null);
    setError(null);
    setTypingUser(null);
    setConnectionState("connecting");
    setViewerLastReadId(null);
    setPartnerLastReadId(null);

    const flushPendingMessages = () => {
      flushHandleRef.current = null;
      if (!active || pendingMessagesRef.current.length === 0) {
        return;
      }

      const batch =
        pendingMessagesRef.current.length > MESSAGE_FLUSH_BATCH_SIZE
          ? pendingMessagesRef.current.splice(0, MESSAGE_FLUSH_BATCH_SIZE)
          : pendingMessagesRef.current.splice(0, pendingMessagesRef.current.length);

      startTransition(() => {
        setMessages((current) => integrateMessages(current, batch));
      });

      if (pendingMessagesRef.current.length > 0) {
        scheduleFlush();
      }
    };

    const scheduleFlush = () => {
      if (flushHandleRef.current !== null) {
        return;
      }

      flushHandleRef.current = window.requestAnimationFrame(flushPendingMessages);
    };

    const clearTypingAfterDelay = (sender: string) => {
      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = window.setTimeout(() => {
        setTypingUser((current) => (current === sender ? null : current));
      }, 1400);
    };

    const handleConnect = () => {
      setConnectionState("connected");
      setError(null);
      void refreshMessages();
    };

    const handleDisconnect = () => {
      setConnectionState("disconnected");
    };

    const handleConnectError = (caughtError: Error) => {
      if (!active) {
        return;
      }

      setConnectionState("disconnected");
      setError(caughtError.message || "Realtime connection failed.");
    };

    const handleChatState = (payload: ChatStatePayload) => {
      if (!active) {
        return;
      }

      viewerRef.current = payload.user;
      setViewer(payload.user);
      setOnlineUsers(payload.onlineUsers);
      setViewerLastReadId(payload.viewerLastReadId);
      setPartnerLastReadId(payload.partnerLastReadId);
      viewerLastReadRef.current = payload.viewerLastReadId ?? 0;
    };

    const handlePresence = (payload: PresencePayload) => {
      if (!active) {
        return;
      }

      setOnlineUsers(payload.onlineUsers);
    };

    const handleUserOnline = (payload: PresencePayload) => {
      handlePresence(payload);
    };

    const enqueueMessages = (incoming: ChatMessage[]) => {
      if (!active || incoming.length === 0) {
        return;
      }

      pendingMessagesRef.current.push(...incoming);
      const latestIncoming = incoming[incoming.length - 1];
      if (latestIncoming && latestIncoming.sender !== viewerRef.current) {
        setPartner((current) => current ?? latestIncoming.sender);
      }
      setTypingUser(null);
      scheduleFlush();
    };

    const handleReceiveMessage = (payload: ReceiveMessagePayload) => {
      if (!active) {
        return;
      }

      enqueueMessages([payload.message]);
    };

    const handleNewMessage = (payload: ReceiveMessagePayload) => {
      handleReceiveMessage(payload);
    };

    const handleReceiveMessages = (payload: ReceiveMessagesBatchPayload) => {
      enqueueMessages(payload.messages);
    };

    const handleMessagesRead = (payload: MessagesReadPayload) => {
      if (!active) {
        return;
      }

      if (payload.reader === viewerRef.current) {
        setViewerLastReadId(payload.messageId);
        viewerLastReadRef.current = payload.messageId;
        return;
      }

      setPartnerLastReadId((current) => {
        if (current === null) {
          return payload.messageId;
        }

        return payload.messageId > current ? payload.messageId : current;
      });
    };

    const handleTyping = (payload: TypingPayload) => {
      if (!active) {
        return;
      }

      if (!payload.active) {
        setTypingUser((current) => (current === payload.sender ? null : current));
        return;
      }

      setTypingUser(payload.sender);
      clearTypingAfterDelay(payload.sender);
    };

    const handleChatError = (payload: ChatErrorPayload) => {
      if (!active) {
        return;
      }

      setError(payload.message);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("chat_state", handleChatState);
    socket.on("presence", handlePresence);
    socket.on("user_online", handleUserOnline);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("new_message", handleNewMessage);
    socket.on("receive_messages", handleReceiveMessages);
    socket.on("messages_read", handleMessagesRead);
    socket.on("typing", handleTyping);
    socket.on("chat_error", handleChatError);
    socket.connect();

    void (async () => {
      const requestId = ++bootstrapRequestIdRef.current;
      try {
        const payload = await fetchBootstrapWithRetry();
        if (!active) {
          return;
        }

        if (requestId !== bootstrapRequestIdRef.current) {
          return;
        }

        applyBootstrapPayload(payload);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        if (requestId !== bootstrapRequestIdRef.current) {
          return;
        }

        console.error("Failed to initialize chat room:", caughtError);

        if (caughtError instanceof ApiError) {
          setError(caughtError.message);
        } else {
          setError("Unable to load the chat room.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      pendingMessagesRef.current = [];

      if (flushHandleRef.current !== null) {
        window.cancelAnimationFrame(flushHandleRef.current);
      }

      if (typingTimeoutRef.current !== null) {
        window.clearTimeout(typingTimeoutRef.current);
      }

      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("chat_state", handleChatState);
      socket.off("presence", handlePresence);
      socket.off("user_online", handleUserOnline);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("new_message", handleNewMessage);
      socket.off("receive_messages", handleReceiveMessages);
      socket.off("messages_read", handleMessagesRead);
      socket.off("typing", handleTyping);
      socket.off("chat_error", handleChatError);
      socket.disconnect();
    };
  }, [applyBootstrapPayload, enabled, fetchBootstrapWithRetry, refreshMessages, username]);

  async function loadOlder() {
    if (loadingOlder || nextCursor === null) {
      return;
    }

    setLoadingOlder(true);
    try {
      const payload = await api.getChatHistory(nextCursor);
      setMessages((current) => integrateMessages(payload.messages, current));
      setHasMore(payload.hasMore);
      setNextCursor(payload.nextCursor);
    } catch (caughtError) {
      console.error("Failed to load older messages:", caughtError);
      if (caughtError instanceof ApiError) {
        setError(caughtError.message);
      } else {
        setError("Unable to load older messages.");
      }
    } finally {
      setLoadingOlder(false);
    }
  }

  function sendMessage(text: string, replyTo: ChatReplyTarget | null = null) {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return false;
    }

    const socket = getChatSocket();
    if (sendLockRef.current) {
      return false;
    }

    if (!socket.connected) {
      if (!socket.active) {
        socket.connect();
      }
      setError("Realtime connection is offline. Reconnect and try again.");
      return false;
    }

    if (sendUnlockTimerRef.current !== null) {
      window.clearTimeout(sendUnlockTimerRef.current);
    }

    sendLockRef.current = true;
    setIsSending(true);
    socket.emit("send_message", { text: normalizedText, replyTo });

    sendUnlockTimerRef.current = window.setTimeout(() => {
      sendLockRef.current = false;
      setIsSending(false);
    }, 300);

    return true;
  }

  function setTypingActive(active: boolean) {
    const socket = getChatSocket();
    if (!socket.connected) {
      if (!socket.active) {
        socket.connect();
      }
      return;
    }

    socket.emit("typing", { active });
  }

  function markRead(messageId: number) {
    const socket = getChatSocket();
    if (!socket.connected || messageId <= viewerLastReadRef.current) {
      if (!socket.connected && !socket.active) {
        socket.connect();
      }
      return;
    }

    viewerLastReadRef.current = messageId;
    setViewerLastReadId(messageId);
    socket.emit("mark_read", { messageId });
  }

  return {
    loading,
    loadingOlder,
    isSending,
    messages,
    partner,
    partnerDisplayName,
    viewer,
    viewerDisplayName,
    hasMore,
    nextCursor,
    typingUser,
    connectionState,
    onlineUsers,
    viewerLastReadId,
    partnerLastReadId,
    error,
    loadOlder,
    refreshMessages,
    sendMessage,
    setTypingActive,
    markRead,
    clearError: () => setError(null),
  };
}
