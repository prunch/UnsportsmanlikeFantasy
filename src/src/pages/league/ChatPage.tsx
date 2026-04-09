import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Trash2, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost, apiDelete } from '../../utils/api';
import toast from 'react-hot-toast';
import { League } from '../LeaguePage';

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

export default function ChatPage({ league }: { league: League }) {
  const { token, user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
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
      // silently fail on poll
    } finally {
      setLoading(false);
    }
  }, [league.id, token]);

  useEffect(() => {
    loadMessages();
    // Poll for new messages every 5 seconds (fallback when Supabase Realtime not configured)
    pollIntervalRef.current = setInterval(loadMessages, 5000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || sending || !token) return;

    setSending(true);
    try {
      const msg = await apiPost<ChatMessage>(`/leagues/${league.id}/chat`, { message: newMessage.trim() }, token);
      setMessages(prev => [...prev, msg]);
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
      setMessages(prev => prev.filter(m => m.id !== messageId));
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <MessageCircle size={20} className="text-gridiron-gold" />
        <h2 className="text-white font-bold text-xl">League Chat</h2>
        <span className="text-xs text-slate-500">{messages.length} messages</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <MessageCircle size={40} className="mb-3 opacity-30" />
            <p className="text-sm">No messages yet. Say something!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.user?.id === user?.id;
            return (
              <div key={msg.id} className={`flex items-start gap-3 group ${isOwn ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-brand-800 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                  {getInitial(msg.user?.display_name)}
                </div>

                {/* Bubble */}
                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} max-w-[70%]`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-500">{msg.user?.display_name}</span>
                    <span className="text-xs text-slate-600">{formatTime(msg.created_at)}</span>
                  </div>
                  <div className={`relative px-4 py-2 rounded-2xl text-sm ${
                    isOwn
                      ? 'bg-gridiron-gold/20 text-white rounded-tr-sm'
                      : 'bg-slate-700 text-white rounded-tl-sm'
                  }`}>
                    {msg.message}

                    {/* Commissioner delete button */}
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
      <form onSubmit={sendMessage} className="flex gap-3">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          maxLength={1000}
          className="input flex-1"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={!newMessage.trim() || sending}
          className="btn-primary px-4 py-2 disabled:opacity-50 flex items-center gap-2"
        >
          <Send size={16} />
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>

      {isCommissioner && (
        <p className="text-xs text-slate-600 mt-2 text-center">
          As commissioner, you can delete messages by hovering over them.
        </p>
      )}
    </div>
  );
}
