import { Code2, ExternalLink } from 'lucide-react';

/**
 * Footer de la landing: logo, repositorio, LinkedIn, stack resumido, autor. Los links
 * de "Repositorio"/"LinkedIn" apuntan a `#` a propósito -- reemplazar por las URLs
 * reales una vez definidas, no inventar un destino.
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 text-center sm:px-6 lg:px-8">
        <span className="text-lg font-bold text-brand-700">RematAR</span>
        <p className="max-w-md text-sm text-slate-500">
          Plataforma de remates online en tiempo real -- proyecto de portfolio como
          Backend Developer.
        </p>
        <p className="text-xs text-slate-400">
          Python · FastAPI · PostgreSQL · Redis · WebSockets · React · TypeScript
        </p>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com/suarezcaffdeveloper/rematar"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand-700"
          >
            <Code2 className="h-4 w-4" /> Repositorio
          </a>
          <a
            href="https://www.linkedin.com/in/santiago-suarez-482164400/"
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-brand-700"
          >
            <ExternalLink className="h-4 w-4" /> LinkedIn
          </a>
        </div>
        <p className="text-xs text-slate-400">Santiago Suarez</p>
      </div>
    </footer>
  );
}
