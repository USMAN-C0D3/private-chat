import type {
  BotWordlistResponse,
  ChatBootstrapResponse,
  ChatHistoryResponse,
  InboxResponse,
  LoginCredentials,
  SessionResponse,
} from "@/types/api";


const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
let csrfToken: string | null = null;


function hasMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
  );
}


function hasCsrfToken(value: unknown): value is { csrfToken: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "csrfToken" in value &&
    typeof (value as { csrfToken?: unknown }).csrfToken === "string"
  );
}


async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => "");
}


export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}


async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const hasBody = init.body !== undefined && !(init.body instanceof FormData);
  const method = (init.method ?? "GET").toUpperCase();

  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  headers.set("X-Requested-With", "XMLHttpRequest");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken && !headers.has("X-CSRF-Token")) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const requestUrl = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  const response = await fetch(requestUrl, {
    credentials: "include",
    ...init,
    headers,
  });

  const payload = await parseResponse(response);
  if (hasCsrfToken(payload)) {
    csrfToken = payload.csrfToken;
  }

  if (!response.ok) {
    const message = hasMessage(payload) ? payload.message : response.statusText || "Request failed.";
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}


export const api = {
  getSession: () => request<SessionResponse>("/api/auth/session"),
  login: (credentials: LoginCredentials) =>
    request<SessionResponse>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),
  logout: () =>
    request<void>("/api/auth/logout", {
      method: "POST",
    }),
  getInbox: () => request<InboxResponse>("/api/inbox"),
  getChatBootstrap: (limit = 80) =>
    request<ChatBootstrapResponse>(`/api/chat/bootstrap?limit=${limit}`),
  getChatHistory: (before: number, limit = 80) =>
    request<ChatHistoryResponse>(`/api/chat/history?before=${before}&limit=${limit}`),
  getBotWordlist: () => request<BotWordlistResponse>("/api/bot/wordlist"),
  uploadBotWordlist: (file: File) => {
    const payload = new FormData();
    payload.append("file", file);
    return request<BotWordlistResponse>("/api/bot/wordlist", {
      method: "POST",
      body: payload,
    });
  },
  clearBotWordlist: () =>
    request<void>("/api/bot/wordlist", {
      method: "DELETE",
    }),
};
