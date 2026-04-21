export type Username = string;

export interface ChatReplyTarget {
  id: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  sequence: number;
  sender: string;
  text: string;
  timestamp: number;
  clientId?: string | null;
  pending?: boolean;
  replyTo?: ChatReplyTarget | null;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface SessionResponse {
  authenticated: boolean;
  csrfToken?: string;
  user?: Username;
  userDisplayName?: string | null;
  partner?: Username | null;
  partnerDisplayName?: string | null;
  message?: string;
  retryAfterSeconds?: number;
}

export interface InboxThread {
  id: string;
  title: string;
  username: string | null;
  lastMessage: ChatMessage | null;
}

export interface InboxResponse {
  thread: InboxThread | null;
}

export interface ChatBootstrapResponse {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: number | null;
  viewer: Username;
  viewerDisplayName: string | null;
  partner: Username | null;
  partnerDisplayName: string | null;
  viewerLastReadId: number | null;
  partnerLastReadId: number | null;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
  nextCursor: number | null;
}

export interface BotWordlistResponse {
  hasWordlist: boolean;
  filename: string | null;
  lineCount: number;
  updatedAt: string | null;
}

export interface ReceiveMessagePayload {
  message: ChatMessage;
}

export interface ReceiveMessagesBatchPayload {
  messages: ChatMessage[];
}

export interface TypingPayload {
  sender: string;
  active: boolean;
}

export interface ChatStatePayload {
  user: Username;
  onlineUsers: Username[];
  viewerLastReadId: number | null;
  partnerLastReadId: number | null;
}

export interface PresencePayload {
  onlineUsers: Username[];
}

export interface ChatErrorPayload {
  message: string;
}

export interface MessagesReadPayload {
  reader: Username;
  messageId: number;
}
