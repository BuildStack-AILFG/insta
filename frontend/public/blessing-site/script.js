(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---- mobile nav ---- */
  const burger = $('#burger'), nav = $('#nav');
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  $$('a', nav).forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));

  /* ---- hero slider ---- */
  const slides = $$('.slide'), dots = $('#dots');
  slides.forEach((_, i) => dots.appendChild(Object.assign(document.createElement('i'), { className: i === 0 ? 'on' : '' })));
  let cur = 0;
  const hero = $('.hero'), vid = $('#heroVideo');
  // Hero video plays when the browser allows it; otherwise (blocked, error, reduced motion) the photo slider takes over.
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const useVideo = () => hero.classList.add('has-video');
  const useSlider = () => { hero.classList.remove('has-video'); if (vid) vid.remove(); };
  if (!vid || reduce) useSlider();
  else {
    vid.addEventListener('playing', useVideo, { once: true });
    vid.addEventListener('error', useSlider);
    const p = vid.play(); if (p && p.catch) p.catch(useSlider);
  }
  setInterval(() => {
    if (hero.classList.contains('has-video')) return;
    slides[cur].classList.remove('on'); dots.children[cur].classList.remove('on');
    cur = (cur + 1) % slides.length;
    slides[cur].classList.add('on'); dots.children[cur].classList.add('on');
  }, 5500);

  /* ---- menu ---- */
  const price = (v) => (v === null || v === undefined ? '<span class="na">&ndash;</span>' : typeof v === 'number' ? `<span class="rs">${v}</span>` : esc(v));
  function itemHTML(it, cols) {
    const [name, p1, p2, sp] = it;
    const tag = sp ? '<span class="sp">Special</span>' : '';
    const prices = cols
      ? `<span class="p"><b data-l="${esc(cols[0])}">${price(p1)}</b><b data-l="${esc(cols[1])}">${price(p2)}</b></span>`
      : `<span class="p one"><b>${price(p1)}</b></span>`;
    return `<li class="item"><span class="n">${esc(name)}${tag}</span>${prices}</li>`;
  }
  function groupHTML(g) {
    const head = g.title ? `<div class="group-title"><span>${esc(g.title)}</span></div>` : '';
    return `<div class="group">${head}<ul class="items">${g.items.map((i) => itemHTML(i, g.cols)).join('')}</ul></div>`;
  }
  function thaliHTML(t) {
    return `<div class="thali${t[3] ? ' sp' : ''}"><h4>${esc(t[0])}<span class="p"><span class="rs">${t[1]}</span></span></h4><p>${esc(t[2])}</p></div>`;
  }
  function catHTML(c) {
    const body = c.thalis ? `<div class="thalis">${c.thalis.map(thaliHTML).join('')}</div>` : c.groups.map(groupHTML).join('');
    return `<section class="cat" id="cat-${c.id}"><div class="cat-head"><h3>${esc(c.name)}</h3>${c.blurb ? `<span>${esc(c.blurb)}</span>` : ''}</div>${body}</section>`;
  }

  const tabs = $('#tabs'), body = $('#menu-body'), q = $('#q');
  tabs.innerHTML = MENU.map((c, i) => `<button class="tab${i === 0 ? ' on' : ''}" data-id="${c.id}" role="tab">${esc(c.name)}</button>`).join('');
  let active = MENU[0].id;

  function render() {
    const term = q.value.trim().toLowerCase();
    if (term) {
      // search mode: every matching dish across the whole menu
      const out = [];
      MENU.forEach((c) => {
        if (c.thalis) {
          const m = c.thalis.filter((t) => (t[0] + ' ' + t[2]).toLowerCase().includes(term));
          if (m.length) out.push({ ...c, thalis: m });
          return;
        }
        const groups = c.groups.map((g) => ({ ...g, items: g.items.filter((i) => i[0].toLowerCase().includes(term)) })).filter((g) => g.items.length);
        if (groups.length) out.push({ ...c, groups });
      });
      body.innerHTML = out.length ? out.map(catHTML).join('') : `<p class="empty">No dishes found for &ldquo;${esc(q.value)}&rdquo;. Try another word.</p>`;
      return;
    }
    const c = MENU.find((x) => x.id === active);
    body.innerHTML = catHTML(c);
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    active = b.dataset.id; q.value = '';
    $$('.tab', tabs).forEach((t) => t.classList.toggle('on', t === b));
    render();
    b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    const top = $('#menu .tabs-wrap').getBoundingClientRect().top;
    if (top < 0) $('#menu-body').scrollIntoView({ block: 'start' });
  });
  q.addEventListener('input', () => {
    $$('.tab', tabs).forEach((t) => t.classList.toggle('on', !q.value.trim() && t.dataset.id === active));
    render();
  });
  render();

  /* ---- gallery lightbox ---- */
  const lb = $('#lb'), lbImg = $('img', lb);
  $('#gallery-grid').addEventListener('click', (e) => {
    const g = e.target.closest('.g'); if (!g) return;
    lbImg.src = g.dataset.src; lbImg.alt = $('img', g).alt; lb.hidden = false;
  });
  lb.addEventListener('click', () => { lb.hidden = true; lbImg.src = ''; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lb.hidden = true; });

  /* ---- reveal on scroll ---- */
  const rv = $$('.section-head, .card, .split > *, .room-grid img, .c-card');
  rv.forEach((el) => el.classList.add('rv'));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    rv.forEach((el) => io.observe(el));
  } else rv.forEach((el) => el.classList.add('in'));

  $('#yr').textContent = new Date().getFullYear();
})();
