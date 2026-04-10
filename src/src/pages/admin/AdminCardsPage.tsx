import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPost, apiPut, apiDelete } from '../../utils/api';
import toast from 'react-hot-toast';
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, Eye } from 'lucide-react';

interface Card {
  id?: string;
  title: string;
  description: string;
  target_type: 'player' | 'position' | 'all';
  target_position?: string;
  effect_type: 'buff' | 'debuff';
  modifier_type: 'absolute' | 'percentage';
  modifier_value: number;
  rarity: 'common' | 'uncommon' | 'rare';
  is_active: boolean;
}

const BLANK_CARD: Card = {
  title: '',
  description: '',
  target_type: 'position',
  target_position: 'WR',
  effect_type: 'buff',
  modifier_type: 'percentage',
  modifier_value: 10,
  rarity: 'common',
  is_active: true
};

export default function AdminCardsPage() {
  const { token } = useAuthStore();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Card | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await apiGet<Card[]>('/admin/cards', token || undefined);
      setCards(data);
    } catch (err) {
      // Surface the backend's real message (now includes Postgres code/hint
      // when the failure is DB-level, e.g. "permission denied for table cards")
      toast.error(err instanceof Error ? `Failed to load cards — ${err.message}` : 'Failed to load cards');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(card: Card) {
    try {
      if (card.id) {
        const updated = await apiPut<Card>(`/admin/cards/${card.id}`, card, token || undefined);
        setCards(prev => prev.map(c => c.id === card.id ? updated : c));
        toast.success('Card updated');
      } else {
        const created = await apiPost<Card>('/admin/cards', card, token || undefined);
        setCards(prev => [created, ...prev]);
        toast.success('Card created');
      }
      setShowForm(false);
      setEditing(null);
    } catch (err) {
      if (err instanceof Error) {
        // Try to extract Zod validation detail from error message
        try {
          // apiFetch throws new Error(error.error) — but details are lost.
          // We'll show the raw message; field-level errors come from the form itself.
          toast.error(err.message);
        } catch {
          toast.error('Failed to save card');
        }
      } else {
        toast.error('Failed to save card');
      }
    }
  }

  async function handleDelete(card: Card) {
    if (!confirm(`Delete card "${card.title}"?`)) return;
    try {
      await apiDelete(`/admin/cards/${card.id}`, token || undefined);
      setCards(prev => prev.filter(c => c.id !== card.id));
      toast.success('Card deleted');
    } catch {
      toast.error('Failed to delete card');
    }
  }

  const rarityStyles: Record<string, { border: string; label: string; badge: string }> = {
    common:   { border: 'border-slate-600',    label: 'text-slate-400',  badge: 'bg-slate-700 text-slate-300' },
    uncommon: { border: 'border-green-500/50', label: 'text-green-400',  badge: 'bg-green-500/10 text-green-400' },
    rare:     { border: 'border-blue-500/50',  label: 'text-blue-400',   badge: 'bg-blue-500/10 text-blue-400' }
  };

  const [preview, setPreview] = useState<Card | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Card Manager <span className="text-slate-500 text-lg">({cards.length})</span></h1>
        <button
          onClick={() => { setEditing({ ...BLANK_CARD }); setShowForm(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={18} /> New Card
        </button>
      </div>

      {/* Card Form Modal */}
      {showForm && editing && (
        <CardForm
          card={editing}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {/* Card Preview Modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
          <div className="bg-slate-900 border-2 border-slate-700 rounded-xl p-1 max-w-xs w-full" onClick={e => e.stopPropagation()}>
            <div className={`rounded-xl border-2 ${rarityStyles[preview.rarity]?.border || 'border-slate-600'} bg-slate-800 p-5`}>
              <div className="flex items-start justify-between mb-3">
                <span className={`text-xs font-bold uppercase tracking-wider ${rarityStyles[preview.rarity]?.label}`}>{preview.rarity}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${preview.effect_type === 'buff' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                  {preview.effect_type === 'buff' ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {preview.effect_type}
                </span>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{preview.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{preview.description}</p>
              <div className="pt-3 border-t border-slate-700 flex items-center justify-between">
                <span className={`font-bold ${preview.effect_type === 'buff' ? 'text-green-400' : 'text-red-400'}`}>
                  {preview.effect_type === 'buff' ? '+' : '-'}{preview.modifier_value}{preview.modifier_type === 'percentage' ? '%' : ' pts'}
                </span>
                <span className="text-slate-500 text-sm">{preview.target_position || preview.target_type}</span>
              </div>
            </div>
            <div className="text-center mt-3">
              <button onClick={() => setPreview(null)} className="text-slate-400 text-sm hover:text-white">Close Preview</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 bg-slate-800 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(card => {
            const rs = rarityStyles[card.rarity] || rarityStyles.common;
            return (
              <div key={card.id} className={`card border-2 ${rs.border} ${!card.is_active ? 'opacity-50' : ''} flex flex-col`}>
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-xs font-bold uppercase tracking-wider ${rs.label}`}>{card.rarity}</span>
                  <div className="flex items-center gap-1.5">
                    {!card.is_active && <span className="text-xs text-red-400">Inactive</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      card.effect_type === 'buff' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                    }`}>
                      {card.effect_type === 'buff' ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}
                      {card.effect_type}
                    </span>
                  </div>
                </div>
                <h3 className="text-white font-bold mb-1">{card.title}</h3>
                <p className="text-slate-400 text-xs mb-3 flex-1">{card.description}</p>
                <div className="text-xs text-slate-500 mb-3">
                  <span className={card.effect_type === 'buff' ? 'text-green-400' : 'text-red-400'}>
                    {card.effect_type === 'buff' ? '+' : '-'}{card.modifier_value}{card.modifier_type === 'percentage' ? '%' : ' pts'}
                  </span>
                  {' · '}
                  {card.target_position || card.target_type}
                </div>
                <div className="flex gap-2 pt-3 border-t border-slate-700">
                  <button
                    onClick={() => setPreview(card)}
                    className="flex items-center gap-1 text-xs btn-secondary py-1 px-2"
                  >
                    <Eye size={12} /> Preview
                  </button>
                  <button
                    onClick={() => { setEditing({ ...card }); setShowForm(true); }}
                    className="flex items-center gap-1 text-xs btn-secondary py-1 px-2"
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(card)}
                    className="flex items-center gap-1 text-xs btn-danger py-1 px-2 ml-auto"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            );
          })}
          {cards.length === 0 && (
            <div className="col-span-3 text-center py-12 text-slate-500">
              No cards yet. Create your first card!
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CardForm({ card, onSave, onCancel }: { card: Card; onSave: (c: Card) => void; onCancel: () => void }) {
  const [form, setForm] = useState<Card>({ ...card });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : name === 'modifier_value' ? parseFloat(value) : value
    }));
    // Clear field error on change
    if (errors[name]) setErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (!form.title || form.title.trim().length < 2) newErrors.title = 'Title must be at least 2 characters';
    if (!form.description || form.description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSave() {
    if (validate()) onSave(form);
  }

  const descLen = form.description?.length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg my-auto">
        <h2 className="text-white font-bold text-xl mb-5">{form.id ? 'Edit Card' : 'New Card'}</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Title</label>
            <input name="title" className={`input ${errors.title ? 'border-red-500' : ''}`} value={form.title} onChange={handleChange} placeholder="Party Boat" />
            {errors.title && <p className="text-red-400 text-xs mt-1">{errors.title}</p>}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Description</label>
              <span className={`text-xs ${descLen < 10 ? 'text-amber-400' : 'text-slate-500'}`}>
                {descLen}/500 {descLen < 10 && `— min 10 characters`}
              </span>
            </div>
            <textarea
              name="description"
              className={`input h-20 resize-none ${errors.description ? 'border-red-500' : ''}`}
              value={form.description}
              onChange={handleChange}
              placeholder="All WRs lose 15% after a fun day on the boat"
            />
            {errors.description && <p className="text-red-400 text-xs mt-1">{errors.description}</p>}
          </div>
          <div>
            <label className="label">Who does this card affect?</label>
            <select name="target_type" className="input" value={form.target_type} onChange={handleChange}>
              <option value="position">All players at a position (e.g. all WRs)</option>
              <option value="player">A single player</option>
              <option value="all">Everyone on a team</option>
            </select>
            <p className="text-slate-500 text-xs mt-1">
              {form.target_type === 'position' &&
                'Buff/debuff applies to every player at the chosen position.'}
              {form.target_type === 'player' &&
                'The user picks one specific player when they play this card. You can optionally restrict which position that player must be.'}
              {form.target_type === 'all' &&
                'Applies to every player on the targeted team regardless of position.'}
            </p>
          </div>
          {(form.target_type === 'position' || form.target_type === 'player') && (
            <div>
              <label className="label">
                {form.target_type === 'position' ? 'Position' : 'Restrict to position (optional)'}
              </label>
              <select
                name="target_position"
                className="input"
                value={form.target_position || ''}
                onChange={handleChange}
              >
                {form.target_type === 'player' && (
                  <option value="">Any position</option>
                )}
                <option value="QB">QB</option>
                <option value="RB">RB</option>
                <option value="WR">WR</option>
                <option value="TE">TE</option>
                <option value="K">K</option>
                <option value="DEF">DEF</option>
                {form.target_type === 'position' && <option value="All">All positions</option>}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Effect Type</label>
              <select name="effect_type" className="input" value={form.effect_type} onChange={handleChange}>
                <option value="buff">Buff</option>
                <option value="debuff">Debuff</option>
              </select>
            </div>
            <div>
              <label className="label">Modifier Type</label>
              <select name="modifier_type" className="input" value={form.modifier_type} onChange={handleChange}>
                <option value="percentage">Percentage (%)</option>
                <option value="absolute">Absolute (pts)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Modifier Value</label>
            <input type="number" name="modifier_value" className="input" value={form.modifier_value} onChange={handleChange} step="0.5" />
          </div>
          <div>
            <label className="label">Rarity</label>
            <select name="rarity" className="input" value={form.rarity} onChange={handleChange}>
              <option value="common">Common</option>
              <option value="uncommon">Uncommon</option>
              <option value="rare">Rare</option>
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="is_active" checked={form.is_active} onChange={handleChange} className="rounded" />
            <span className="text-slate-300 text-sm">Active (available in card pool)</span>
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={handleSave} className="btn-primary flex-1">Save Card</button>
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </div>
  );
}
