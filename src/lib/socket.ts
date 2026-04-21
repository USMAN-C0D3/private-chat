import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";


let chatSocket: Socket | null = null;
const SOCKET_URL = import.meta.env.DEV
  ? "http://127.0.0.1:5000"
  : (import.meta.env.VITE_SOCKET_URL ?? "").trim();


export function getChatSocket(username: string | null = null): Socket {
  void username;

  if (chatSocket?.connected) {
    return chatSocket;
  }

  if (chatSocket === null) {
    chatSocket = io(SOCKET_URL || undefined, {
      path: "/socket.io",
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket"],
      timeout: 15000,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.35,
      reconnectionAttempts: Infinity,
    });

    console.log("SOCKET CREATED");
    chatSocket.on("connect", () => {
      console.log("CONNECTED:", chatSocket?.id);
    });
  }

  return chatSocket;
}


export function closeChatSocket() {
  if (chatSocket === null) {
    return;
  }

  chatSocket.disconnect();
  chatSocket = null;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (chatSocket) {
      chatSocket.disconnect();
      chatSocket = null;
    }
  });
}
