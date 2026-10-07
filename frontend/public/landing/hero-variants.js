/* Aside animado del hero (pulso de la sala). Escucha 'hero:lot' (lo emite app.js al cambiar de foto). */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = (n) => n.toLocaleString('es-AR');
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const who = () => Math.random().toString(16).slice(2, 4).toUpperCase();
  const H = window.RematarHero; if (!H) return;
  const card = $('.vcard'); if (!card) return;
  const swap = (fn) => { card.classList.add('is-swap'); setTimeout(() => { fn(); card.classList.remove('is-swap'); }, 360); };

  /* C · pulso de la sala: gráfico de la puja subiendo + contadores */
  {
    const W = 320; const Hh = 96; const line = $('#pcLine'); const area = $('#pcArea'); const dot = $('#pcDot');
    let pts = []; let lot = H.lots[H.index]; let timer = null; let count = 0;
    const draw = () => {
      const lo = pts[0] * 0.985; const hi = Math.max(pts[pts.length - 1], lo + lot.step * 6);
      const xy = pts.map((v, i) => [(i / 11) * W, Hh - 8 - ((v - lo) / (hi - lo)) * (Hh - 24)]);
      const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      line.setAttribute('d', d); area.setAttribute('d', `${d} L${xy[xy.length - 1][0].toFixed(1)} ${Hh} L0 ${Hh} Z`);
      dot.setAttribute('cx', xy[xy.length - 1][0]); dot.setAttribute('cy', xy[xy.length - 1][1]);
    };
    const paint = () => {
      $('#pcPrice').textContent = fmt(pts[pts.length - 1]); $('#pcBids').textContent = count;
      $('#pcRoom').textContent = rand(36, 58); $('#pcBidders').textContent = rand(6, 14);
      $('#pcStep').textContent = `+${fmt(lot.step)}`;
    };
    const start = () => {
      clearInterval(timer); pts = [lot.start]; count = 1;
      $('#pcRubro').textContent = lot.rubro; $('#pcName').textContent = lot.lote;
      for (let i = 1; i < 6; i++) { pts.push(pts[i - 1] + lot.step * rand(1, 2)); count++; }
      draw(); paint();
      timer = setInterval(() => {
        if (document.hidden) return;
        pts.push(pts[pts.length - 1] + lot.step * rand(1, 2)); if (pts.length > 12) pts.shift(); count++; draw(); paint();
      }, 1300);
    };
    window.addEventListener('hero:lot', (e) => { lot = e.detail.lot; swap(start); });
    start();
  }
})();
