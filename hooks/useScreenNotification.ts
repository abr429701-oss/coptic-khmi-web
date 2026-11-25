import { useState, useCallback } from 'react';

interface Notification {
  id: string;
  message: string;
  duration?: number;
}

export function useScreenNotification() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const generateId = () => `toast_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const showMessage = useCallback((message: string, duration?: number) => {
    const id = generateId();
    setNotifications((prev) => [...prev, { id, message, duration }]);
  }, []);

  const removeMessage = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, showMessage, removeMessage };
}
