import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { api } from './api/client';
import Auth from './pages/Auth';
import Home from './pages/Home';
import Keypad from './pages/Keypad';
import Messages from './pages/Messages';
import Contacts from './pages/Contacts';
import Calls from './pages/Calls';
import Settings from './pages/Settings';

export type Me = { id: string; username: string; email: string; displayName?: string; number?: string };
export type AppContext = { me: Me; socket: Socket | null; reload: () => Promise<void> };

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  async function reload() {
    try {
      const data = await api<{ user: Me; socketToken: string }>('/auth/me');
      setMe(data.user);
      const nextSocket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', { auth: { token: data.socketToken } });
      setSocket(previous => { previous?.disconnect(); return nextSocket; });
    } catch { setMe(null); } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); return () => { socket?.disconnect(); }; }, []);
  if (loading) return <main className="center">Loading OverPhone…</main>;
  if (!me) return <Auth onLogin={reload} />;
  const context = { me, socket, reload };
  return <div className="shell"><header><span className="brand">OverPhone</span><span className="online">Internet calling</span></header><main><Routes><Route path="/" element={<Home {...context} />} /><Route path="/keypad" element={<Keypad {...context} />} /><Route path="/messages" element={<Messages {...context} />} /><Route path="/contacts" element={<Contacts />} /><Route path="/calls" element={<Calls {...context} />} /><Route path="/settings" element={<Settings {...context} />} /><Route path="*" element={<Navigate to="/" />} /></Routes></main><nav>{[['/calls', 'Calls'], ['/messages', 'Messages'], ['/contacts', 'Contacts'], ['/keypad', 'Keypad'], ['/settings', 'Settings']].map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}</nav></div>;
}
