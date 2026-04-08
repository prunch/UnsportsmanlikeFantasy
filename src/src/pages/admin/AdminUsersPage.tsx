import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { apiGet, apiPatch, apiDelete } from '../../utils/api';
import toast from 'react-hot-toast';

interface User {
  id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const { token } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await apiGet<{ users: User[]; total: number }>('/admin/users', token || undefined);
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function toggleAdmin(user: User) {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    try {
      await apiPatch(`/admin/users/${user.id}`, { role: newRole }, token || undefined);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u));
      toast.success(`${user.display_name} is now ${newRole}`);
    } catch (err) {
      toast.error('Failed to update user');
    }
  }

  async function deleteUser(user: User) {
    if (!confirm(`Delete user ${user.email}? This cannot be undone.`)) return;
    try {
      await apiDelete(`/admin/users/${user.id}`, token || undefined);
      setUsers(prev => prev.filter(u => u.id !== user.id));
      toast.success('User deleted');
    } catch (err) {
      toast.error('Failed to delete user');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Users <span className="text-slate-500 text-lg">({total})</span></h1>
      </div>

      {loading ? (
        <p className="text-slate-400">Loading...</p>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800 border-b border-slate-700">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">User</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">Role</th>
                <th className="text-left text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">Joined</th>
                <th className="text-right text-xs font-semibold text-slate-400 px-4 py-3 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{user.display_name}</div>
                    <div className="text-sm text-slate-400">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      user.role === 'admin' 
                        ? 'bg-purple-500/10 text-purple-400 border border-purple-500/30' 
                        : 'bg-slate-700 text-slate-400'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => toggleAdmin(user)}
                        className="text-xs btn-secondary py-1 px-2"
                      >
                        {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                      </button>
                      <button
                        onClick={() => deleteUser(user)}
                        className="text-xs btn-danger py-1 px-2"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
