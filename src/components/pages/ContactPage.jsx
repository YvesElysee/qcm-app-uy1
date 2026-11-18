import { useLocation } from 'react-router-dom';
import ContactAdmin from '../ContactAdmin';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Page « Contacter l'administration » (espace étudiant connecté).
 * Réutilise le composant ContactAdmin, également utilisé en modale ailleurs.
 */
export default function ContactPage() {
  usePageTitle("Contacter l'administration");
  const location = useLocation();
  // Une notification de réponse pointe vers /contact?tab=history : la clé
  // force une nouvelle montée du composant pour ouvrir le bon onglet.
  const initialTab = new URLSearchParams(location.search).get('tab') === 'history' ? 'history' : 'new';

  return (
    <div className="flex-1 bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Contacter l'administration</h1>
          <p className="text-xs text-slate-400 mt-1">
            Suggestions, signalements d'erreurs et demandes d'assistance
          </p>
        </div>
        <ContactAdmin key={initialTab} initialTab={initialTab} />
      </div>
    </div>
  );
}
