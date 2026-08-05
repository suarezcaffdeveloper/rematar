import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { NAV_LINKS } from '../data';
import { useLandingCta } from '../ctaContext';

/**
 * Barra superior fija de la landing pública. Cambia de estilo (fondo sólido + sombra
 * en vez de transparente) pasado un pequeño umbral de scroll, para no depender de
 * IntersectionObserver por un efecto tan simple. Los links de sección usan anclas
 * (`#seccion`) porque la landing es una única página larga, no rutas separadas.
 */
export function LandingNavbar() {
  const cta = useLandingCta();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 16);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        isScrolled ? 'bg-white/85 shadow-sm backdrop-blur-md' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        <a href="#inicio" className="text-lg font-bold tracking-tight text-brand-700">
          RematAR
        </a>

        <nav className="hidden items-center gap-8 md:flex">
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

        <div className="hidden md:block">
          {cta.external ? (
            <a
              href={cta.href}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              {cta.label}
            </a>
          ) : (
            <Link
              to={cta.href}
              className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              {cta.label}
            </Link>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsMobileOpen((open) => !open)}
          className="rounded-lg p-2 text-slate-700 md:hidden"
          aria-label={isMobileOpen ? 'Cerrar menú' : 'Abrir menú'}
        >
          {isMobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {isMobileOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-slate-100 bg-white px-4 pb-4 md:hidden"
        >
          <nav className="flex flex-col gap-1 pt-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {link.label}
              </a>
            ))}
            {cta.external ? (
              <a
                href={cta.href}
                onClick={() => setIsMobileOpen(false)}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                {cta.label}
              </a>
            ) : (
              <Link
                to={cta.href}
                onClick={() => setIsMobileOpen(false)}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
              >
                {cta.label}
              </Link>
            )}
          </nav>
        </motion.div>
      )}
    </motion.header>
  );
}
