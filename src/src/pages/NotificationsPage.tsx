import { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { apiGet, apiPost, apiDelete } from '../utils/api';
import toast from 'react-hot-toast';

interface Notification {
  id: string;
  type: string;
  title: string;
  body?: string;
  is_read: boolean;
  league_id?: string;
  created_at: string;
}

const TYPE_ICONS: Record<string, string> = {
  trade_offer: '🤝',
  waiver_result: '📋',
  card_played: '🃏',
  lineup_reminder: '⏰',
  draft_starting: '🎯',
  general: '📣'
};

export default function NotificationsPage() {
  const { token } = useAuthStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<Notification[]>(
        `/notifications${showUnreadOnly ? '?unread=true' : ''}`,
        token
      );
      setNotifications(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [token, showUnreadOnly]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  async function markRead(id: string) {
    if (!token) return;
    try {
      await apiPost(`/notifications/${id}/read`, {}, token);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch {
      // silent
    }
  }

  async function markAllRead() {
    if (!token) return;
    try {
      await apiPost('/notifications/read-all', {}, token);
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all read');
    }
  }

  async function dismiss(id: string) {
    if (!token) return;
    try {
      await apiDelete(`/notifications/${id}`, token);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch {
      // silent
    }
  }

  async function clearAll() {
    if (!token) return;
    if (!window.confirm('Clear all notifications?')) return;
    try {
      await apiDelete('/notifications', token);
      setNotifications([]);
      toast.success('All notifications cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to clear notifications');
    }
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bell size={22} className="text-gridiron-gold" />
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          {unreadCount > 0 && (
            <span className="w-6 h-6 bg-gridiron-gold rounded-full text-black text-xs font-bold flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUnreadOnly(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              showUnreadOnly
                ? 'bg-gridiron-gold/20 text-gridiron-gold border-gridiron-gold/40'
                : 'bg-slate-700 text-slate-400 border-slate-600 hover:text-white'
            }`}
          >
            Unread only
          </button>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs px-3 py-1.5 rounded-full bg-slate-700 text-slate-400 border border-slate-600 hover:text-white transition-colors flex items-center gap-1"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      {notifications.length === 0 ? (
        <div className="card text-center py-16">
          <Bell size={48} className="mx-auto mb-4 text-slate-600 opacity-50" />
          <p className="text-slate-400 font-medium">
            {showUnreadOnly ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            We'll notify you about trades, waivers, and more.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(notification => (
            <div
              key={notification.id}
              className={`card flex items-start gap-4 cursor-pointer transition-all hover:border-slate-600 ${
                !notification.is_read ? 'border-gridiron-gold/30 bg-gridiron-gold/5' : ''
              }`}
              onClick={() => !notification.is_read && markRead(notification.id)}
            >
              {/* Icon */}
              <div className="text-2xl flex-shrink-0 mt-0.5">
                {TYPE_ICONS[notification.type] || '📣'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-white text-sm leading-tight">
                    {notification.title}
                    {!notification.is_read && (
                      <span className="ml-2 w-2 h-2 bg-gridiron-gold rounded-full inline-block" />
                    )}
                  </div>
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    {formatTime(notification.created_at)}
                  </span>
                </div>
                {notification.body && (
                  <p className="text-slate-400 text-sm mt-0.5">{notification.body}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {!notification.is_read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead(notification.id); }}
                    className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
                    title="Mark as read"
                  >
                    <Check size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(notification.id); }}
                  className="p-1.5 rounded-lg bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-white transition-colors"
                  title="Dismiss"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
