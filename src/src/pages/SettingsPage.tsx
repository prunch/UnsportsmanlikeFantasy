import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Save, Trash2, Eye, EyeOff, Lock, Bell, UserX, ArrowLeft, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { apiFetch, apiGet, apiPatch, apiPost, apiDelete, apiUpload } from '../utils/api';
import toast from 'react-hot-toast';

interface FullProfile {
  id: string;
  email: string;
  displayName: string;
  teamName: string | null;
  avatarUrl: string | null;
  username: string | null;
  bio: string;
  role: string;
  createdAt: string;
  notifyMatchupResults: boolean;
  notifyTradeOffers: boolean;
  notifyLeagueChat: boolean;
  notifyCardEvents: boolean;
  isProfilePublic: boolean;
}

export default function SettingsPage() {
  const { token, user, updateUser, logout } = useAuthStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'profile' | 'notifications' | 'security' | 'danger'>('profile');

  // Profile form
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [teamName, setTeamName] = useState('');
  const [isProfilePublic, setIsProfilePublic] = useState(true);

  // Notifications
  const [notifyMatchup, setNotifyMatchup] = useState(true);
  const [notifyTrade, setNotifyTrade] = useState(true);
  const [notifyChat, setNotifyChat] = useState(true);
  const [notifyCards, setNotifyCards] = useState(true);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  // Delete account
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    if (!token) return;
    try {
      const data = await apiGet<FullProfile>('/users/me', token);
      setProfile(data);
      setDisplayName(data.displayName || '');
      setUsername(data.username || '');
      setBio(data.bio || '');
      setTeamName(data.teamName || '');
      setIsProfilePublic(data.isProfilePublic);
      setNotifyMatchup(data.notifyMatchupResults);
      setNotifyTrade(data.notifyTradeOffers);
      setNotifyChat(data.notifyLeagueChat);
      setNotifyCards(data.notifyCardEvents);
    } catch {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProfile() {
    if (!token) return;
    setSaving(true);
    try {
      const data = await apiPatch<FullProfile>('/users/me', {
        displayName: displayName.trim(),
        username: username.trim() || null,
        bio: bio.trim(),
        teamName: teamName.trim() || null,
        isProfilePublic
      }, token);
      setProfile(data);
      updateUser({
        displayName: data.displayName,
        avatarUrl: data.avatarUrl,
        username: data.username,
        bio: data.bio
      });
      toast.success('Profile saved');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotifications() {
    if (!token) return;
    setSaving(true);
    try {
      await apiPatch('/users/me', {
        notifyMatchupResults: notifyMatchup,
        notifyTradeOffers: notifyTrade,
        notifyLeagueChat: notifyChat,
        notifyCardEvents: notifyCards
      }, token);
      toast.success('Notification preferences saved');
    } catch {
      toast.error('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !token) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be under 2MB');
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const result = await apiUpload<{ avatarUrl: string }>('/users/me/avatar', formData, token);
      setProfile(p => p ? { ...p, avatarUrl: result.avatarUrl } : p);
      updateUser({ avatarUrl: result.avatarUrl });
      toast.success('Avatar uploaded');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveAvatar() {
    if (!token) return;
    setAvatarUploading(true);
    try {
      await apiDelete('/users/me/avatar', token);
      setProfile(p => p ? { ...p, avatarUrl: null } : p);
      updateUser({ avatarUrl: null });
      toast.success('Avatar removed');
    } catch {
      toast.error('Failed to remove avatar');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!token) return;
    setSaving(true);
    try {
      await apiPost('/users/me/change-password', { currentPassword, newPassword }, token);
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAccount() {
    if (!token) return;
    setSaving(true);
    try {
      await apiFetch('/users/me', { method: 'DELETE', body: JSON.stringify({ password: deletePassword }), token });
      toast.success('Account deleted');
      logout();
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-gridiron-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const initials = (profile?.displayName || 'U').charAt(0).toUpperCase();

  const sections = [
    { key: 'profile' as const, label: 'Profile', icon: <Camera size={16} /> },
    { key: 'notifications' as const, label: 'Notifications', icon: <Bell size={16} /> },
    { key: 'security' as const, label: 'Security', icon: <Lock size={16} /> },
    { key: 'danger' as const, label: 'Danger Zone', icon: <UserX size={16} /> }
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <h1 className="text-2xl font-bold text-white">Account Settings</h1>
      </div>

      {/* Section Nav */}
      <div className="flex gap-1 border-b border-slate-700">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeSection === s.key
                ? 'border-gridiron-gold text-gridiron-gold'
                : 'border-transparent text-slate-400 hover:text-white'
            } ${s.key === 'danger' ? 'ml-auto text-red-400' : ''}`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {/* ── PROFILE SECTION ── */}
      {activeSection === 'profile' && (
        <div className="card space-y-6">
          {/* Avatar */}
          <div className="flex items-center gap-6">
            <div className="relative group">
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover border-2 border-slate-600"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-brand-800 flex items-center justify-center text-2xl font-bold text-white border-2 border-slate-600">
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {avatarUploading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={20} className="text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </div>
            <div>
              <p className="text-white font-medium">Profile Picture</p>
              <p className="text-slate-400 text-sm">JPEG, PNG, WebP, or GIF. Max 2MB.</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-gridiron-gold hover:underline"
                  disabled={avatarUploading}
                >
                  Upload new
                </button>
                {profile?.avatarUrl && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="text-xs text-red-400 hover:underline"
                    disabled={avatarUploading}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Fields */}
          <div className="grid gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Display Name *</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={50}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Username
                <span className="text-slate-500 ml-1">(public URL handle)</span>
              </label>
              <div className="flex items-center">
                <span className="text-slate-500 text-sm mr-1">@</span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  maxLength={24}
                  placeholder="your_username"
                  className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none"
                />
              </div>
              <p className="text-slate-500 text-xs mt-1">3-24 characters: letters, numbers, underscores</p>
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Default Team Name</label>
              <input
                type="text"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                maxLength={50}
                placeholder="My Fantasy Team"
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Bio
                <span className="text-slate-500 ml-1">({bio.length}/500)</span>
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Tell other players about yourself..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="text"
                value={profile?.email || ''}
                disabled
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed"
              />
              <p className="text-slate-500 text-xs mt-1">Email cannot be changed</p>
            </div>

            {/* Profile visibility */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                {isProfilePublic ? <Eye size={16} className="text-green-400" /> : <EyeOff size={16} className="text-slate-400" />}
                <div>
                  <p className="text-white text-sm font-medium">Public Profile</p>
                  <p className="text-slate-500 text-xs">Other users can view your profile, stats, and leagues</p>
                </div>
              </div>
              <button
                onClick={() => setIsProfilePublic(!isProfilePublic)}
                className={`relative w-11 h-6 rounded-full transition-colors ${isProfilePublic ? 'bg-green-500' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isProfilePublic ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-700">
            {profile && (
              <button
                onClick={() => navigate(`/profile/${profile.id}`)}
                className="text-sm text-slate-400 hover:text-gridiron-gold transition-colors"
              >
                View public profile →
              </button>
            )}
            <button
              onClick={handleSaveProfile}
              disabled={saving || !displayName.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-gridiron-gold text-black font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS SECTION ── */}
      {activeSection === 'notifications' && (
        <div className="card space-y-4">
          <h2 className="text-white font-bold text-lg mb-2">Notification Preferences</h2>
          {[
            { label: 'Matchup Results', desc: 'Get notified when your matchups are finalized', val: notifyMatchup, set: setNotifyMatchup },
            { label: 'Trade Offers', desc: 'Incoming and counter-trade notifications', val: notifyTrade, set: setNotifyTrade },
            { label: 'League Chat', desc: 'New messages in your league chat rooms', val: notifyChat, set: setNotifyChat },
            { label: 'Card Events', desc: 'New cards available, card plays against you', val: notifyCards, set: setNotifyCards }
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-3 border-b border-slate-700 last:border-0">
              <div>
                <p className="text-white text-sm font-medium">{item.label}</p>
                <p className="text-slate-500 text-xs">{item.desc}</p>
              </div>
              <button
                onClick={() => item.set(!item.val)}
                className={`relative w-11 h-6 rounded-full transition-colors ${item.val ? 'bg-green-500' : 'bg-slate-600'}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${item.val ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <button
              onClick={handleSaveNotifications}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-gridiron-gold text-black font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Preferences'}
            </button>
          </div>
        </div>
      )}

      {/* ── SECURITY SECTION ── */}
      {activeSection === 'security' && (
        <div className="card space-y-4">
          <h2 className="text-white font-bold text-lg mb-2">Change Password</h2>
          <div className="grid gap-4 max-w-md">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showPasswords ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPasswords(!showPasswords)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Confirm New Password</label>
              <input
                type={showPasswords ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:border-gridiron-gold focus:outline-none"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-red-400 text-xs mt-1">Passwords do not match</p>
              )}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleChangePassword}
              disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
              className="flex items-center gap-2 px-5 py-2 bg-gridiron-gold text-black font-semibold rounded-lg hover:bg-yellow-400 disabled:opacity-50 transition-colors"
            >
              <Lock size={16} />
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      )}

      {/* ── DANGER ZONE ── */}
      {activeSection === 'danger' && (
        <div className="card border-red-500/30 space-y-4">
          <h2 className="text-red-400 font-bold text-lg">Danger Zone</h2>
          <p className="text-slate-400 text-sm">
            Deleting your account is permanent. All your teams, rosters, and history will be removed.
            This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
            >
              <UserX size={16} />
              Delete My Account
            </button>
          ) : (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-red-400 font-medium text-sm">Confirm account deletion</p>
                <button onClick={() => setShowDeleteConfirm(false)} className="text-slate-400 hover:text-white">
                  <X size={16} />
                </button>
              </div>
              <p className="text-slate-400 text-xs">Enter your password to confirm:</p>
              <input
                type="password"
                value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className="w-full bg-slate-700 border border-red-500/30 rounded-lg px-3 py-2 text-white text-sm focus:border-red-500 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteAccount}
                  disabled={saving || !deletePassword}
                  className="px-4 py-2 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors text-sm"
                >
                  {saving ? 'Deleting...' : 'Permanently Delete Account'}
                </button>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                  className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
