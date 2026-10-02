import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import logoRematar from '../../assets/brand/logo-rematar.png';
import { smoothScrollToHash } from '../../shared/lib/smoothScrollToHash';
import { NAV_LINKS } from '../../features/landing/data';
import { EASE, PrimaryCta } from '../lib';

/**
 * Barra fija: transparente sobre el hero y vidrio oscuro al scrollear. Una línea azul de
 * progreso de lectura corre por el borde inferior -- el único elemento "de interfaz" que
 * acompaña toda la página. El menú móvil abre en cascada y el ícono morfea a X.
 */
export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.3 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const go = (href: string) => {
    smoothScrollToHash(href);
    window.history.pushState(null, '', href);
    setOpen(false);
  };

  return (
    <motion.header
      initial={{ y: -28, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: EASE, delay: 0.1 }}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,border-color] duration-500 ${
        scrolled || open
          ? 'border-b border-white/10 bg-[var(--lv3-night)]/75 backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-[96rem] items-center justify-between px-5 sm:px-8 lg:px-12">
        <a
          href="#inicio"
          onClick={(event) => {
            event.preventDefault();
            go('#inicio');
          }}
          aria-label="RematAR, ir al inicio"
          className="v3-press"
        >
          <img src={logoRematar} alt="RematAR" className="h-8 w-auto brightness-0 invert" />
        </a>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Secciones">
          {NAV_LINKS.filter((link) => link.href !== '#inicio').map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(event) => {
                event.preventDefault();
                go(link.href);
              }}
              className="v3-press rounded-full px-4 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden sm:block">
            <PrimaryCta className="!h-10 !px-5 !text-sm" />
          </div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="v3-press relative rounded-full p-2.5 text-white ring-1 ring-white/25 lg:hidden"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={open}
          >
            <AnimatePresence initial={false} mode="wait">
              {open ? (
                <motion.span
                  key="close"
                  initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="block"
                >
                  <X className="h-5 w-5" />
                </motion.span>
              ) : (
                <motion.span
                  key="menu"
                  initial={{ rotate: 90, opacity: 0, scale: 0.6 }}
                  animate={{ rotate: 0, opacity: 1, scale: 1 }}
                  exit={{ rotate: -90, opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.22, ease: EASE }}
                  className="block"
                >
                  <Menu className="h-5 w-5" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden lg:hidden"
            aria-label="Secciones"
          >
            <div className="flex flex-col gap-1 px-5 pb-6 pt-2">
              {NAV_LINKS.map((link, index) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    go(link.href);
                  }}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.05 + index * 0.05 }}
                  className="lv3-serif border-b border-white/10 py-3 text-3xl font-light text-white"
                >
                  {link.label}
                </motion.a>
              ))}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay: 0.05 + NAV_LINKS.length * 0.05 }}
                className="mt-5 sm:hidden"
              >
                <PrimaryCta />
              </motion.div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <motion.span
        aria-hidden="true"
        style={{ scaleX: progress }}
        className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand-400"
      />
    </motion.header>
  );
}
