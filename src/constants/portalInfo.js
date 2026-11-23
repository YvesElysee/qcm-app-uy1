/**
 * Présentation du portail affichée uniquement aux visiteurs non connectés.
 * Une fois le compte ouvert, ces explications ne sont plus affichées.
 */

// Lien de téléchargement de l'application Android (servi par Express).
export const APK_DOWNLOAD_URL = '/download/apk';

export const FEATURES = [
  {
    icon: 'clock',
    title: 'Évaluations chronométrées',
    desc: 'Un temps imparti par question, avec questions et réponses mélangées différemment pour chaque candidat.',
    style: 'bg-blue-500/15 text-blue-300'
  },
  {
    icon: 'refresh',
    title: 'Rattrapage garanti',
    desc: "Une épreuve manquée ? Repassez-la à votre rythme avec les mêmes questions et le même temps imparti.",
    style: 'bg-red-500/15 text-red-300'
  },
  {
    icon: 'document',
    title: 'Corrections détaillées',
    desc: 'Relisez votre copie question par question avec la bonne réponse et votre note sur 20.',
    style: 'bg-emerald-500/15 text-emerald-300'
  },
  {
    icon: 'calendar',
    title: 'Emploi du temps public',
    desc: 'La programmation des évaluations est consultable librement, même sans compte étudiant.',
    style: 'bg-amber-500/15 text-amber-300'
  },
  {
    icon: 'chat',
    title: 'Assistance intégrée',
    desc: "Suggérez des améliorations ou signalez un problème à l'administration depuis votre espace.",
    style: 'bg-purple-500/15 text-purple-300'
  },
  {
    icon: 'sparkles',
    title: 'Tuteur IA inclus',
    desc: 'Un assistant intelligent explique vos erreurs, détaille les notions et vous aide à réviser, à tout moment.',
    style: 'bg-indigo-500/15 text-indigo-300'
  },
  {
    icon: 'upload',
    title: 'Partage de cours',
    desc: 'Déposez vos documents (PDF, Word, PowerPoint, Excel…) et aidez à produire des QCM pour votre filière.',
    style: 'bg-teal-500/15 text-teal-300'
  },
  {
    icon: 'lock',
    title: 'Comptes sécurisés',
    desc: 'Mots de passe protégés côté serveur et sessions par jeton : vos résultats ne sont visibles que par vous.',
    style: 'bg-cyan-500/15 text-cyan-300'
  }
];

export const STEPS = [
  {
    n: '1',
    title: 'Créez votre compte',
    desc: "Nom, email, filière et niveau · c'est tout. Votre filière est ensuite verrouillée pour la sécurité des épreuves."
  },
  {
    n: '2',
    title: 'Suivez le planning',
    desc: 'Consultez les évaluations à venir, en cours et passées de votre filière et de votre niveau.'
  },
  {
    n: '3',
    title: 'Passez vos épreuves',
    desc: 'Rejoignez l’épreuve au moment voulu, obtenez votre note immédiatement et relisez votre copie.'
  }
];
