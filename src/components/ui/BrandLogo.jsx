/**
 * Logo officiel QCM App, partagé entre le portail, l'espace admin et
 * l'authentification. La source est public/logo.png (générée depuis le logo
 * versionné dans assets/logo-source.jpeg).
 */
export default function BrandLogo({ size = 40, className = '' }) {
  return (
    <img
      src="/logo.png"
      alt="QCM App"
      width={size}
      height={size}
      className={`shrink-0 object-contain rounded-xl ${className}`}
    />
  );
}
