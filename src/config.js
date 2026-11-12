/**
 * Configuration publique de l'application.
 *
 * Le portail administrateur n'est plus exposé par un lien visible : il est
 * accessible uniquement via cette URL dédiée (ou le raccourci clavier
 * Ctrl + Shift + Alt + A). La sécurité réelle reste assurée côté serveur par
 * le mot de passe et le jeton administrateur.
 *
 * Pour changer l'URL d'accès, modifiez uniquement cette constante.
 */
export const ADMIN_PORTAL_PATH = '/qa-admin-7f3c';
export const ADMIN_LOGIN_PATH = ADMIN_PORTAL_PATH;
export const ADMIN_PANEL_PATH = `${ADMIN_PORTAL_PATH}/panel`;
