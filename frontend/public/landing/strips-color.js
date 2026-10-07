/* Tiras del manifiesto a color: tilt 3D con el mouse e inclinación según la velocidad del scroll. */
(() => {
  const tiles = [...document.querySelectorAll('.strips .tile')];
  if (!tiles.length) return;
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;


  if (RM) return;

  // Tilt 3D + brillo que sigue al cursor
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    tiles.forEach((t) => {
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        t.style.setProperty('--ry', `${(x - 0.5) * 14}deg`);
        t.style.setProperty('--rx', `${(0.5 - y) * 12}deg`);
        t.style.setProperty('--px', (x - 0.5) * 2);
        t.style.setProperty('--py', (y - 0.5) * 2);
        t.style.setProperty('--gx', `${x * 100}%`);
        t.style.setProperty('--gy', `${y * 100}%`);
      });
      t.addEventListener('pointerleave', () => {
        ['--rx', '--ry', '--px', '--py'].forEach((p) => t.style.setProperty(p, 0));
        t.style.setProperty('--gx', '50%'); t.style.setProperty('--gy', '50%');
      });
    });
  }

  // Las tiras se inclinan según la velocidad del scroll (A y B en sentido contrario)
  if (window.gsap && window.ScrollTrigger) {
    const skewA = gsap.quickTo('#stripA', 'skewX', { duration: 0.6, ease: 'power3.out' });
    const skewB = gsap.quickTo('#stripB', 'skewX', { duration: 0.6, ease: 'power3.out' });
    ScrollTrigger.create({
      trigger: '.strips', start: 'top bottom', end: 'bottom top',
      onUpdate: (s) => { const v = gsap.utils.clamp(-9, 9, s.getVelocity() / -260); skewA(v); skewB(-v); },
      onLeave: () => { skewA(0); skewB(0); }, onLeaveBack: () => { skewA(0); skewB(0); },
    });
    ScrollTrigger.addEventListener('scrollEnd', () => { skewA(0); skewB(0); });
  }
})();
