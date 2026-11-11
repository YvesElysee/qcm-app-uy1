import { useEffect } from 'react';

const BASE_TITLE = 'Portail QCM — UY1';

/**
 * Met à jour le titre de l'onglet pour la page courante.
 * @param {string} title Libellé de la page (vide = titre de base)
 */
export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
