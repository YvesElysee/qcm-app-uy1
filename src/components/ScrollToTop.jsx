import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Remet la page en haut à chaque changement de route
 * (comportement attendu d'un site classique).
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
