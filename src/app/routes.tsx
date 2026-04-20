import { Navigate, createBrowserRouter } from "react-router";

import { ProtectedRoute, PublicOnlyRoute } from "@/app/guards";
import { ChatPage } from "@/pages/ChatPage";
import { InboxPage } from "@/pages/InboxPage";
import { LoginPage } from "@/pages/LoginPage";


export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/",
        Component: LoginPage,
      },
      {
        path: "/login",
        Component: LoginPage,
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/chat",
        Component: ChatPage,
      },
      {
        path: "/inbox",
        Component: InboxPage,
      },
      {
        path: "/welcome",
        element: <Navigate replace to="/chat" />,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate replace to="/" />,
  },
]);
