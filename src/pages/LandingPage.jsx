import { useEffect, useState } from 'react';

function readTheme() {
  try {
    const saved = localStorage.getItem('uniquiz-theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

export default function LandingPage() {
  const [dark, setDark] = useState(readTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('uniquiz-theme', dark ? 'dark' : 'light');
    } catch {}
    // Le mode sombre ne concerne que l'accueil : on le retire en quittant la page.
    return () => document.documentElement.classList.remove('dark');
  }, [dark]);

  return (
    <div className="landing-theme min-h-screen">
      <div className="bg-surface-container-lowest font-body-md text-body-md text-on-surface antialiased">
      <header className="fixed top-0 w-full z-50 bg-surface-container-lowest/90 backdrop-blur-md border-b border-outline-variant/40">
        <div className="h-20 max-w-7xl mx-auto px-6 lg:px-12 flex items-center justify-between gap-gutter">
          <div className="flex items-center gap-space-sm">
            <div className="w-10 h-10 rounded-xl bg-primary-container shadow-lg shadow-primary-container/30 flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-on-primary text-[24px]" style={{"fontVariationSettings": "'FILL' 1"}}>school</span></div>
            <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-bold">
              QuizzApp
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-space-xl" data-active-classes="text-primary font-label-lg">
            <a aria-current="page" className="transition-colors text-primary font-label-lg" data-path="accueil" href="#">
              Accueil
            </a>
            <a className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors" data-path="fonctionnalites" href="#fonctionnalites">
              Fonctionnalités
            </a>
            <a className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors" data-path="comment-ca-marche" href="#comment-ca-marche">
              Comment ça marche
            </a>
            <a className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors" data-path="contact" href="#contact">
              Contact
            </a>
          </nav>
          <div className="flex items-center gap-space-sm">
            <button aria-label="Basculer entre le thème clair et le thème sombre" data-theme-toggle="" type="button" onClick={() => setDark((d) => !d)} className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              <span className="material-symbols-outlined text-[20px]" data-theme-icon="">
                {dark ? "light_mode" : "dark_mode"}
              </span>
            </button>
            <a className="hidden sm:inline-flex items-center justify-center px-space-md py-space-sm rounded-xl border border-outline-variant text-on-surface hover:bg-surface-container hover:text-on-surface font-label-lg text-label-lg transition-colors" data-path="connexion" href="/login">
              Se connecter
            </a>
            <a className="inline-flex items-center justify-center px-space-lg py-space-sm rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary transition-colors shadow-sm" data-path="inscription" href="/register">
              Commencer
            </a>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center ml-space-xs">
              <span className="material-symbols-outlined text-on-primary text-[18px]">
                person
              </span>
            </div>
          </div>
        </div>
      </header>
      <main className="w-full pt-20 bg-surface-container-lowest min-h-screen">
        <div className="flex flex-col w-full">
          {/* HERO SECTION */}
          <section className="relative w-full overflow-hidden bg-surface-container-lowest py-space-xl lg:py-24" id="accueil">
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter lg:gap-12 items-center">
                {/* Left Column: Value Prop & CTAs */}
                <div className="lg:col-span-7 flex flex-col items-start space-y-6">
                  {/* Audience Badge */}
                  <div className="inline-flex items-center gap-space-xs px-3.5 py-1.5 rounded-full bg-secondary-fixed text-primary font-label-md text-label-md">
                    <span className="material-symbols-outlined text-[18px]">
                      school
                    </span>
                    <span>
                      Conçu pour les étudiants universitaires
                    </span>
                  </div>
                  {/* Main Title */}
                  <h1 className="font-display text-display lg:text-[3.25rem] lg:leading-[3.75rem] text-on-surface tracking-tight font-extrabold max-w-2xl">
                    Préparez vos examens,
                    <span className="text-primary-container">
                      étape par étape
                    </span>
                  </h1>
                  {/* Subtitle */}
                  <p className="font-body-lg text-body-lg text-on-surface-variant max-w-xl leading-relaxed">
                    Sélectionnez votre filière et votre niveau universitaire pour accéder à des séries de quiz ciblés et des annales d'examens calibrées sur votre programme.
                  </p>
                  {/* CTAs */}
                  <div className="flex flex-wrap items-center gap-space-sm pt-2">
                    <a className="inline-flex items-center gap-2 px-space-lg py-3 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary transition-colors shadow-lg shadow-primary-container/25" href="/register">
                      <span>
                        Commencer gratuitement
                      </span>
                      <span className="material-symbols-outlined text-[18px]">
                        arrow_forward
                      </span>
                    </a>
                    <a className="inline-flex items-center gap-2 px-space-lg py-3 rounded-xl border border-outline-variant text-on-surface font-label-lg text-label-lg hover:bg-surface-container transition-colors" href="#fonctionnalites">
                      <span className="material-symbols-outlined text-[18px]">
                        grid_view
                      </span>
                      <span>
                        Voir les fonctionnalités
                      </span>
                    </a>
                  </div>
                </div>
                {/* Right Column: Interactive Quiz Simulation Card */}
                <div className="lg:col-span-5 relative mt-10 lg:mt-0">
                  {/* Background Subtle Glow Orb */}
                  <div className="absolute -top-10 -right-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl -z-10" />
                  {/* Mockup Assessment Card */}
                  <div className="relative rounded-2xl bg-surface-container-lowest shadow-xl shadow-black/10 ring-1 ring-outline-variant/40 p-6 sm:p-7 space-y-5 transition-all">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-primary font-label-md text-label-md font-bold">
                        <span className="material-symbols-outlined text-[16px]">
                          menu_book
                        </span>
                        <span>
                          Réseaux Informatiques — L3
                        </span>
                      </span>
                      <span className="flex items-center gap-1 font-label-md text-label-md text-on-surface-variant">
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          timer
                        </span>
                        <span>
                          12:45
                        </span>
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center justify-between font-label-md text-label-md mb-2">
                        <span className="text-on-surface-variant">
                          Question 4 sur 20
                        </span>
                        <span className="text-primary font-bold">
                          20%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                        <div className="h-full bg-primary-container rounded-full" style={{"width": "20%"}} />
                      </div>
                    </div>
                    <p className="font-headline-sm text-headline-sm text-on-surface font-bold leading-snug">
                      Quel protocole de la couche transport garantit la fiabilité et le contrôle des erreurs ?
                    </p>
                    <ul className="space-y-2.5">
                      <li className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest font-body-md text-body-md text-on-surface-variant">
                        <span>
                          UDP
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border-2 border-primary bg-primary/5 font-body-md text-body-md text-on-surface font-semibold">
                        <span>
                          TCP
                        </span>
                        <span className="material-symbols-outlined text-[18px] text-primary">
                          check_circle
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest font-body-md text-body-md text-on-surface-variant">
                        <span>
                          IP
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest font-body-md text-body-md text-on-surface-variant">
                        <span>
                          HTTP
                        </span>
                      </li>
                    </ul>
                    <div className="flex items-center justify-between pt-1">
                      <button className="font-label-lg text-label-lg text-on-surface-variant hover:text-on-surface transition-colors" type="button">
                        Passer
                      </button>
                      <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-container text-on-primary font-label-lg text-label-lg hover:bg-primary transition-colors shadow-sm" type="button">
                        <span>
                          Question suivante
                        </span>
                        <span className="material-symbols-outlined text-[18px]">
                          arrow_forward
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          {/* SECTION: COMMENT ÇA MARCHE */}
          <section className="w-full py-space-xl lg:py-24 bg-surface-container-low" id="comment-ca-marche">
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
              {/* Section Header */}
              <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
                <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-surface-container text-primary font-label-md text-label-md uppercase tracking-wider font-bold">
                  Méthode
                </div>
                <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">
                  Comment ça marche ?
                </h2>
                <p className="font-body-lg text-body-lg text-on-surface-variant">
                  Une préparation structurée en 3 étapes simples pour maximiser vos résultats aux partiels.
                </p>
              </div>
              {/* 3 Steps Interactive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
                {/* Step 1 */}
                <div className="relative bg-surface-container-lowest rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full group">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-2xl font-black text-primary px-3 py-1 rounded-lg bg-surface-container">
                        01
                      </span>
                      <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
                        <span className="material-symbols-outlined text-[26px]">
                          manage_accounts
                        </span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-3">
                        Connectez-vous
                      </h3>
                      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                        Créez votre profil en quelques secondes avec votre adresse étudiante ou personnelle pour sauvegarder vos révisions, vos favoris et votre historique complet.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 mt-6 border-t border-surface-container-low flex items-center text-primary font-label-lg text-label-lg">
                    <span>
                      Inscription instantanée
                    </span>
                    <span className="material-symbols-outlined text-[18px] ml-1">
                      check_circle
                    </span>
                  </div>
                </div>
                {/* Step 2 */}
                <div className="relative bg-surface-container-lowest rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full group">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-2xl font-black text-primary px-3 py-1 rounded-lg bg-surface-container">
                        02
                      </span>
                      <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
                        <span className="material-symbols-outlined text-[26px]">
                          tune
                        </span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-3">
                        Choisissez votre filière et niveau
                      </h3>
                      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                        De la Licence 1 au Master 2 : Informatique, Physique, Biosciences (BOA/BOV), chimie ou Mathematiques . Le contenu s'ajuste instantanément aux exigences de vos UEs.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 mt-6 border-t border-surface-container-low flex items-center text-primary font-label-lg text-label-lg">
                    <span>
                      Programmes universitaires à jour
                    </span>
                    <span className="material-symbols-outlined text-[18px] ml-1">
                      menu_book
                    </span>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="relative bg-surface-container-lowest rounded-2xl p-8 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between h-full group">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="font-display text-2xl font-black text-primary px-3 py-1 rounded-lg bg-surface-container">
                        03
                      </span>
                      <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:bg-primary-container group-hover:text-on-primary transition-colors">
                        <span className="material-symbols-outlined text-[26px]">
                          assignment_turned_in
                        </span>
                      </div>
                    </div>
                    <div>
                      <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold mb-3">
                        Passez vos séries d'examens
                      </h3>
                      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                        Entraînez-vous en conditions réelles avec des séries chronométrées et des corrections détaillées rédigées par des enseignants et tuteurs chevronnés.
                      </p>
                    </div>
                  </div>
                  <div className="pt-6 mt-6 border-t border-surface-container-low flex items-center text-primary font-label-lg text-label-lg">
                    <span>
                      Simulations réelles chronométrées
                    </span>
                    <span className="material-symbols-outlined text-[18px] ml-1">
                      speed
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
          {/* SECTION: FONCTIONNALITÉS */}
          <section className="w-full py-space-xl lg:py-24 bg-surface-container-lowest" id="fonctionnalites">
            <div className="max-w-7xl mx-auto px-6 lg:px-12">
              {/* Section Header */}
              <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                <div className="space-y-3 max-w-2xl">
                  <div className="inline-flex items-center px-3.5 py-1.5 rounded-full bg-secondary-fixed text-primary font-label-md text-label-md uppercase tracking-wider font-bold">
                    Outils d'excellence
                  </div>
                  <h2 className="font-headline-lg text-headline-lg text-on-surface font-bold">
                    Des fonctionnalités taillées pour vos révisions
                  </h2>
                  <p className="font-body-lg text-body-lg text-on-surface-variant">
                    Tout ce dont vous avez besoin pour réviser sans stress et réussir chaque semestre universitaire.
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2">
                  <span className="font-label-lg text-label-lg text-on-surface-variant">
                    Conforme aux maquettes pédagogiques
                  </span>
                  <span className="material-symbols-outlined text-primary text-[22px]">
                    verified
                  </span>
                </div>
              </div>
              {/* Feature Grid: 4 Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Feature 1: Quiz par filière */}
                <div className="rounded-2xl p-8 bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[30px]">
                        layers
                      </span>
                    </div>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                      Quiz par filière
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                      Des milliers de questions spécialisées triées par unité d'enseignement (UE) et matières fondamentales. Choisissez vos modules et révisez exactement ce qui tombe à l'examen.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-surface-container-low flex flex-wrap gap-2">
                    <span className="px-3 py-1 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md">
                      Reseau
                    </span>
                    <span className="px-3 py-1 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md">
                      Statistique
                    </span>
                    <span className="px-3 py-1 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md">
                      Electrostatique
                    </span>
                    <span className="px-3 py-1 rounded-full bg-surface-container-low text-on-surface font-label-md text-label-md">
                      +40 matières
                    </span>
                  </div>
                </div>
                {/* Feature 2: Séries d'examens */}
                <div className="rounded-2xl p-8 bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[30px]">
                        assignment_add
                      </span>
                    </div>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                      Séries d'examens
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                      Des simulations complètes de CC et SN en temps limité pour vous entraîner au rythme réel des épreuves. Calibrez votre vitesse de lecture et de réflexion avant le jour J.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-surface-container-low flex items-center justify-between text-on-surface-variant font-label-md text-label-md">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        schedule
                      </span>
                      <span>
                        Chronomètre ajustable
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-primary text-[18px]">
                        lock_clock
                      </span>
                      <span>
                        Mode examen verrouillé
                      </span>
                    </div>
                  </div>
                </div>
                {/* Feature 3: Résultats instantanés */}
                <div className="rounded-2xl p-8 bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[30px]">
                        bolt
                      </span>
                    </div>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                      Résultats instantanés
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                      Visualisez immédiatement vos bonnes et mauvaises réponses avec des explications méthodologiques limpides. Comprenez vos pièges et ne reproduisez plus les mêmes erreurs.
                    </p>
                  </div>
                  <div className="mt-8 pt-6 border-t border-surface-container-low">
                    <div className="flex items-center gap-3 bg-surface-container-low p-3 rounded-xl">
                      <span className="material-symbols-outlined text-[#059669] text-[20px]">
                        lightbulb
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface">
                        Commentaires pédagogiques et références jurisprudentielles incluses.
                      </span>
                    </div>
                  </div>
                </div>
                {/* Feature 4: Suivi de progression */}
                <div className="rounded-2xl p-8 bg-surface-container-lowest shadow-sm hover:shadow-md transition-all flex flex-col justify-between group">
                  <div className="space-y-4">
                    <div className="w-14 h-14 rounded-xl bg-surface-container flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                      <span className="material-symbols-outlined text-[30px]">
                        query_stats
                      </span>
                    </div>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold">
                      Suivi de progression
                    </h3>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                      Mesurez votre maîtrise chapitre par chapitre, repérez vos points faibles et observez votre courbe de notes s'envoler avec des tableaux de bord précis et motivants.
                    </p>
                  </div>
                  {/* Micro Analytics Snapshot */}
                  <div className="mt-8 pt-6 border-t border-surface-container-low space-y-2">
                    <div className="flex justify-between items-center font-label-md text-label-md">
                      <span className="text-on-surface-variant">
                        Taux de maîtrise estimé
                      </span>
                      <span className="text-primary font-bold">
                        84% (+14% cette semaine)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                      <div className="h-full bg-primary-container rounded-full" style={{"width": "84%"}} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          {/* FINAL CALL-TO-ACTION BANNER */}
          <section className="w-full max-w-7xl mx-auto px-6 lg:px-12 my-12 lg:my-20">
            <div className="relative rounded-3xl bg-primary-container p-10 sm:p-14 lg:p-16 text-center text-on-primary shadow-xl overflow-hidden">
              {/* Subtle Decorative Background Circles */}
              <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-on-primary/10 blur-2xl pointer-events-none" />
              <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-primary/30 blur-2xl pointer-events-none" />
              {/* Academic Geometric Pattern SVG Overlay */}
              <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" height="100%" width="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern height="32" id="academic-grid" patternunits="userSpaceOnUse" width="32">
                    <circle cx="2" cy="2" fill="currentColor" r="1.5" />
                  </pattern>
                </defs>
                <rect fill="url(#academic-grid)" height="100%" width="100%" />
              </svg>
              <div className="relative z-10 max-w-3xl mx-auto flex flex-col items-center space-y-6">
                {/* Floating university icon */}
                <div className="w-16 h-16 rounded-2xl bg-on-primary/15 backdrop-blur-sm flex items-center justify-center text-on-primary shadow-sm mb-2">
                  <span className="material-symbols-outlined text-[36px]">
                    auto_stories
                  </span>
                </div>
                {/* Headline */}
                <h2 className="font-headline-lg lg:font-display text-headline-lg lg:text-display text-on-primary font-extrabold tracking-tight">
                  Prêt à réussir vos examens universitaires ?
                </h2>
                {/* Subtext */}
                <p className="font-body-lg text-body-lg text-on-primary-container max-w-2xl leading-relaxed">
                  Rejoignez dès aujourd'hui les étudiants de votre campus et transformez vos révisions en succès garanti. Des révisions régulières, sans surcharge mentale.
                </p>
                {/* CTA Action Button */}
                <div className="pt-4">
                  <a className="inline-flex items-center gap-3 bg-surface-container-lowest text-primary font-label-lg text-body-lg px-9 py-4 rounded-xl shadow-lg hover:bg-surface-container hover:shadow-xl transition-all duration-200 font-bold group" data-path="inscription" href="/register">
                    <span>
                      Commencer maintenant
                    </span>
                    <span className="material-symbols-outlined text-[22px] group-hover:translate-x-1 transition-transform">
                      arrow_forward
                    </span>
                  </a>
                </div>
                {/* Reassurance Notice */}
                <div className="pt-4 flex flex-wrap justify-center items-center gap-6 text-on-primary/80 font-body-sm text-body-sm">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      verified
                    </span>
                    Accès gratuit
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-on-primary/40 hidden sm:inline-block" />
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      school
                    </span>
                    Compatible toutes universités
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-on-primary/40 hidden sm:inline-block" />
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px]">
                      credit_card_off
                    </span>
                    Sans carte bancaire
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
      <footer className="w-full bg-surface-container-low border-t border-outline-variant/30 pt-space-xl pb-margin" id="contact">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-gutter mb-space-xl">
            <div className="space-y-space-md md:col-span-1">
              <div className="flex items-center gap-space-sm">
                <div className="w-10 h-10 rounded-xl bg-primary-container shadow-lg shadow-primary-container/30 flex items-center justify-center shrink-0"><span className="material-symbols-outlined text-on-primary text-[24px]" style={{"fontVariationSettings": "'FILL' 1"}}>school</span></div>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  QuizzApp
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                La plateforme de révision et d'examens d'entraînement conçue pour la réussite des étudiants universitaires.
              </p>
              <div className="space-y-space-sm pt-2">
                <a className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="mailto:contact@quizzapp.app">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    mail
                  </span>
                  <span>
                    contact@quizzapp.app
                  </span>
                </a>
                <a className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant hover:text-primary transition-colors" href="/login">
                  <span className="material-symbols-outlined text-[18px] text-primary">
                    support_agent
                  </span>
                  <span>
                    Support & assistance
                  </span>
                </a>
              </div>
            </div>
            <div>
              <h4 className="font-label-lg text-label-lg text-on-surface mb-space-md uppercase tracking-wider">
                Navigation
              </h4>
              <ul className="space-y-space-sm font-body-sm text-body-sm text-on-surface-variant">
                <li>
                  <a className="hover:text-primary transition-colors" data-path="accueil" href="#">
                    Accueil
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" data-path="fonctionnalites" href="#fonctionnalites">
                    Fonctionnalités
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" data-path="comment-ca-marche" href="#comment-ca-marche">
                    Comment ça marche
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" data-path="contact" href="#contact">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-label-lg text-label-lg text-on-surface mb-space-md uppercase tracking-wider">
                Filières populaires
              </h4>
              <ul className="space-y-space-sm font-body-sm text-body-sm text-on-surface-variant">
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Chimie
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    BIOS & GEOS
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Mathemaique
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" href="#">
                    Informatique
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-label-lg text-label-lg text-on-surface mb-space-md uppercase tracking-wider">
                Légal
              </h4>
              <ul className="space-y-space-sm font-body-sm text-body-sm text-on-surface-variant">
                <li>
                  <a className="hover:text-primary transition-colors" data-path="mentions-legales" href="#">
                    Mentions légales
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" data-path="cgu" href="#">
                    Conditions Générales d'Utilisation
                  </a>
                </li>
                <li>
                  <a className="hover:text-primary transition-colors" data-path="politique-de-confidentialite" href="#">
                    Politique de confidentialité
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="pt-space-md border-t border-outline-variant/30 flex flex-col sm:flex-row items-center justify-between text-on-surface-variant font-body-sm text-body-sm gap-space-sm">
            <p>
              © 2026 QuizzApp. Tous droits réservés.
            </p>
            <p className="text-outline">
              Environnement académique sécurisé & conforme RGPD
            </p>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
