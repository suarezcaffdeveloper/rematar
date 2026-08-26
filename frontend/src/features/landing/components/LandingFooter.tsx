import { NAV_LINKS } from '../data';

/** Footer de la landing: marca, tagline, nav y copyright -- sin nada del "detrás de escena". */
export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:px-8 lg:flex-row lg:justify-between lg:text-left">
        <div>
          <span className="text-lg font-bold text-brand-700">RematAR</span>
          <p className="mt-1.5 max-w-sm text-sm text-slate-500">
            La plataforma para organizar, conducir y participar en remates en tiempo real.
          </p>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-brand-700"
            >
              {link.label}
            </a>
          ))}
        </nav>
      </div>

      <p className="mx-auto mt-8 max-w-7xl border-t border-slate-100 px-4 pt-5 text-center text-xs text-slate-400 sm:px-6 lg:px-8">
        © 2026 RematAR. Todos los derechos reservados.
      </p>
    </footer>
  );
}
