import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getSession } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

const MAX_FILE_MB = 25;

const TYPE_STYLES = {
  qcm: 'bg-blue-600/15 text-blue-300 border-blue-600/30',
  qro: 'bg-purple-600/15 text-purple-300 border-purple-600/30',
  calcul: 'bg-emerald-600/15 text-emerald-300 border-emerald-600/30',
  vrai_faux: 'bg-amber-600/15 text-amber-300 border-amber-600/30',
  mixte: 'bg-indigo-600/15 text-indigo-300 border-indigo-600/30',
  autre: 'bg-slate-600/15 text-slate-300 border-slate-600/30'
};

const TYPE_SHORT = {
  qcm: 'QCM',
  qro: 'QRO',
  calcul: 'Calcul',
  vrai_faux: 'Vrai / Faux',
  mixte: 'Mixte',
  autre: 'Exercice'
};

const DIFFICULTY_STYLES = {
  facile: 'text-emerald-300 bg-emerald-600/15 border-emerald-600/30',
  moyenne: 'text-amber-300 bg-amber-600/15 border-amber-600/30',
  difficile: 'text-red-300 bg-red-600/15 border-red-600/30'
};

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

function typeBadge(type) {
  return TYPE_STYLES[type] || TYPE_STYLES.autre;
}

function ExerciseCard({ exercise, index, open, onToggle }) {
  const type = exercise.type || 'autre';
  const hasOptions = Array.isArray(exercise.options) && exercise.options.length > 0;

  return (
    <article className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${typeBadge(type)}`}>
            {TYPE_SHORT[type] || 'Exercice'}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${DIFFICULTY_STYLES[exercise.difficulte] || DIFFICULTY_STYLES.moyenne}`}>
            {exercise.difficulte || 'moyenne'}
          </span>
        </div>
        <span className="text-[11px] font-black text-slate-500">#{index + 1}</span>
      </div>

      <p className="text-sm font-bold text-slate-100 leading-relaxed mt-3 whitespace-pre-wrap">
        {exercise.enonce}
      </p>

      {hasOptions && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {exercise.options.map((option) => {
            const isCorrect = open && String(option.label).toUpperCase() === String(exercise.reponse).trim().toUpperCase();
            return (
              <div
                key={option.label}
                className={`text-xs p-2.5 rounded-xl border leading-relaxed ${
                  isCorrect
                    ? 'bg-emerald-950/50 border-emerald-700 text-emerald-200 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-300'
                }`}
              >
                <strong className="mr-1">{option.label}.</strong>
                {option.text}
                {isCorrect && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase">
                    <Icon name="check" size={10} strokeWidth={3} />
                    Juste
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onToggle}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-300 hover:text-white bg-blue-950/60 hover:bg-blue-900 border border-blue-800 hover:border-blue-700 px-3 py-1.5 rounded-lg transition"
      >
        <Icon name={open ? 'eye-off' : 'eye'} size={12} />
        {open ? 'Masquer la correction' : 'Afficher la correction'}
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          {exercise.reponse && (
            <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-xl px-3.5 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-300 mb-1 flex items-center gap-1.5">
                <Icon name="check-circle" size={11} />
                Réponse
              </p>
              <p className="text-xs text-slate-100 leading-relaxed whitespace-pre-wrap">{exercise.reponse}</p>
            </div>
          )}

          {Array.isArray(exercise.etapes) && exercise.etapes.length > 0 && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Icon name="list" size={11} />
                Étapes
              </p>
              <ol className="list-decimal list-inside space-y-1">
                {exercise.etapes.map((step, i) => (
                  <li key={i} className="text-xs text-slate-300 leading-relaxed">{step}</li>
                ))}
              </ol>
            </div>
          )}

          {exercise.explication && (
            <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl px-3.5 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-indigo-300 mb-1 flex items-center gap-1.5">
                <Icon name="lightbulb" size={11} />
                Explication
              </p>
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">{exercise.explication}</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * Générateur d'exercices de Mathématiques (L1 → M1).
 *
 * L'étudiant dépose ses propres cours, choisit un format et laisse l'IA
 * produire des exercices corrigés. Toutes les données sont filtrées par le
 * serveur sur l'identité de l'étudiant : aucun document d'un autre compte
 * n'est accessible.
 */
export default function ExerciseGenerator() {
  usePageTitle("Générateur d'exercices");

  const [user] = useState(() => getSession());
  const [access, setAccess] = useState(null);
  const [loadingAccess, setLoadingAccess] = useState(true);

  const [documents, setDocuments] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState('mixte');
  const [count, setCount] = useState(5);
  const [difficulte, setDifficulte] = useState('moyenne');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [exercises, setExercises] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [history, setHistory] = useState([]);
  const [openHistory, setOpenHistory] = useState(null);

  const allowed = access?.allowed === true;

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const data = await api('/exercises/documents', { auth: 'student' });
      setDocuments(Array.isArray(data.documents) ? data.documents : []);
    } catch (err) {
      setError(err.message || 'Impossible de charger vos documents.');
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await api('/exercises/history', { auth: 'student' });
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch {
      /* l'historique est un bonus : une erreur ne bloque pas la génération */
    }
  }, []);

  useEffect(() => {
    let active = true;
    api('/exercises/access', { auth: 'student' })
      .then((data) => {
        if (!active) return;
        setAccess(data);
        if (data?.allowed) {
          loadDocuments();
          loadHistory();
        }
      })
      .catch((err) => {
        if (active) setAccess({ allowed: false, reason: err.message || 'Accès impossible.' });
      })
      .finally(() => {
        if (active) setLoadingAccess(false);
      });
    return () => { active = false; };
  }, [loadDocuments, loadHistory]);

  const toggleDocument = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!file) {
      setError('Veuillez sélectionner un document.');
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`Le fichier dépasse la limite de ${MAX_FILE_MB} Mo.`);
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const token = getSession()?.token;
      const res = await fetch('/api/exercises/documents', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Le dépôt a échoué.');

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      const doc = data.document || {};
      setNotice(
        [
          `« ${doc.originalName || 'Document'} » lu avec succès`,
          doc.charCount ? `· ${doc.charCount.toLocaleString('fr-FR')} caractères extraits.` : '',
          doc.warning ? ` ${doc.warning}` : ''
        ].filter(Boolean).join(' ')
      );
      if (doc.id) setSelectedIds((prev) => [...new Set([...prev, doc.id])]);
      await loadDocuments();
    } catch (err) {
      setError(err.message || 'Le dépôt a échoué.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Supprimer « ${doc.originalName} » ?`)) return;
    setError('');
    try {
      await api(`/exercises/documents/${doc.id}`, { method: 'DELETE', auth: 'student' });
      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      setSelectedIds((prev) => prev.filter((id) => id !== doc.id));
      setNotice('Document supprimé.');
    } catch (err) {
      setError(err.message || 'Suppression impossible.');
    }
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (documents.length === 0) {
      setError('Déposez d’abord au moins un document de cours.');
      return;
    }

    setGenerating(true);
    try {
      const data = await api('/exercises/generate', {
        method: 'POST',
        auth: 'student',
        body: {
          documentIds: selectedIds,
          prompt: prompt.trim(),
          type,
          count,
          difficulte
        }
      });
      setExercises(Array.isArray(data.exercises) ? data.exercises : []);
      setRevealed({});
      setNotice(
        `${(data.exercises || []).length} exercice(s) généré(s) à partir de vos documents.`
      );
      await loadHistory();
    } catch (err) {
      setError(err.message || 'La génération a échoué.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleReveal = (key) => {
    setRevealed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDeleteHistory = async (entry) => {
    if (!window.confirm('Supprimer cette génération de votre historique ?')) return;
    try {
      await api(`/exercises/history/${entry.id}`, { method: 'DELETE', auth: 'student' });
      setHistory((prev) => prev.filter((item) => item.id !== entry.id));
      if (openHistory === entry.id) setOpenHistory(null);
    } catch (err) {
      setError(err.message || 'Suppression impossible.');
    }
  };

  if (loadingAccess) {
    return (
      <div className="flex-1 bg-slate-950 py-16 px-4">
        <div className="max-w-2xl mx-auto text-center text-slate-400 text-sm">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          Vérification de votre accès…
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex-1 bg-slate-950 py-12 px-4">
        <div className="max-w-xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto mb-4">
            <Icon name="lock" size={24} />
          </div>
          <h1 className="text-xl font-black text-white">Générateur d'exercices</h1>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            {access?.reason || "Cette fonctionnalité n'est pas disponible pour votre parcours."}
          </p>
          <p className="text-xs text-slate-500 mt-3">
            Elle est réservée aux étudiants de <strong className="text-slate-300">Mathématiques</strong> en
            <strong className="text-slate-300"> L1, L2, L3 et M1</strong>, à partir de leurs propres documents de cours.
          </p>
          <Link
            to="/dashboard"
            className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition"
          >
            <Icon name="arrow-left" size={14} />
            Retour à mon espace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-950 py-8 px-4 pb-28 md:pb-12">
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
              <Icon name="sparkles" size={22} className="text-blue-400" />
              Générateur d'exercices
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Mathématiques · {user?.niveau || access?.niveau}
              <span className="ml-1 text-slate-500">
                — l'IA compose des exercices corrigés à partir de vos propres documents.
              </span>
            </p>
          </div>
          <span className="self-start bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-bold px-3 py-1.5 rounded-full">
            {documents.length} document(s)
          </span>
        </div>

        {(error || notice) && (
          <div
            className={`text-xs rounded-2xl p-3.5 border ${
              error
                ? 'bg-red-950/50 border-red-800 text-red-300'
                : 'bg-emerald-950/50 border-emerald-800 text-emerald-300'
            }`}
          >
            {error || notice}
          </div>
        )}

        <div className="grid lg:grid-cols-5 gap-5 items-start">
          {/* Documents */}
          <section className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Icon name="document" size={16} className="text-blue-400" />
              Mes documents
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              PDF, Word, PowerPoint, Excel, OpenDocument, texte… 25 Mo max.
              Vous seul avez accès à ces fichiers.
            </p>

            <form onSubmit={handleUpload} className="mt-4 space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp,.rtf,.txt,.md,.markdown,.csv,.json,.xml,.html,.htm,.epub,.zip"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs file:font-bold hover:file:bg-slate-700 file:cursor-pointer"
              />
              <button
                type="submit"
                disabled={uploading || !file}
                className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black py-2.5 rounded-xl transition"
              >
                <Icon name="upload" size={14} />
                {uploading ? 'Extraction du texte…' : 'Déposer le document'}
              </button>
            </form>

            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto pr-1">
              {loadingDocs ? (
                <p className="text-xs text-slate-500 text-center py-6 animate-pulse">Chargement…</p>
              ) : documents.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6 border border-dashed border-slate-800 rounded-xl">
                  Aucun document pour le moment.
                </p>
              ) : (
                documents.map((doc) => {
                  const checked = selectedIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition ${
                        checked
                          ? 'bg-blue-950/40 border-blue-700/60'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDocument(doc.id)}
                        className="mt-1 accent-blue-500"
                        aria-label={`Utiliser ${doc.originalName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-200 truncate">{doc.originalName}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {humanSize(doc.size)} · {Number(doc.charCount || 0).toLocaleString('fr-FR')} car.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc)}
                        aria-label={`Supprimer ${doc.originalName}`}
                        className="shrink-0 w-7 h-7 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              Sans sélection, les 5 documents les plus récents sont utilisés.
            </p>
          </section>

          {/* Paramètres + résultat */}
          <section className="lg:col-span-3 space-y-5">
            <form onSubmit={handleGenerate} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <Icon name="sparkles" size={16} className="text-blue-400" />
                Générer des exercices
              </h2>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="text-[11px] font-bold text-slate-400">
                  Type
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-blue-600"
                  >
                    {(access?.types || []).map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="text-[11px] font-bold text-slate-400">
                  Difficulté
                  <select
                    value={difficulte}
                    onChange={(e) => setDifficulte(e.target.value)}
                    className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-blue-600"
                  >
                    <option value="facile">Facile</option>
                    <option value="moyenne">Moyenne</option>
                    <option value="difficile">Difficile</option>
                  </select>
                </label>
              </div>

              <label className="block text-[11px] font-bold text-slate-400">
                Nombre d'exercices
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-blue-600"
                />
              </label>

              <label className="block text-[11px] font-bold text-slate-400">
                Consignes (chapitre, notion, format…)
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Ex. : exercices sur les intégrales du chapitre 3, avec un niveau proche des partiels."
                  className="mt-1 w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-600 resize-none"
                />
              </label>

              <button
                type="submit"
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black py-3 rounded-xl transition shadow-md shadow-indigo-600/25"
              >
                <Icon name={generating ? 'refresh' : 'sparkles'} size={15} />
                {generating ? 'Génération en cours…' : 'Générer les exercices'}
              </button>
            </form>

            {exercises.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-black text-white">
                    Exercices générés ({exercises.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setRevealed({})}
                    className="text-[11px] font-bold text-slate-400 hover:text-white transition"
                  >
                    Tout masquer
                  </button>
                </div>
                {exercises.map((exercise, index) => (
                  <ExerciseCard
                    key={index}
                    exercise={exercise}
                    index={index}
                    open={!!revealed[`gen:${index}`]}
                    onToggle={() => toggleReveal(`gen:${index}`)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Historique */}
        {history.length > 0 && (
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h2 className="text-sm font-black text-white flex items-center gap-2">
              <Icon name="clock" size={16} className="text-blue-400" />
              Mes générations récentes
            </h2>
            <div className="mt-3 space-y-2">
              {history.map((entry) => {
                const isOpen = openHistory === entry.id;
                return (
                  <div key={entry.id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between gap-3 p-3">
                      <button
                        type="button"
                        onClick={() => setOpenHistory(isOpen ? null : entry.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-xs font-bold text-slate-200 truncate">
                          {TYPE_SHORT[entry.type] || 'Exercices'} · {entry.exercises.length} exercice(s)
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {new Date(entry.createdAt).toLocaleString('fr-FR')}
                          {entry.prompt ? ` · ${entry.prompt}` : ''}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHistory(entry)}
                        aria-label="Supprimer cette génération"
                        className="shrink-0 w-7 h-7 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="p-3 pt-0 space-y-2.5">
                        {entry.exercises.map((exercise, index) => (
                          <ExerciseCard
                            key={index}
                            exercise={exercise}
                            index={index}
                            open={!!revealed[`h${entry.id}:${index}`]}
                            onToggle={() => toggleReveal(`h${entry.id}:${index}`)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
