/* RematAR — Landing v5 · comportamiento
   GSAP + ScrollTrigger + Lenis. Si las librerías no cargan, la página queda estática y legible. */
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const hasGSAP = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const fmt = (n) => n.toLocaleString('es-AR');
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /* ───────── Datos ───────── */
  const U = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1600&q=80`;
  const IMG = {
    ganado: 'assets/rubros/hacienda.png',
    agricola: 'assets/rubros/maquinaria-agricola-nueva.png',
    vehiculos: 'assets/rubros/vehiculos-nuevo.png',
    pesada: 'assets/rubros/maquinaria-pesada-nueva.png',
    antig: 'assets/rubros/antiguedades.png',
    inmuebles: U('1600585154340-be6161a56a0c'),
    joyas: 'assets/rubros/relojeria.png',
    tecno: 'assets/rubros/tecnologia-hogar.png',
    nautica: U('1567899378494-47b22a2ae96a'),
    indum: U('1441986300917-64674bd600d8'),
    atardecer: 'assets/rubros/atardecer.png',
  };

  const HERO_LOTS = [
    { rubro: 'Hacienda', img: 'assets/rubros/ganaderiav2.jpg', lote: '40 terneros Angus, destete reciente', det: 'Lote 04 · 180 kg promedio · Sanidad al día', start: 34400, step: 400 },
    { rubro: 'Vehículos', img: 'assets/rubros/vehiculosv2.jpg', lote: 'Toyota Hilux 4x4 SRV', det: 'Lote 09 · 2021 · 48.000 km', start: 33900, step: 250 },
    { rubro: 'Maquinaria pesada', img: 'assets/rubros/maquinariapesadav2.jpg', lote: 'Retroexcavadora JCB 3CX', det: 'Lote 12 · 2018 · 4.100 hs de uso', start: 42700, step: 500 },
    { rubro: 'Antigüedades', img: 'assets/rubros/antiguedadesv2.jpg', lote: 'Cómoda de época con tiradores de bronce', det: 'Lote 15 · Circa 1900 · Nogal macizo', start: 2400, step: 50 },
    { rubro: 'Joyas y relojería', img: 'assets/rubros/joyasyrelojeriav2.jpg', lote: 'Reloj de bolsillo en oro, cadena original', det: 'Lote 21 · Circa 1920 · Funcionando', start: 5200, step: 100 },
    { rubro: 'Náutica', img: 'assets/rubros/nauticav2.jpg', lote: 'Velero de 32 pies con motor fuera de borda', det: 'Lote 27 · 2009 · Casco de fibra', start: 28500, step: 300 },
  ];

  const TAPE = [
    ['40 terneros Angus', 'Hacienda', 34400], ['Cosechadora Case IH 2388', 'Maquinaria agrícola', 53000],
    ['Toyota Hilux 4x4 SRV', 'Vehículos', 33900], ['Retroexcavadora JCB 3CX', 'Maquinaria pesada', 42700],
    ['Reloj de pared francés', 'Antigüedades', 3150], ['Casa de dos plantas, 320 m²', 'Inmuebles', 186000],
    ['Lancha Sea Ray 24 pies', 'Náutica', 61500], ['Anillo de oro y esmeralda', 'Joyas', 4800],
  ];

  const ROLES = [
    {
      key: 'empresa', who: 'Empresa', title: 'La empresa arma el remate.', url: 'app.rematar.com/remates', img: 'assets/screenshots/panel-rematador.png',
      desc: 'Fecha, condiciones, catálogo y martillero. Todo se prepara desde un panel y se sigue en tiempo real.',
      items: [['Gestión de remates y lotes', 'Cargá imágenes, descripciones y precios base de cada lote.'], ['Asignación de martilleros', 'Elegí quién conduce cada remate en vivo.'], ['Panel de administración', 'Resultados, adjudicaciones y ventas post-remate en un lugar.']],
      chip: 'Lote 12 cargado',
    },
    {
      key: 'martillero', who: 'Martillero', title: 'El martillero conduce la sala.', url: 'app.rematar.com/remates/gestionar', img: 'assets/screenshots/consola-rematador.png', video: true,
      desc: 'Una consola hecha para una sola cosa: llevar el remate lote por lote, con las pujas y los compradores a la vista.',
      items: [['Consola operativa en vivo', 'Lote actual, pujas y compradores al instante.'], ['Moderación', 'Silenciá, advertí o expulsá sin salir de la consola.'], ['Oferta ganadora en vivo', 'La puja más alta se actualiza para todos en la sala.']],
      chip: 'Adjudicado · Lote 04',
    },
    {
      key: 'comprador', who: 'Comprador', title: 'El comprador ofrece desde donde esté.', url: 'app.rematar.com/remates/sala', img: 'assets/screenshots/sala-en-vivo.png',
      desc: 'Ve el lote, sigue la puja sin recargar y ofrece con un toque. Desde el celular, la tablet o la computadora.',
      items: [['Ofertas en vivo', 'Seguí cómo sube la puja en tiempo real.'], ['Chat de la sala', 'Consultá al martillero sin salir del remate.'], ['Historial de ofertas', 'Repasá cada puja, la tuya y la del resto.']],
      chip: 'Tu oferta lidera',
    },
  ];

  const RUBROS = [
    ['Inmuebles', 'Casas, terrenos y locales', IMG.inmuebles], ['Automotores', 'Utilitarios, camiones y autos', IMG.vehiculos],
    ['Maquinaria pesada', 'Retroexcavadoras y grúas', IMG.pesada], ['Hacienda y campo', 'Hacienda en pie y maquinaria agrícola', IMG.ganado],
    ['Arte y antigüedades', 'Relojes, muebles y coleccionables', IMG.antig], ['Joyas y relojería', 'Piezas únicas y numismática', IMG.joyas],
    ['Tecnología y hogar', 'Equipos, electrodomésticos y más', IMG.tecno], ['Náutica y aviación', 'Embarcaciones y aeronaves', IMG.nautica],
    ['Mercadería', 'Indumentaria y lotes comerciales', IMG.indum],
  ];

  const STEPS = [
    ['Empresa', 'La empresa crea el remate', 'Define fecha, condiciones y reglas del evento.', IMG.inmuebles],
    ['Empresa', 'Carga los lotes', 'Suma imágenes, descripciones y precios base a cada lote.', IMG.pesada],
    ['Empresa', 'Asigna al martillero', 'Designa al operador que conducirá el evento en vivo.', IMG.antig],
    ['Martillero', 'El martillero inicia el remate', 'Entra con sus credenciales a la consola operativa y abre la sala.', IMG.vehiculos],
    ['Comprador', 'Los compradores ingresan', 'Acceden a la sala y ven los lotes disponibles.', IMG.ganado],
    ['Martillero', 'Conduce el remate en vivo', 'Modera y lleva cada lote desde la consola, con las pujas a la vista.', IMG.agricola],
    ['Sistema', 'Se adjudica el lote', 'La oferta ganadora queda registrada y empieza el proceso post-remate.', IMG.atardecer],
  ];

  const SCREENS = [
    ['Remates disponibles', 'El comprador explora los remates en vivo y programados a los que puede sumarse.', 'remates-disponibles', 'remates'],
    ['Detalle del remate', 'Descripción del evento y catálogo de lotes antes de entrar a la sala.', 'remate-detalle-lotes', 'remates/detalle'],
    ['Sala en vivo', 'Oferta actual, puja rápida y chat del remate en tiempo real.', 'sala-en-vivo', 'remates/sala'],
    ['Panel de la empresa', 'Mis remates: estado, creación, métricas globales y accesos rápidos.', 'panel-rematador', 'remates'],
    ['Consola del martillero', 'Moderación y conducción del remate en vivo, con pujas y compradores en directo.', 'consola-rematador', 'remates/gestionar'],
    ['Ventas adjudicadas', 'Seguimiento post-remate: contacto, cobro y entrega de cada lote vendido.', 'ventas-adjudicadas', 'ventas-adjudicadas'],
    ['Gestión de la venta', 'Cambiá el estado, sumá observaciones y subí documentación de cada venta.', 'gestion-venta', 'ventas-adjudicadas/gestion'],
  ];

  const P = {
    radio: '<circle cx="12" cy="12" r="1.8"/><path d="M7.9 7.9a6 6 0 0 0 0 8.2M16.1 7.9a6 6 0 0 1 0 8.2M4.9 4.9a10.2 10.2 0 0 0 0 14.2M19.1 4.9a10.2 10.2 0 0 1 0 14.2"/>',
    chat: '<path d="M4 5h16v11H9.5L4 20.5z"/><path d="M8 9.5h8M8 12.5h5"/>',
    users: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-3.2 2.8-5 5.5-5s5 1.8 5.5 5"/><circle cx="17" cy="8" r="2.2"/><path d="M16 13.2c2.4 0 4 1.5 4.5 4.3"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    layers: '<path d="M12 4l9 5-9 5-9-5z"/><path d="M3 14l9 5 9-5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    device: '<rect x="3" y="5" width="14" height="11" rx="1.5"/><path d="M2 19h16"/><rect x="18" y="9" width="4" height="9" rx="1"/>',
    arrow: '<path d="M7 17L17 7M9 7h8v8"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    left: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const svg = (k, sw = 1.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`;

  const FEATURES = [
    ['radio', 'Remates en tiempo real', 'Cada oferta se actualiza al instante para todos los presentes, sin recargar la página.', 's7'],
    ['chat', 'Chat integrado', 'Comprador y martillero se comunican sin salir de la sala del remate.', 's5'],
    ['users', 'Un panel para cada rol', 'Empresa, martillero y comprador tienen su propia vista, con solo lo que necesitan ver.', ''],
    ['box', 'Gestión de lotes', 'Catálogo con imágenes, precios base y estado de cada lote, de principio a fin.', ''],
    ['shield', 'Moderación y seguridad', 'Validación de participantes y herramientas para mantener el orden durante el evento.', ''],
    ['chart', 'Resultados al instante', 'Adjudicaciones, ventas y métricas de cada remate, siempre a mano.', 's5'],
    ['layers', 'Múltiples rubros', 'Inmuebles, vehículos, hacienda, arte y más: un mismo sistema para cualquier categoría.', 's7'],
    ['clock', 'Seguimiento post-remate', 'El comprador sigue el progreso de su compra hasta la entrega final.', 's6'],
    ['device', 'Desde cualquier dispositivo', 'Participá y administrá remates desde el celular, la tablet o la computadora.', 's6'],
  ];

  const FAQ = [
    ['Compradores', [
      ['¿Cómo entro a un remate privado?', 'Los remates privados no aparecen en el listado público. La empresa te comparte un enlace y un código de acceso: lo ingresás una sola vez y quedás habilitado para entrar a la sala y ofertar.'],
      ['¿Qué es la garantía y cuándo la tengo que pagar?', 'Algunos remates exigen una garantía económica para participar. Se bloquea un monto en tu tarjeta vía Mercado Pago antes de ofertar: no es un pago, es una retención. Si no ganás ningún lote, se libera automáticamente.'],
      ['¿Qué pasa después de que gano un lote?', 'El lote queda registrado a tu nombre y la empresa gestiona el cobro y la entrega. Podés seguir el estado de tu compra desde “Mis compras” hasta la entrega final.'],
    ]],
    ['Empresas', [
      ['¿Puedo hacer un remate solo para clientes invitados?', 'Sí. Al crear el remate elegís si es público o privado. El privado solo se abre con el enlace y el código que generás y compartís vos. La modalidad no se cambia después: si necesitás otra, creás un remate nuevo.'],
      ['¿Qué pasa si un lote no recibe ofertas?', 'Queda como “desierto”. Podés reincorporarlo a la cola con el mismo precio base u otro, sin crear un lote nuevo. Todo queda en el historial de rondas.'],
      ['¿Puedo ver quién participa en tiempo real?', 'Sí. El panel de la empresa muestra cuántos compradores están conectados, quién lidera cada lote y el historial completo de ofertas, actualizado al instante.'],
    ]],
    ['Martilleros', [
      ['¿Necesito instalar algo para conducir un remate?', 'No. La consola funciona desde el navegador, en cualquier dispositivo. La empresa te asigna el remate y entrás con tus credenciales, sin descargas ni configuración.'],
      ['¿Puedo pausar el remate si surge un problema?', 'Sí. Desde la consola pausás y retomás el remate completo. Cada acción queda registrada en el log de auditoría.'],
    ]],
    ['Plataforma', [
      ['¿RematAR cobra comisión por venta?', 'Contactanos para conocer los planes. El modelo se adapta al volumen y al tipo de remates de cada empresa: no hay una tarifa única para todos.'],
      ['¿Puedo probar la plataforma antes de comprometerme?', 'Sí. Escribinos y coordinamos una demo guiada con un remate de prueba, para que veas la experiencia completa de empresa, martillero y comprador.'],
    ]],
  ];

  /* ───────── Render ───────── */
  $$('[data-icon]').forEach((el) => { el.innerHTML = svg(el.dataset.icon, 1.4); });

  // Cinta
  $('#tapeTrack').innerHTML = [...TAPE, ...TAPE, ...TAPE, ...TAPE]
    .map(([n, r, p]) => `<div class="tape__item"><b>${n}</b><span>${r}</span><em>USD ${fmt(p)}</em></div>`).join('');

  // Hero: capas e índice
  const slidesEl = $('#heroSlides');
  slidesEl.innerHTML = HERO_LOTS.map((l, i) => `<div class="hero__slide" data-i="${i}" style="z-index:${i === 0 ? 2 : 1};${i ? 'visibility:hidden' : ''}"><img src="${l.img}" alt="" ${i ? '' : 'fetchpriority="high"'} /></div>`).join('');
  $('#heroIndex').innerHTML = HERO_LOTS.map((l, i) => `<li><button type="button" data-i="${i}" aria-label="Ver lote: ${l.lote}"><span class="bar"><i></i></span><span class="lbl"><b>0${i + 1}</b>${l.rubro}</span></button></li>`).join('');

  // Roles
  $('#rolesTabs').innerHTML = ROLES.map((r, i) => `<button type="button" role="tab" data-i="${i}" aria-selected="${i === 0}">${r.who}</button>`).join('');
  $('#rolesChapters').innerHTML = ROLES.map((r, i) => `
    <article class="chapter${i === 0 ? ' is-active' : ''}" data-i="${i}">
      <p class="chapter__who">${r.who}</p>
      <h3 class="chapter__title">${r.title}</h3>
      <p class="chapter__desc">${r.desc}</p>
      <ul class="chapter__list">${r.items.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
      <div class="chapter__media"><div class="bezel bezel--dark"><div class="bezel__core"><div class="chrome"><i></i><i></i><i></i><span>${r.url}</span></div><img src="${r.img}" alt="Captura: ${r.who}" loading="lazy" /></div></div></div>
    </article>`).join('');
  $('#stageLayers').innerHTML = ROLES.map((r, i) => `<div class="stage__layer${i === 0 ? ' is-active' : ''}" data-i="${i}">${r.video
    ? `<video muted loop playsinline preload="metadata" poster="${r.img}"><source src="assets/videos/consola-rematador-demo.webm" type="video/webm" /><source src="assets/videos/consola-rematador-demo.mp4" type="video/mp4" /></video>`
    : `<img src="${r.img}" alt="" loading="lazy" />`}</div>`).join('');
  $('#stageChips').innerHTML = ROLES.map((r, i) => `<div class="chip chip--${i}${i === 0 ? ' is-active' : ''}" data-i="${i}"><i></i>${r.chip}</div>`).join('');

  // Rubros
  $('#acc').innerHTML = RUBROS.map(([n, ex, img], i) => `
    <button type="button" class="acc__item${i === 3 ? ' is-active' : ''}" role="listitem" aria-expanded="${i === 3}" aria-label="${n}">
      <img src="${img}" alt="" loading="lazy" />
      <span class="acc__idx">0${i + 1}</span>
      <span class="acc__vert">${n}</span>
      <span class="acc__open"><h3>${n}</h3><p>${ex}</p></span>
    </button>`).join('');

  // Proceso
  $('#counterCol').innerHTML = STEPS.map((_, i) => `<span>0${i + 1}</span>`).join('');
  $('#processList').innerHTML = STEPS.map(([who, t, d], i) => `
    <li class="step" data-i="${i}" data-owner="${who}">
      <span class="step__node" aria-hidden="true"></span>
      <span class="step__seg" aria-hidden="true"><i></i></span>
      <div class="step__body">
        <div class="step__head"><span class="step__owner mono">${who}</span></div>
        <h3 class="step__title">${t}</h3>
        <p class="step__desc">${d}</p>
        <span class="step__load" aria-hidden="true"><i></i></span>
      </div>
    </li>`).join('');

  // Pantallas
  $('#rail').innerHTML = SCREENS.map(([t, d, f, u], i) => `
    <article class="shot" data-i="${i}">
      <div class="bezel"><div class="bezel__core"><div class="chrome"><i></i><i></i><i></i><span>app.rematar.com/${u}</span></div><img src="assets/screenshots/${f}.png" alt="Captura: ${t}" loading="lazy" draggable="false" /></div></div>
      <div class="shot__cap"><h3>${t}</h3><p>${d}</p></div>
    </article>`).join('');

  // Funciones
  $('#bento').innerHTML = FEATURES.map(([ic, t, d, s]) => `
    <article class="fcard ${s}"><div class="fcard__core"><span class="fcard__ico">${svg(ic, 1)}</span><div><h3>${t}</h3><p>${d}</p></div></div></article>`).join('');

  // FAQ
  $('#faqTabs').innerHTML = FAQ.map(([g], i) => `<button type="button" role="tab" data-g="${i}" aria-selected="${i === 0}">${g}</button>`).join('');
  $('#faqList').innerHTML = FAQ.map(([, items], g) => items.map(([q, a], i) => `
    <div class="qa${g === 0 ? '' : ' is-hidden'}${g === 0 && i === 0 ? ' is-open' : ''}" data-g="${g}">
      <h3><button class="qa__q" type="button" aria-expanded="${g === 0 && i === 0}"><span>${q}</span><span class="qa__ico" aria-hidden="true"></span></button></h3>
      <div class="qa__a"><div><p>${a}</p></div></div>
    </div>`).join('')).join('');

  // Titulares por líneas (máscara)
  $$('[data-lines]').forEach((el) => {
    el.innerHTML = el.innerHTML.split(/<br\s*\/?>/i).map((l) => `<span class="ln"><span>${l}</span></span>`).join('');
  });

  // Tiras de fotos del manifiesto
  // [nombre, imagen, proporción, ancho (vw), desplazamiento vertical (px)]
  const C = (f) => `assets/carrusel/${f}.jpg`;
  const CARRUSEL_A = [
    ['Vehículos', C('camioneta'), '3/4.4', 16, 0], ['Hacienda', IMG.ganado, '16/10', 26, 60], ['Numismática', C('monedas'), '1/1', 21, 10],
    ['Joyas y relojería', IMG.joyas, '3/4', 15, 80], ['Muebles de época', C('muebles-epoca'), '3/2', 28, 0], ['Inmuebles', IMG.inmuebles, '4/5', 17, 50],
    ['Náutica', IMG.nautica, '16/10', 24, 10],
  ];
  const CARRUSEL_B = [
    ['Arte', C('cuadros'), '16/10', 30, 30], ['Maquinaria agrícola', IMG.agricola, '1/1', 20, 0], ['Indumentaria', C('indumentaria'), '4/5', 18, 70],
    ['Maquinaria pesada', IMG.pesada, '16/10', 27, 10], ['Tecnología', IMG.tecno, '3/4', 15, 60], ['Antigüedades', IMG.antig, '1/1', 22, 0],
    ['Mercadería', IMG.indum, '16/10', 26, 40],
  ];
  const tiles = (arr) => arr.map(([n, src, ar, w, dy]) => `<div class="tile" style="--ar:${ar};--w:${w}vw;--dy:${dy}px"><img src="${src}" alt="" loading="lazy" /><span>${n}</span></div>`).join('');
  $('#stripA').innerHTML = tiles(CARRUSEL_A); $('#stripB').innerHTML = tiles(CARRUSEL_B);

  // Manifiesto por palabras
  const mEl = $('#manifesto');
  mEl.innerHTML = mEl.textContent.trim().split(/\s+/).map((w) => `<span class="w">${w}</span>`).join(' ');

  /* ───────── Interacciones que no dependen de GSAP ───────── */
  // Menú móvil
  const burger = $('.burger'); const menu = $('#menu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open)); burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    menu.classList.toggle('is-open', open); menu.setAttribute('aria-hidden', String(!open));
    document.documentElement.classList.toggle('lenis-stopped', open);
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // Rubros: acordeón
  const accItems = $$('.acc__item');
  const setAcc = (i) => accItems.forEach((it, k) => { it.classList.toggle('is-active', k === i); it.setAttribute('aria-expanded', String(k === i)); });
  accItems.forEach((it, i) => {
    it.addEventListener('click', () => setAcc(i));
    it.addEventListener('focus', () => setAcc(i));
    if (FINE) it.addEventListener('mouseenter', () => setAcc(i));
  });

  // FAQ
  $$('.qa__q').forEach((b) => b.addEventListener('click', () => {
    const qa = b.closest('.qa'); const open = !qa.classList.contains('is-open');
    // Una sola respuesta abierta a la vez: cierra las demás.
    $$('.qa.is-open').forEach((o) => {
      if (o === qa) return;
      o.classList.remove('is-open'); $('.qa__q', o).setAttribute('aria-expanded', 'false');
    });
    qa.classList.toggle('is-open', open); b.setAttribute('aria-expanded', String(open));
    if (hasGSAP) setTimeout(() => ScrollTrigger.refresh(), 650);
  }));
  $$('#faqTabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#faqTabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    $$('.qa').forEach((q) => {
      const show = q.dataset.g === b.dataset.g;
      q.classList.toggle('is-hidden', !show); q.classList.remove('is-open');
      $('.qa__q', q).setAttribute('aria-expanded', 'false');
    });
    const first = $(`.qa[data-g="${b.dataset.g}"]`); first.classList.add('is-open'); $('.qa__q', first).setAttribute('aria-expanded', 'true');
    if (hasGSAP) setTimeout(() => ScrollTrigger.refresh(), 100);
  }));

  // Spotlight de las tarjetas
  $$('.fcard').forEach((c) => c.addEventListener('pointermove', (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
  }));

  // Carrusel circular de pantallas: central nítida, vecinas chicas y borrosas
  const rail = $('#rail'); const shots = $$('.shot', rail);
  const prog = $('#scrProg'); const now = $('#scrNow');
  const scrN = shots.length; const scrHalf = scrN / 2;
  let scrCur = 0; const prevOff = new Array(scrN).fill(null);
  const offsetOf = (i) => { let o = (((i - scrCur) % scrN) + scrN) % scrN; if (o > scrHalf) o -= scrN; return o; };
  const scrRender = () => {
    shots.forEach((s, i) => {
      const o = offsetOf(i); const wrapped = prevOff[i] !== null && Math.abs(o - prevOff[i]) > 2;
      if (wrapped) s.style.transition = 'none';   // salto invisible por detrás, sin barrido a la vista
      s.style.setProperty('--o', o);
      s.dataset.pos = o === 0 ? 'c' : Math.abs(o) === 1 ? (o < 0 ? 'l' : 'r') : 'far';
      s.setAttribute('aria-hidden', o === 0 ? 'false' : 'true');
      if (wrapped) { void s.offsetWidth; s.style.transition = ''; }
      prevOff[i] = o;
    });
    prog.style.transform = `scaleX(${((scrCur + 1) / scrN).toFixed(4)})`;
    now.textContent = `0${scrCur + 1}`;
  };
  const scrGo = (d) => { scrCur = (((scrCur + d) % scrN) + scrN) % scrN; scrRender(); };
  const scrGoTo = (i) => { const o = offsetOf(i); if (o) scrGo(o); };
  scrRender();
  $('#scrPrev').addEventListener('click', () => scrGo(-1));
  $('#scrNext').addEventListener('click', () => scrGo(1));
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); scrGo(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); scrGo(-1); }
  });
  shots.forEach((s, i) => s.addEventListener('click', () => { if (!swallowClick) scrGoTo(i); }));

  // Arrastre / swipe: la pila sigue al dedo y al soltar avanza una pantalla
  let drag = null; let swallowClick = false;
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - drag.y)) {
      drag.moved = true; rail.classList.add('is-drag'); cursor.classList.add('is-down');
    }
    if (drag.moved) rail.style.setProperty('--drag', `${dx * 0.35}px`);
  });
  const endDrag = (e) => {
    if (!drag) return; const { moved, x } = drag; drag = null; cursor.classList.remove('is-down');
    rail.classList.remove('is-drag'); rail.style.setProperty('--drag', '0px');
    if (moved) {
      const dx = (e.clientX ?? x) - x; swallowClick = true; setTimeout(() => { swallowClick = false; }, 60);
      if (Math.abs(dx) > 50) scrGo(dx < 0 ? 1 : -1);
    }
  };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  rail.addEventListener('dragstart', (e) => e.preventDefault());

  // Cursor "Arrastrar"
  const cursor = $('#dragCursor');
  if (FINE) {
    let cx = 0, cy = 0, tx = 0, ty = 0;
    rail.addEventListener('pointerenter', () => cursor.classList.add('is-on'));
    rail.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
    rail.addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; });
    const loop = () => { cx += (tx - cx) * 0.2; cy += (ty - cy) * 0.2; cursor.style.transform = `translate(${cx}px, ${cy}px)`; requestAnimationFrame(loop); };
    loop();
  }

  /* ───────── Hero: subasta simulada + slider ───────── */
  const ghost = () => document.createElement('div'); // variantes de hero sin tarjeta: elementos sueltos que no se muestran
  const lc = $('.lotcard') ? { card: $('.lotcard'), rubro: $('#lcRubro'), name: $('#lcName'), detail: $('#lcDetail'), price: $('#lcPrice'), log: $('#lcLog'), room: $('#lcRoom') } : { card: ghost(), rubro: ghost(), name: ghost(), detail: ghost(), price: ghost(), log: ghost(), room: ghost() };
  let cur = 0; let price = 0; let bidTimer = null; let autoTimer = null; let busy = false;
  const idxBtns = $$('#heroIndex button'); const bars = idxBtns.map((b) => $('.bar i', b));
  const slides = $$('.hero__slide');
  const lotsWrap = (() => { // envuelve rubro/nombre/detalle para animar el cambio
    const w = document.createElement('div'); w.className = 'lotcard__body';
    lc.rubro.before(w); w.append(lc.rubro, lc.name, lc.detail); return w;
  })();

  let shown = 0;
  const setPrice = (v, animate) => {
    if (!hasGSAP || !animate || RM) { lc.price.textContent = fmt(v); shown = v; return; }
    const o = { v: shown }; shown = v;
    gsap.to(o, { v, duration: 0.7, ease: 'power3.out', onUpdate: () => { lc.price.textContent = fmt(Math.round(o.v)); } });
  };
  const pushLog = (amount) => {
    const li = document.createElement('li');
    const who = Math.random().toString(16).slice(2, 4).toUpperCase();
    li.innerHTML = `<span>Postor ••${who}</span><span>USD ${fmt(amount)}</span>`;
    lc.log.prepend(li); while (lc.log.children.length > 3) lc.log.lastChild.remove();
  };
  const startBids = (lot) => {
    clearInterval(bidTimer); price = lot.start; setPrice(price, false); lc.log.innerHTML = ''; pushLog(price);
    bidTimer = setInterval(() => {
      if (document.hidden) return;
      price += lot.step * rand(1, 2); setPrice(price, true); pushLog(price);
      lc.room.textContent = String(rand(36, 58));
    }, 1900);
  };
  const fillCard = (lot) => { lc.rubro.textContent = lot.rubro; lc.name.textContent = lot.lote; lc.detail.textContent = lot.det; };
  window.RematarHero = { lots: HERO_LOTS, index: 0 };
  const announce = () => { window.RematarHero.index = cur; window.dispatchEvent(new CustomEvent('hero:lot', { detail: { index: cur, lot: HERO_LOTS[cur] } })); };
  fillCard(HERO_LOTS[0]); startBids(HERO_LOTS[0]);

  const restartBar = () => {
    bars.forEach((b, i) => { if (!hasGSAP) return; gsap.killTweensOf(b); gsap.set(b, { scaleX: i < cur ? 1 : 0 }); });
    idxBtns.forEach((b, i) => b.classList.toggle('is-active', i === cur));
    if (hasGSAP && HERO_LOTS.length > 1) gsap.to(bars[cur], { scaleX: 1, duration: 3, ease: 'none', onComplete: () => go(cur + 1) });
  };
  const go = (n) => {
    const next = ((n % HERO_LOTS.length) + HERO_LOTS.length) % HERO_LOTS.length;
    // Si todavía termina la transición anterior, no se descarta el pedido: se reprograma el temporizador
    // (antes se perdía y el carrusel quedaba clavado en el último lote).
    if (busy || next === cur) { restartBar(); return; }
    const prev = cur; cur = next; busy = true; restartBar();
    const lot = HERO_LOTS[cur];
    lc.card.classList.add('is-swap');
    setTimeout(() => { fillCard(lot); startBids(lot); lc.card.classList.remove('is-swap'); }, 360);
    announce();
    if (!hasGSAP || RM) { slides.forEach((s, i) => { s.style.visibility = i === cur ? 'visible' : 'hidden'; s.style.zIndex = i === cur ? 2 : 1; }); busy = false; return; }
    const inc = slides[cur]; const out = slides[prev]; const img = $('img', inc);
    gsap.set(inc, { visibility: 'visible', zIndex: 3, clipPath: 'inset(100% 0 0 0)' });
    gsap.set(img, { scale: 1.35, yPercent: 6 });
    gsap.killTweensOf(img);
    // El zoom lento va aparte: dentro de la misma timeline mantenía `busy` activo 7 s y bloqueaba los cambios cada 3 s.
    gsap.to(img, { scale: 1.06, yPercent: 0, duration: 4, ease: 'power2.out' });
    gsap.timeline({ onComplete: () => { gsap.set(out, { visibility: 'hidden', zIndex: 1 }); gsap.set(inc, { zIndex: 2 }); busy = false; } })
      .to(inc, { clipPath: 'inset(0% 0 0 0)', duration: 1.2, ease: 'expo.inOut' }, 0)
      .to($('img', out), { yPercent: -6, duration: 1.2, ease: 'expo.inOut' }, 0);
  };
  idxBtns.forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.i))));
  $('#heroNext').addEventListener('click', () => go(cur + 1));
  $('#heroPrev').addEventListener('click', () => go(cur - 1));

  /* ───────── Si no hay GSAP: fin ───────── */
  if (!hasGSAP) { $$('.manifesto__text .w').forEach((w) => { w.style.opacity = 1; }); return; }

  gsap.registerPlugin(ScrollTrigger);

  // Scroll suave
  let lenis = null;
  if (typeof window.Lenis !== 'undefined' && !RM) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
      const id = a.getAttribute('href'); const t = id.length > 1 ? $(id) : null;
      if (t) { e.preventDefault(); lenis.scrollTo(t, { offset: 0, duration: 1.4 }); }
    }));
  }

  // Barra de progreso + nav: barra completa arriba, píldora compacta al scrollear, se esconde al bajar rápido
  const nav = $('#nav'); const navPill = $('.nav__pill'); let lastY = 0;
  const setCompact = (y) => { const on = nav.classList.contains('is-compact'); if (!on && y > 80) nav.classList.add('is-compact'); else if (on && y < 24) nav.classList.remove('is-compact'); };
  // Ancho natural de la píldora: se mide con las transiciones apagadas para que el ancho tenga un destino en px.
  const measureNav = () => {
    if (innerWidth <= 900) return;
    const compact = nav.classList.contains('is-compact');
    nav.classList.add('is-measuring', 'is-compact');
    nav.style.setProperty('--pill-w', Math.ceil(navPill.getBoundingClientRect().width) + 'px');
    nav.classList.toggle('is-compact', compact);
    void navPill.offsetWidth; nav.classList.remove('is-measuring');
  };
  measureNav(); setCompact(window.scrollY);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureNav);
  addEventListener('resize', measureNav);
  ScrollTrigger.create({
    start: 0, end: 'max', onUpdate: (self) => {
      gsap.set('.progress span', { scaleX: self.progress });
      const y = self.scroll(); setCompact(y); if (Math.abs(y - lastY) > 8) { nav.classList.toggle('is-hidden', y > lastY && y > 600 && !menu.classList.contains('is-open')); lastY = y; }
    },
  });
  // Sección actual marcada en los links del nav
  const navLinks = $$('.nav__links a');
  const secObs = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((a) => { const t = $(a.getAttribute('href')); if (t) secObs.observe(t); });
  const heroEl = $('#inicio'); if (heroEl) new IntersectionObserver(([en]) => { if (en.isIntersecting) navLinks.forEach((a) => a.classList.remove('is-active')); }, { rootMargin: '-45% 0px -50% 0px' }).observe(heroEl);

  // Titulares: entrada por máscara de línea
  $$('[data-lines]').forEach((el) => {
    if (el.classList.contains('hero__title')) return;
    gsap.from($$('.ln > span', el), { yPercent: 112, duration: 1.2, ease: 'expo.out', stagger: 0.09, scrollTrigger: { trigger: el, start: 'top 86%', once: true } });
  });

  // Manifiesto: palabras que se enfocan una a una + tiras que corren en sentidos opuestos
  if (!RM) {
    gsap.fromTo('.manifesto__text .w', { opacity: 0.14, y: 18, filter: 'blur(5px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', ease: 'none', stagger: 0.1, scrollTrigger: { trigger: '.manifesto__text', start: 'top 82%', end: 'bottom 52%', scrub: 0.5 } });
    gsap.fromTo('#stripA', { x: 0 }, { x: () => -Math.max(0, $('#stripA').scrollWidth - innerWidth) * 0.9, ease: 'none', scrollTrigger: { trigger: '.strips', start: 'top bottom', end: 'bottom top', scrub: 0.8, invalidateOnRefresh: true } });
    gsap.fromTo('#stripB', { x: () => -Math.max(0, $('#stripB').scrollWidth - innerWidth) * 0.9 }, { x: 0, ease: 'none', scrollTrigger: { trigger: '.strips', start: 'top bottom', end: 'bottom top', scrub: 0.8, invalidateOnRefresh: true } });
    gsap.from('.tile', { clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: '.strips', start: 'top 90%', once: true } });
  } else { $$('.manifesto__text .w').forEach((w) => { w.style.opacity = 1; }); }

  // Hero: parallax con el mouse y salida con scroll
  if (!RM) {
    if (FINE) {
      const k = Number($('.hero').dataset.parallax) || 1; // intensidad del movimiento con el mouse
      const qx = gsap.quickTo('.hero__slides', 'x', { duration: 1.2, ease: 'power3' });
      const qy = gsap.quickTo('.hero__slides', 'y', { duration: 1.2, ease: 'power3' });
      $('.hero').addEventListener('pointermove', (e) => { qx((e.clientX / innerWidth - 0.5) * -26 * k); qy((e.clientY / innerHeight - 0.5) * -18 * k); });
    }
    gsap.to('.hero__inner', { yPercent: -10, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.closing__bg', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'bottom bottom', scrub: true } });
  }

  // Proceso: los pasos se «cargan» de a uno con el scroll (borrosos y apagados hasta llegar a su turno); el contador suma y el camino se llena
  const steps = $$('.step'); const col = $('#counterCol'); const owner = $('#processOwner');
  const parts = steps.map((s) => ({ s, body: $('.step__body', s), node: $('.step__node', s), seg: $('.step__seg i', s), load: $('.step__load i', s) }));
  const stepP = steps.map(() => 0); let curStep = -1;
  const setCounter = () => {
    let i = 0; stepP.forEach((p, k) => { if (p >= 0.5) i = k; });
    if (i === curStep) return; curStep = i;
    gsap.to(col, { yPercent: -(100 / STEPS.length) * i, duration: 0.75, ease: 'expo.out', overwrite: true });
    owner.textContent = STEPS[i][0];
  };
  const smooth = (p) => p * p * (3 - 2 * p);
  parts.forEach((o, i) => {
    const apply = (p) => {
      const e = smooth(p); stepP[i] = p;
      o.s.classList.toggle('is-done', p >= 0.999); o.s.classList.toggle('is-loading', p > 0.01 && p < 0.999);
      gsap.set(o.load, { scaleX: p });
      if (i > 0) gsap.set(parts[i - 1].seg, { scaleY: e });
      if (!RM) {
        gsap.set(o.body, { opacity: 0.2 + 0.8 * e, y: (1 - e) * 28, filter: `blur(${((1 - e) * 7).toFixed(2)}px)` });
        gsap.set(o.node, { scale: 0.6 + 0.4 * e });
      }
      setCounter();
    };
    if (RM) { apply(1); return; }
    apply(0);
    ScrollTrigger.create({ trigger: o.s, start: 'top 88%', end: 'top 46%', onUpdate: (self) => apply(self.progress), onRefresh: (self) => apply(self.progress) });
  });
  gsap.to('#processBar', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '.process__list', start: 'top 60%', end: 'bottom 60%', scrub: true } });

  // Funciones: entrada escalonada
  if (!RM) gsap.from('.fcard', { opacity: 0, y: 50, duration: 1, ease: 'expo.out', stagger: 0.07, scrollTrigger: { trigger: '.bento', start: 'top 82%', once: true } });

  // Cierre: botones magnéticos
  if (FINE && !RM) $$('.magnetic').forEach((b) => {
    const mx = gsap.quickTo(b, 'x', { duration: 0.6, ease: 'power3' }); const my = gsap.quickTo(b, 'y', { duration: 0.6, ease: 'power3' });
    b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); mx((e.clientX - (r.left + r.width / 2)) * 0.25); my((e.clientY - (r.top + r.height / 2)) * 0.35); });
    b.addEventListener('pointerleave', () => { mx(0); my(0); });
  });

  /* ───────── Roles: escena fijada (solo escritorio y con movimiento) ───────── */
  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    document.documentElement.classList.add('pin-on');
    const chapters = $$('.chapter'); const layers = $$('.stage__layer'); const chips = $$('.chip'); const tabs = $$('#rolesTabs button'); const url = $('#stageUrl');
    const vid = $('video', layers[1]); let active = -1;
    const activate = (i) => {
      if (i === active) return; active = i;
      [chapters, layers, chips].forEach((set) => set.forEach((el, k) => el.classList.toggle('is-active', k === i)));
      tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
      url.textContent = ROLES[i].url;
      if (vid) { if (i === 1) vid.play().catch(() => {}); else vid.pause(); }
    };
    activate(0);
    const st = ScrollTrigger.create({
      trigger: '.roles', start: 'top top', end: () => `+=${innerHeight * 2.6}`, pin: '.roles__sticky', pinSpacing: true, anticipatePin: 1, refreshPriority: 1,
      onUpdate: (self) => activate(Math.min(ROLES.length - 1, Math.floor(self.progress * ROLES.length))),
    });
    // Inclinación suave del marco con el mouse
    let off = null;
    if (FINE) {
      const stage = $('#rolesStage'); const frame = $('.stage__frame');
      const rx = gsap.quickTo(frame, 'rotationY', { duration: 0.9, ease: 'power3' }); const ry = gsap.quickTo(frame, 'rotationX', { duration: 0.9, ease: 'power3' });
      gsap.set(frame, { transformPerspective: 1400 });
      const mv = (e) => { const r = stage.getBoundingClientRect(); rx(((e.clientX - r.left) / r.width - 0.5) * 7); ry(((e.clientY - r.top) / r.height - 0.5) * -5); };
      const lv = () => { rx(0); ry(0); };
      stage.addEventListener('pointermove', mv); stage.addEventListener('pointerleave', lv); off = () => { stage.removeEventListener('pointermove', mv); stage.removeEventListener('pointerleave', lv); };
    }
    const onTab = (e) => { const i = Number(e.currentTarget.dataset.i); const y = st.start + ((i + 0.5) / ROLES.length) * (st.end - st.start); if (lenis) lenis.scrollTo(y, { duration: 1.2 }); else window.scrollTo({ top: y, behavior: 'smooth' }); };
    tabs.forEach((t) => t.addEventListener('click', onTab));
    return () => {
      document.documentElement.classList.remove('pin-on'); tabs.forEach((t) => t.removeEventListener('click', onTab)); if (off) off();
      if (vid) vid.pause();
    };
  });

  /* ───────── Hero: entrada directa (sin pantalla de apertura), con movimiento marcado ───────── */
  const heroLines = $$('.hero__title .ln > span');
  const heroRest = '.hero__sub, .hero__cta .btn, .lotcard, [data-hero-aside], .hero__bar';
  if (RM) { restartBar(); } else {
    gsap.set(heroLines, { yPercent: 118, rotate: 4, transformOrigin: '0% 100%' });
    gsap.set(heroRest, { opacity: 0 });
    gsap.set('.nav__pill', { yPercent: -170 });
    const go0 = () => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: restartBar });
      tl.from('.hero__slides', { opacity: 0, duration: 1.2, ease: 'power2.out' }, 0)
        .to('.nav__pill', { yPercent: 0, duration: 0.9, ease: 'expo.out' }, 0.05)
        .to(heroLines, { yPercent: 0, rotate: 0, duration: 0.95, stagger: 0.09 }, 0.1)
        .fromTo('.hero__sub', { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.75 }, 0.5)
        .fromTo('.hero__cta .btn', { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, stagger: 0.08, ease: 'back.out(1.6)' }, 0.62)
        .fromTo('.lotcard, [data-hero-aside]', { opacity: 0, x: 90, y: 30, rotate: 2.5 }, { opacity: 1, x: 0, y: 0, rotate: 0, duration: 1, ease: 'expo.out' }, 0.45)
        .fromTo('.hero__bar', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.7 }, 0.85);
    };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(go0, go0);
  }

  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
