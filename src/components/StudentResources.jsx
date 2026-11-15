import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

const MAX_FILE_MB = 25;

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function fileLabel(name = '') {
  const ext = String(name).split('.').pop()?.toLowerCase() || '';
  return ext ? ext.toUpperCase() : 'FICHIER';
}

/**
 * Espace de partage de ressources de cours.
 *
 * Les étudiants ne voient que les documents de leur faculté, filière et
 * niveau (filtre appliqué côté serveur). Ils peuvent déposer un fichier et
 * supprimer uniquement leurs propres dépôts. L'administration modère tout
 * depuis son panneau.
 */
export default function StudentResources() {
  usePageTitle('Ressources de cours');

  const [user] = useState(() => getSession());
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ue, setUe] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const canDelete = useCallback(
    (item) => !!user && String(item.uploaderId || '') === String(user.uid || ''),
    [user]
  );

  const load = useCallback(async () => {
    try {
      const data = await api('/resources', { auth: 'student' });
      setResources(Array.isArray(data.resources) ? data.resources : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Impossible de charger les ressources.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const start = async () => {
      await Promise.all([load()]);
    };
    start();
  }, [load]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setUe('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError('');
    setNotice('');

    if (!file) {
      setUploadError('Veuillez sélectionner un fichier à partager.');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(`Le fichier dépasse la limite de ${MAX_FILE_MB} Mo.`);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('title', title.trim() || file.name);
      body.append('description', description.trim());
      body.append('ue', ue.trim());
      body.append('file', file);

      const token = getSession()?.token;
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Le dépôt a échoué.');
      }

      setResources((prev) => [data.resource, ...prev]);
      resetForm();
      setNotice('Votre ressource a bien été publiée pour votre promotion.');
    } catch (err) {
      setUploadError(err.message || 'Le dépôt a échoué.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (item) => {
    setError('');
    try {
      const token = getSession()?.token;
      const res = await fetch(`/api/resources/${item.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Téléchargement impossible.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.originalName || 'ressource';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err.message || 'Téléchargement impossible.');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Supprimer « ${item.title} » ?`)) return;
    setError('');
    try {
      await api(`/resources/${item.id}`, { method: 'DELETE', auth: 'student' });
      setResources((prev) => prev.filter((r) => r.id !== item.id));
      setNotice('Ressource supprimée.');
    } catch (err) {
      setError(err.message || 'Suppression impossible.');
    }
  };

  const totalDownloads = useMemo(
    () => resources.reduce((sum, r) => sum + (Number(r.downloads) || 0), 0),
    [resources]
  );

  return (
    <div className="flex-1 bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-bold transition mb-2"
            >
              <Icon name="arrow-left" size={14} />
              Retour à mon espace
            </Link>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Icon name="book" size={22} className="text-blue-400" />
              Ressources de cours
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Documents partagés par vos camarades et l'administration.
              {user?.filiere && (
                <span className="ml-1 text-slate-300 font-bold">
                  {user.filiere} · {user.niveau}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2 text-[11px] font-bold">
            <span className="bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full">
              {resources.length} document(s)
            </span>
            <span className="bg-slate-900 border border-slate-800 text-slate-300 px-3 py-1.5 rounded-full">
              {totalDownloads} téléchargement(s)
            </span>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3 flex items-start gap-2">
            <Icon name="alert" size={15} className="mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs rounded-xl p-3 flex items-start gap-2">
            <Icon name="check-circle" size={15} className="mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        {/* Dépôt */}
        <form
          onSubmit={handleUpload}
          className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center">
              <Icon name="upload" size={17} />
            </span>
            <div>
              <h2 className="text-sm font-black text-white">Partager une ressource</h2>
              <p className="text-[11px] text-slate-400">
                PDF, Word, PowerPoint, Excel, texte, image ou ZIP · {MAX_FILE_MB} Mo max.
              </p>
            </div>
          </div>

          {uploadError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3">
              {uploadError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Titre
              </label>
              <input
                type="text"
                placeholder="Ex: TD 3 corrigé"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-blue-600 outline-none transition text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                UE concernée (optionnel)
              </label>
              <input
                type="text"
                placeholder="Ex: INF232"
                value={ue}
                onChange={(e) => setUe(e.target.value.toUpperCase())}
                className="w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-blue-600 outline-none transition text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Description (optionnel)
            </label>
            <textarea
              rows={2}
              placeholder="Précisez le contenu, le chapitre ou l'auteur…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-blue-600 outline-none transition text-xs resize-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="flex-1 text-xs text-slate-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs file:font-bold hover:file:bg-slate-700 file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md shadow-blue-600/20 disabled:opacity-60"
            >
              <Icon name="upload" size={14} />
              {uploading ? 'Publication…' : 'Publier'}
            </button>
          </div>
        </form>

        {/* Liste */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-5">
          <h2 className="text-sm font-black text-white mb-3 flex items-center gap-2">
            <Icon name="document" size={16} className="text-blue-400" />
            Documents disponibles
          </h2>

          {loading ? (
            <p className="text-xs text-slate-500 text-center py-10 animate-pulse">Chargement…</p>
          ) : resources.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
              <Icon name="document" size={26} className="text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                Aucune ressource déposée pour votre filière et votre niveau.
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Soyez le premier à partager un document utile à la promotion.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {resources.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between gap-3 transition"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-blue-600/15 text-blue-300 border border-blue-600/30 shrink-0">
                          {fileLabel(item.originalName)}
                        </span>
                        <h3 className="text-sm font-bold text-white truncate">{item.title}</h3>
                      </div>
                      {canDelete(item) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item)}
                          aria-label="Supprimer la ressource"
                          className="text-slate-600 hover:text-red-400 transition shrink-0"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 mt-2">
                      {item.ue && <span>UE : <strong className="text-slate-400">{item.ue}</strong></span>}
                      <span>{humanSize(item.size)}</span>
                      <span>{item.downloads || 0} téléch.</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Par {item.uploaderName || 'Anonyme'}
                      {item.uploaderRole === 'admin' ? ' · Administration' : ''}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownload(item)}
                    className="inline-flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold px-3 py-2 rounded-xl transition"
                  >
                    <Icon name="download" size={14} />
                    Télécharger
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
