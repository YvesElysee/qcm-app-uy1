import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import Icon from './ui/icons.jsx';

/**
 * Cloche de notifications de l'espace étudiant.
 *
 * - Le compteur de non-lues est rafraîchi au montage, au retour sur l'onglet
 *   et toutes les 60 secondes (charge très légère).
 * - La liste complète n'est chargée qu'à l'ouverture du panneau.
 * - Chaque étudiant ne voit que ses propres notifications (filtre serveur).
 */
export default function NotificationBell({ compact = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const wrapRef = useRef(null);

  const load = useCallback(async ({ withList = false } = {}) => {
    try {
      const data = await api('/notifications?limit=25', { auth: 'student' });
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(Number(data.unread) || 0);
      setError('');
    } catch (err) {
      if (withList) setError(err.message || 'Notifications indisponibles.');
    } finally {
      if (withList) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const start = async () => {
      await Promise.all([load()]);
    };
    start();
    const iv = setInterval(() => load(), 60000);
    const onVisible = () => {
      if (!document.hidden) load();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const start = async () => {
      await Promise.all([load({ withList: true })]);
    };
    start();
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, load]);

  const openNotification = async (item) => {
    setOpen(false);
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      setUnread((n) => Math.max(0, n - 1));
      api(`/notifications/${item.id}/read`, { method: 'POST', auth: 'student' }).catch(() => {});
    }
    if (item.link) navigate(item.link);
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    api('/notifications/read-all', { method: 'POST', auth: 'student' }).catch(() => {});
  };

  const remove = async (item, event) => {
    event.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    if (!item.isRead) setUnread((n) => Math.max(0, n - 1));
    api(`/notifications/${item.id}`, { method: 'DELETE', auth: 'student' }).catch(() => {});
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const typeIcon = (type) =>
    type === 'quiz_available'
      ? 'calendar'
      : type === 'filiere_available'
        ? 'check-circle'
        : type === 'filiere_rejected' || type === 'quiz_request_rejected'
          ? 'alert'
          : type === 'quiz_request_validated'
            ? 'clock'
            : type === 'quiz_request_approved' || type === 'referral_joined'
              ? 'trophy'
              : 'bell';

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => {
          if (!open) setLoading(true);
          setOpen((o) => !o);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `${unread} notification(s) non lue(s)` : 'Notifications'}
        className={`relative flex items-center justify-center rounded-xl border transition ${
          compact
            ? 'w-10 h-10 bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            : 'w-9 h-9 bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
        }`}
      >
        <Icon name="bell" size={compact ? 18 : 16} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-slate-900">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[min(92vw,22rem)] bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-50"
        >
          <div className="px-4 py-3 bg-slate-900/70 border-b border-slate-700 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-white">Notifications</p>
              <p className="text-[11px] text-slate-400">
                {unread > 0 ? `${unread} non lue(s)` : 'Tout est à jour'}
              </p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-bold text-blue-300 hover:text-blue-200 px-2 py-1 rounded-lg hover:bg-slate-800 transition"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8 animate-pulse">Chargement…</p>
            ) : error ? (
              <p className="text-xs text-red-400 text-center py-8 px-4">{error}</p>
            ) : items.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Icon name="bell" size={24} className="text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Aucune notification pour le moment.</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openNotification(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openNotification(item);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-slate-700/60 last:border-b-0 transition flex items-start gap-3 cursor-pointer ${
                    item.isRead ? 'bg-transparent hover:bg-slate-700/40' : 'bg-blue-950/30 hover:bg-blue-950/50'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    item.isRead
                      ? 'bg-slate-700/60 text-slate-400'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    <Icon name={typeIcon(item.type)} size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-xs truncate ${item.isRead ? 'text-slate-300' : 'text-white font-bold'}`}>
                      {item.title}
                    </span>
                    {item.message && (
                      <span className="block text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                        {item.message}
                      </span>
                    )}
                    <span className="block text-[10px] text-slate-500 mt-1">
                      {formatDate(item.createdAt)}
                    </span>
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => remove(item, e)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') remove(item, e);
                    }}
                    aria-label="Supprimer la notification"
                    className="shrink-0 text-slate-600 hover:text-red-400 transition p-1"
                  >
                    <Icon name="trash" size={13} />
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
