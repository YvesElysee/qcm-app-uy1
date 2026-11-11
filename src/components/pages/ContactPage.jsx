import ContactAdmin from '../ContactAdmin';
import usePageTitle from '../../hooks/usePageTitle';

/**
 * Page « Contacter l'administration » (espace étudiant connecté).
 * Réutilise le composant ContactAdmin, également utilisé en modale ailleurs.
 */
export default function ContactPage() {
  usePageTitle("Contacter l'administration");

  return (
    <div className="flex-1 bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">Contacter l'administration</h1>
          <p className="text-xs text-slate-400 mt-1">
            Suggestions, signalements d'erreurs et demandes d'assistance
          </p>
        </div>
        <ContactAdmin />
      </div>
    </div>
  );
}
