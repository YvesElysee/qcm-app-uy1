import { useEffect } from 'react';
import Icon from './ui/icons.jsx';

/**
 * Mode d'emploi de première utilisation.
 *
 * Affiche, pour chaque bouton important de l'application étudiante, son nom et
 * son rôle. Le guide s'ouvre automatiquement une seule fois par étudiant et
 * peut être rouvert à tout moment depuis la navbar (bouton « Guide »).
 */

const SECTIONS = [
  {
    id: 'navigation',
    title: 'Navigation & compte',
    icon: 'menu',
    items: [
      { icon: 'home', label: 'Accueil', role: "Présentation de la plateforme et prochaines évaluations publiques." },
      { icon: 'calendar', label: 'Planning', role: "Calendrier des épreuves à venir, des épreuves terminées et des rattrapages." },
      { icon: 'book', label: 'Ressources', role: "Documents de cours déposés par l'administration pour votre filière." },
      { icon: 'sparkles', label: 'Exercices', role: "Générateur d'exercices corrigés (filières mathématiques)." },
      { icon: 'mail', label: 'Contact', role: "Contacter l'administration : suggestions, signalements d'erreurs et demandes d'assistance." },
      { icon: 'graduation', label: 'Mon espace', role: "Votre tableau de bord : matières, tests, notes, demandes et parrainage." },
      { icon: 'sparkles', label: 'Tuteur IA', role: "Aide à la révision : notions, exemples et explications de vos erreurs (5 questions / 24 h)." },
      { icon: 'bell', label: 'Cloche de notifications', role: "Vous prévient d'un nouveau test, d'une programmation ou d'une demande validée." },
      { icon: 'user', label: 'Mon profil', role: "Modifier votre nom, votre date de naissance et votre mot de passe." },
      { icon: 'chat', label: 'Chaîne WhatsApp', role: "Annonces, rappels et informations importantes de la plateforme." },
      { icon: 'logout', label: 'Se déconnecter', role: "Ferme votre session sur cet appareil en toute sécurité." }
    ]
  },
  {
    id: 'dashboard',
    title: 'Mon espace étudiant',
    icon: 'graduation',
    items: [
      { icon: 'book', label: 'Semestre 1 / Semestre 2 / Tous', role: "Filtre les matières et les tests selon le semestre affiché." },
      { icon: 'list', label: 'Carte UE', role: "Regroupe toutes les épreuves d'une même matière, avec leurs dates et vos notes." },
      { icon: 'play', label: 'Démarrer / Rattraper l’épreuve', role: "Rejoint le QCM ouvert. Le bouton devient « Rattraper l'épreuve » après la clôture." },
      { icon: 'eye', label: 'Relire ma copie', role: "Ouvre la correction détaillée d'un test déjà passé (réponses et explications)." },
      { icon: 'lightbulb', label: 'Réviser après un QCM', role: "Accès direct à votre dernière correction et aux entraînements." },
      { icon: 'trophy', label: 'Classement', role: "Compare votre note à celle des autres étudiants de votre salle (filière et niveau)." },
      { icon: 'send', label: 'Demander ce QCM', role: "Signale à l'administration une matière qui n'a pas encore d'épreuve." }
    ]
  },
  {
    id: 'quiz',
    title: 'Pendant une épreuve',
    icon: 'clock',
    items: [
      { icon: 'clock', label: 'Minuteur', role: "Temps restant pour la question en cours ; la réponse est enregistrée automatiquement." },
      { icon: 'check', label: 'Valider et suivant', role: "Enregistre la réponse et passe à la question suivante. Impossible de revenir en arrière." },
      { icon: 'check', label: 'Valider et terminer', role: "Sur la dernière question : enregistre la réponse et dépose définitivement la copie." },
      { icon: 'eye', label: 'Plein écran', role: "Affiche l'épreuve sur tout l'écran pour rester concentré ; recliquez pour en sortir." },
      { icon: 'list', label: 'Progression n / total', role: "Indique la question en cours et le nombre total de questions de l'épreuve." },
      { icon: 'alert', label: 'Quitter l’épreuve', role: "Vous avertit que la copie ne pourra pas être recommencée ; vous reprendrez à la question en cours." }
    ]
  },
  {
    id: 'review',
    title: 'Après le QCM (correction)',
    icon: 'eye',
    items: [
      { icon: 'list', label: 'Toutes / Mes erreurs', role: "Affiche toutes les questions ou uniquement celles ratées." },
      { icon: 'refresh', label: 'Refaire mes erreurs', role: "Entraînement non noté qui ne modifie ni votre note ni le classement." },
      { icon: 'download', label: 'Télécharger en PDF', role: "Exporte la correction complète pour réviser hors ligne." },
      { icon: 'sparkles', label: 'Aide IA pour réviser', role: "Explique une erreur précise, donne des exemples et des méthodes de révision." },
      { icon: 'arrow-left', label: 'Retour à mon espace', role: "Revient au tableau de bord pour choisir une autre matière ou un autre test." }
    ]
  },
  {
    id: 'ai',
    title: 'Aide à la révision (IA)',
    icon: 'sparkles',
    items: [
      { icon: 'sparkles', label: '5 questions par jour', role: "Quota commun à toutes les matières et à tous les QCM, renouvelé toutes les 24 h." },
      { icon: 'lightbulb', label: '2 questions par erreur', role: "Chaque question ratée peut être approfondie jusqu'à deux fois." },
      { icon: 'chat', label: 'Réponses pédagogiques', role: "Explication claire, exemple concret et mini-exercice pour ancrer la notion." }
    ]
  }
];

export default function OnboardingGuide({ open, onClose }) {
  // Fermeture au clavier et blocage du défilement de la page en arrière-plan.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        className="w-full max-w-3xl max-h-[92vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
      >
        {/* En-tête */}
        <div className="px-5 sm:px-7 py-5 border-b border-slate-800 bg-gradient-to-r from-blue-950/70 to-slate-900 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="w-11 h-11 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center shrink-0">
              <Icon name="lightbulb" size={22} />
            </span>
            <div className="min-w-0">
              <h2 id="guide-title" className="text-lg font-black text-white leading-tight">
                Bienvenue sur QCM App 👋
              </h2>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Voici le rôle de chaque bouton. Ce guide s'affiche une seule fois ;
                vous pourrez le rouvrir avec le bouton <strong className="text-blue-300">Guide</strong> de la barre de navigation.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le guide"
            className="w-9 h-9 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Contenu défilant */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">
          {SECTIONS.map((section) => (
            <section key={section.id}>
              <h3 className="text-[11px] font-black uppercase tracking-wider text-blue-300 flex items-center gap-2 mb-2.5">
                <Icon name={section.icon} size={14} />
                {section.title}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.items.map((item) => (
                  <div
                    key={`${section.id}-${item.label}`}
                    className="flex items-start gap-2.5 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2.5"
                  >
                    <span className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700 text-blue-300 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon name={item.icon} size={14} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white leading-snug">{item.label}</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{item.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <div className="bg-blue-950/50 border border-blue-800/60 rounded-2xl p-4 flex items-start gap-3">
            <span className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center shrink-0">
              <Icon name="info" size={16} />
            </span>
            <p className="text-[11px] text-blue-200 leading-relaxed">
              <strong className="text-white">Bon réflexe :</strong> commencez par « Mon espace » pour
              voir vos matières, puis « Planning » pour les épreuves à venir. Après un QCM,
              ouvrez « Relire ma copie » : vous y trouverez la correction, l'entraînement
              « Refaire mes erreurs » et l'aide à la révision.
            </p>
          </div>
        </div>

        {/* Pied */}
        <div className="px-5 sm:px-7 py-4 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            Vous pouvez rouvrir ce guide à tout moment depuis la navbar.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm px-5 py-2.5 rounded-xl transition shadow-lg shadow-blue-600/25"
          >
            <Icon name="check" size={15} strokeWidth={3} />
            J'ai compris, commencer
          </button>
        </div>
      </div>
    </div>
  );
}
