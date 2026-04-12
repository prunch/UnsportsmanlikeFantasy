import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Trash2, MessageCircle, X, Minus } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost, apiDelete } from '../../utils/api';
import toast from 'react-hot-toast';
import { League } from '../../pages/LeaguePage';

interface ChatMessage {
  id: string;
  message: string;
  created_at: string;
  user: {
    id: string;
    display_name: string;
    avatar_url?: string;
  };
}

/**
 * Floating collapsible chat widget, anchored bottom-right on every league
 * sub-route. Replaces the standalone ChatPage nav tab. Collapsed state shows
 * a small pill with an unread count; expanded state shows the full message
 * stream + input.
 */
export default function LeagueChatWidget({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isCommissioner = league.commissioner_id === user?.id;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<ChatMessage[]>(`/leagues/${league.id}/chat`, token);
      setMessages(data);
    } catch {
      // silent on poll
    }
  }, [league.id, token]);

  useEffect(() => {
    loadMessages();
    pollIntervalRef.current = setInterval(loadMessages, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [loadMessages]);

  // Track unread messages while the widget is collapsed. The "last seen" id
  // is the id of the newest message at the moment the user opened the panel.
  useEffect(() => {
    if (open) {
      // When opened, mark everything current as seen and zero out unread
      const newestId = messages[messages.length - 1]?.id || null;
      setLastSeenId(newestId);
      setUnread(0);
      return;
    }
    // When closed, count messages newer than lastSeenId that aren't from us
    if (!lastSeenId) {
      // First load before the user has ever opened the widget — don't count
      // historical messages as unread
      if (messages.length > 0) {
        setLastSeenId(messages[messages.length - 1].id);
      }
      return;
    }
    const lastSeenIdx = messages.findIndex((m) => m.id === lastSeenId);
    if (lastSeenIdx === -1) {
      setUnread(0);
      return;
    }
    const newer = messages.slice(lastSeenIdx + 1).filter((m) => m.user?.id !== user?.id);
    setUnread(newer.length);
  }, [messages, open, lastSeenId, user?.id]);

  // Auto-scroll when the panel is open and new messages arrive
  useEffect(() => {
    if (open) scrollToBottom();
  }, [messages, open, scrollToBottom]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending || !token) return;
    setSending(true);
    try {
      const msg = await apiPost<ChatMessage>(
        `/leagues/${league.id}/chat`,
        { message: newMessage.trim() },
        token
      );
      setMessages((prev) => [...prev, msg]);
      setNewMessage('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!token) return;
    try {
      await apiDelete(`/leagues/${league.id}/chat/${messageId}`, token);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      toast.success('Message deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete message');
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

  function getInitial(name: string): string {
    return name?.charAt(0).toUpperCase() || '?';
  }

  // ---------- COLLAPSED BUBBLE ----------
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 px-4 py-3 rounded-full
                   bg-gridiron-gold text-brand-950 font-semibold shadow-lg shadow-gridiron-gold/20
                   hover:bg-gridiron-gold/90 hover:scale-105 transition-all"
        aria-label="Open league chat"
      >
        <MessageCircle size={18} />
        <span className="text-sm">League Chat</span>
        {unread > 0 && (
          <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
    );
  }

  // ---------- EXPANDED PANEL ----------
  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[360px] max-w-[calc(100vw-32px)]
                 h-[520px] max-h-[calc(100vh-80px)] flex flex-col
                 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50
                 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-2 min-w-0">
          <MessageCircle size={16} className="text-gridiron-gold shrink-0" />
          <h3 className="text-white font-bold text-sm truncate">League Chat</h3>
          <span className="text-xs text-slate-500 shrink-0">
            {messages.length} {messages.length === 1 ? 'msg' : 'msgs'}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label="Minimize"
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            aria-label="Close"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-500">
            <MessageCircle size={32} className="mb-2 opacity-30" />
            <p className="text-xs">No messages yet. Say something!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.user?.id === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-2 group ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                <div className="w-7 h-7 rounded-full bg-brand-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {getInitial(msg.user?.display_name)}
                </div>
                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[75%]`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] text-slate-500">{msg.user?.display_name}</span>
                    <span className="text-[10px] text-slate-600">{formatTime(msg.created_at)}</span>
                  </div>
                  <div
                    className={`relative px-3 py-1.5 rounded-2xl text-sm leading-snug break-words ${
                      isOwn
                        ? 'bg-gridiron-gold/20 text-white rounded-tr-sm'
                        : 'bg-slate-700 text-white rounded-tl-sm'
                    }`}
                  >
                    {msg.message}
                    {isCommissioner && !isOwn && (
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-full items-center justify-center hidden group-hover:flex transition-all"
                        title="Delete message (commissioner)"
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="flex gap-2 px-3 py-3 border-t border-slate-700 bg-slate-800/30"
      >
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          maxLength={1000}
          className="input flex-1 text-sm py-2"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="btn-primary px-3 py-2 disabled:opacity-50 flex items-center justify-center shrink-0"
          aria-label="Send"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
