import { create } from "zustand"

export interface Notification {
  id: string
  paneId: string
  workspaceId: string
  message: string
  timestamp: number
  read: boolean
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  push: (n: Omit<Notification, "id" | "timestamp" | "read">) => void
  markRead: (id: string) => void
  markAllRead: () => void
  clear: (id: string) => void
}

let nextNotifId = 1

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,

  push: (n) =>
    set((s) => ({
      notifications: [
        {
          ...n,
          id: `notif-${nextNotifId++}`,
          timestamp: Date.now(),
          read: false,
        },
        ...s.notifications,
      ],
      unreadCount: s.unreadCount + 1,
    })),

  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    })),

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  clear: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
      unreadCount: Math.max(
        0,
        s.unreadCount -
          (s.notifications.find((n) => n.id === id)?.read ? 0 : 1),
      ),
    })),
}))
