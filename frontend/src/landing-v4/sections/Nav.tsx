import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import logoRematar from '../../assets/brand/logo-rematar.png';
import { NAV_LINKS } from '../../features/landing/data';
import { useLandingCta } from '../../features/landing/ctaContext';
import { smoothScrollToHash } from '../../shared/lib/smoothScrollToHash';
import { EASE, INTRO_S } from '../lib';

const LINKS = NAV_LINKS.filter((link) => link.href !== '#inicio');
const SECTION_IDS = LINKS.map((link) => link.href.slice(1));

/** Id de la sección que cruza el tercio superior de la pantalla (para marcar el link activo). */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let current: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);
  return active;
}

/**
 * Barra flotante de vidrio oscuro: legible sobre fotos y sobre papel. Se esconde al bajar y
 * vuelve al subir. En mobile abre un panel a pantalla completa con los links en cascada.
 */
export function Nav() {
  const cta = useLandingCta();
  const active = useActiveSection(SECTION_IDS);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (value) => {
    const previous = scrollY.getPrevious() ?? 0;
    setHidden(value > 160 && value > previous && !open);
  });

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const go = (href: string) => {
    const wasOpen = open;
    setOpen(false);
    window.setTimeout(() => {
      smoothScrollToHash(href);
      window.history.pushState(null, '', href);
    }, wasOpen ? 80 : 0);
  };

  const ctaClasses =
    'lv4-btn inline-flex h-10 items-center rounded-[2px] border border-white bg-white px-5 text-[13.5px] font-medium text-[var(--lv4-ink)] [--lv4-fill:var(--lv4-cobalt)] hover:border-[var(--lv4-cobalt)] hover:text-white';

  return (
    <>
      <motion.header
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: hidden ? '-130%' : 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: EASE, delay: hidden ? 0 : INTRO_S - 0.3 }}
        className="fixed inset-x-0 top-3 z-40 px-3 sm:top-4 sm:px-6"
      >
        <nav
          aria-label="Principal"
          className="mx-auto flex h-14 max-w-[90rem] items-center justify-between gap-6 rounded-[3px] border border-white/12 bg-[var(--lv4-ink)]/55 pl-5 pr-2 backdrop-blur-md sm:pl-6"
        >
          <a
            href="#inicio"
            aria-label="RematAR, ir al inicio"
            onClick={(event) => {
              event.preventDefault();
              go('#inicio');
            }}
            className="shrink-0"
          >
            <img src={logoRematar} alt="RematAR" className="h-6 w-auto brightness-0 invert" />
          </a>

          <ul className="hidden items-center gap-8 lg:flex">
            {LINKS.map((link) => {
              const isActive = active === link.href.slice(1);
              return (
                <li key={link.href} className="relative">
                  <a
                    href={link.href}
                    onClick={(event) => {
                      event.preventDefault();
                      go(link.href);
                    }}
                    className={`block py-1 text-[13.5px] transition-colors duration-300 ${
                      isActive ? 'text-white' : 'text-white/55 hover:text-white'
                    }`}
                  >
                    {link.label}
                  </a>
                  {isActive && (
                    <motion.span
                      layoutId="lv4-nav-line"
                      className="absolute inset-x-0 -bottom-[7px] h-px bg-white"
                      transition={{ type: 'spring', duration: 0.5, bounce: 0.1 }}
                    />
                  )}
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-2">
            {cta.external ? (
              <a href={cta.href} className={ctaClasses}>
                {cta.label}
              </a>
            ) : (
              <Link to={cta.href} className={ctaClasses}>
                {cta.label}
              </Link>
            )}
            <button
              type="button"
              aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="relative h-10 w-10 rounded-[2px] border border-white/20 lg:hidden"
            >
              <span
                className="absolute left-1/2 top-1/2 block h-px w-4 bg-white transition-transform duration-500 [transition-timing-function:var(--lv4-ease)]"
                style={{ transform: `translate(-50%, ${open ? '0' : '-3px'}) rotate(${open ? 45 : 0}deg)` }}
              />
              <span
                className="absolute left-1/2 top-1/2 block h-px w-4 bg-white transition-transform duration-500 [transition-timing-function:var(--lv4-ease)]"
                style={{ transform: `translate(-50%, ${open ? '0' : '3px'}) rotate(${open ? -45 : 0}deg)` }}
              />
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            key="menu"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.7, ease: [0.76, 0, 0.18, 1] }}
            className="fixed inset-0 z-30 flex flex-col justify-center bg-[var(--lv4-ink)] px-8 lg:hidden"
          >
            <ul>
              {LINKS.map((link, index) => (
                <li key={link.href} className="overflow-hidden border-b border-white/12">
                  <motion.a
                    href={link.href}
                    onClick={(event) => {
                      event.preventDefault();
                      go(link.href);
                    }}
                    initial={{ y: '110%' }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.8, ease: EASE, delay: 0.25 + index * 0.06 }}
                    className="lv4-serif block py-4 text-[2.6rem] leading-none text-white"
                  >
                    {link.label}
                  </motion.a>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
