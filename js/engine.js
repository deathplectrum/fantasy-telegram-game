/* Легенды Средневековья: Долг души — движок визуальной новеллы.
   Данные сюжета: window.STORY_DATA (собирается tools/build_story.py из story/*.md).
   Список готовых картинок: window.ART (js/art.js). Если картинки нет, игра работает без неё. */
(function () {
  'use strict';

  const D = window.STORY_DATA;
  const ART = window.ART || { sprites: [], bg: [] };
  const HAS_SPRITE = new Set(ART.sprites);
  const HAS_BG = new Set(ART.bg);
  const $ = (s) => document.querySelector(s);
  const tg = window.Telegram && window.Telegram.WebApp;

  const KEY = 'lsv1_';
  const store = {
    get(k, d) { try { const v = localStorage.getItem(KEY + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  };

  // ---------- справочники ----------
  const CHAR = {
    belaya: { name: 'Юки', color: 'linear-gradient(135deg,#e9f6ff,#9fd4ff)' },
    iskra: { name: 'Искра', color: 'linear-gradient(135deg,#ffb36b,#ff6f61)' },
    kayra: { name: 'Кайра', color: 'linear-gradient(135deg,#a8f08a,#4fbf7a)' },
    lina: { name: 'Лина', color: 'linear-gradient(135deg,#ffd27a,#ff9a6b)' },
    edrik: { name: 'Эдрик', color: 'linear-gradient(135deg,#fff0b3,#e2b45a)' },
    marta: { name: 'Марта', color: 'linear-gradient(135deg,#ffc9a8,#e8916b)' },
    kotelok: { name: 'Котелок', color: 'linear-gradient(135deg,#c6e48b,#8bb34f)' },
    tissa: { name: 'Тисса', color: 'linear-gradient(135deg,#d7b8ff,#9a72e6)' },
    noel: { name: 'Ноэль', color: 'linear-gradient(135deg,#bfe9ff,#7cb7ff)' },
    valerian: { name: 'Валериан', color: 'linear-gradient(135deg,#ffe28a,#d9893a)' },
    morvena: { name: 'Морвена', color: 'linear-gradient(135deg,#c9a7ff,#6f4fbf)' },
    dragon: { name: 'Дракон', color: 'linear-gradient(135deg,#ff9d8a,#c2413a)' },
    hero: { name: '', color: 'linear-gradient(135deg,#ff8fb8,#a078ff)' },
  };
  // главы, где Кайра в доспехах: облава, Мгла, Солнечный Трон
  const ARMOR_CHAPTERS = [5, 7, 9];
  const AFF_SHOW = ['belaya', 'iskra', 'kayra', 'lina', 'edrik', 'marta', 'kotelok', 'tissa', 'noel'];
  const BG_TINT = {
    black: '#000', void: '#0a0a14', sky: '#3a6fb0', spring: '#2f6b6b', well: '#2a3a4a', temple: '#3a3460', pass: '#5b6b80',
    throne: '#6b4a1a', steps: '#7a5a2a', library: '#4a3424', village: '#4a5a2a', mist: '#5a5a6a', burned: '#3a2420',
    square: '#5a4a3a', capital: '#6a5a40', court: '#4a3a5a', street: '#3a3a4a', snowcity: '#7a8aa0', arena: '#6a4a2a',
    feast: '#6a3a2a', garden: '#2a5a3a', chamber: '#3a2a4a', gate: '#4a4a3a', tavern: '#5a3a1a', room: '#3a2a2a',
    mill: '#5a4a2a', guild: '#4a3a2a', festival: '#7a3a5a', oak: '#2a4a2a', forest: '#1f4a2a', fort: '#4a4a4a',
    swamp: '#2a4a3a', turtle: '#3a5a4a', hut: '#4a3a2a', hospital: '#7a8a9a', kitchen: '#6a5a4a',
  };

  // похожие локации, пока своей картинки нет
  const BG_ALIAS = { swamp: 'forest', hut: 'room', kitchen: 'room', street: 'square', feast: 'tavern' };

  // эмоции по ремаркам в тексте
  const EMO_RULES = [
    ['angry', /(злит|рыч|шип|кричит|орёт|сердит|зло[ ,.)]|в ярост|сжимает кулак|скалит|бесит|рявка|хмур)/i],
    ['blush', /(красне|покрасне|смущ|отводит (взгляд|глаза)|румян|алеет|запина)/i],
    ['sad', /(плач|слёз|слез|всхлип|грустн|печальн|опускает (глаза|голову)|тихо[ ,.)]|горько|дрожит голос)/i],
    ['surprised', /(моргает|удивл|ошараш|вздрагив|замирает|ахает|округля|таращ|что\?!)/i],
    ['happy', /(смеёт|смеет|улыба|хохоч|ухмыл|радост|весело|сияет|фыркает|хихик|подмигив)/i],
  ];

  // ---------- состояние ----------
  let S = null;            // текущая игра
  let busy = false;        // идёт печать текста
  let waiting = null;      // что ждём: 'tap' | 'choice' | 'name' | null
  let typer = null;
  let settings = store.get('settings', { speed: 28, auto: false });
  let autoTimer = null;
  let curSprite = null;
  let bgFront = 0;
  let curBg = null;

  function freshState(ch) {
    return {
      name: 'Рен', path: null, romance: null, mem: 9, aff: {}, iskraHuman: false,
      stack: [{ p: [ch || 0], i: 0 }], ch: ch || 0, bg: null, log: [], ending: null,
    };
  }

  // ---------- навигация по дереву ----------
  function resolve(p) {
    let arr = D.chapters[p[0]].nodes;
    for (let k = 1; k < p.length; k += 3) {
      const node = arr[p[k]];
      const field = p[k + 1];
      const key = p[k + 2];
      if (field === 'o') arr = node.o[key].b;
      else arr = node.v[key];
    }
    return arr || [];
  }

  // ---------- текст ----------
  function partnerName(form) {
    const k = S.path === 'magic';
    const forms = { nom: k ? 'Лина' : 'Кайра', gen: k ? 'Лины' : 'Кайры', ins: k ? 'Линой' : 'Кайрой', dat: k ? 'Лине' : 'Кайре', acc: k ? 'Лину' : 'Кайру' };
    return forms[form] || forms.nom;
  }
  function fill(s) {
    if (!s) return '';
    s = s.replace(/\{(Меч|Магия|Кайра|Лина):\s*([^{}]*?)\s*\/\s*(Меч|Магия|Кайра|Лина):\s*([^{}]*?)\}/g, (m, a, x, b, y) => {
      const pick = (lab) => (lab === 'Меч' && S.path !== 'magic') || (lab === 'Магия' && S.path === 'magic') ||
        (lab === 'Кайра' && S.path !== 'magic') || (lab === 'Лина' && S.path === 'magic');
      return pick(a) ? x : y;
    });
    s = s.replace(/\{Имя\}/g, S.name).replace(/\{ИМЯ\}/g, S.name.toUpperCase())
      .replace(/\{[Нн]апарницей\}/g, partnerName('ins')).replace(/\{[Нн]апарницы\}/g, partnerName('gen'))
      .replace(/\{[Нн]апарнице\}/g, partnerName('dat')).replace(/\{[Нн]апарницу\}/g, partnerName('acc'))
      .replace(/\{[Нн]апарница\}/g, partnerName('nom'))
      .replace(/\{Вторая напарница\}/g, S.path === 'magic' ? 'Кайра' : 'Лина')
      .replace(/Кайра\/Лина/g, partnerName('nom'));
    return s;
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // разбить на сегменты: обычный текст / ремарка *(…)* / курсив *…*
  function segments(s) {
    const out = [];
    const re = /\*\(([^*]+?)\)\*|\*([^*]+?)\*/g;
    let last = 0, m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ t: s.slice(last, m.index), c: '' });
      if (m[1] !== undefined) out.push({ t: '(' + m[1] + ')', c: 'sd' });
      else out.push({ t: m[2], c: 'i' });
      last = re.lastIndex;
    }
    if (last < s.length) out.push({ t: s.slice(last), c: '' });
    return out.map((x) => ({ t: x.t.replace(/\*\*/g, ''), c: x.c }));
  }
  function plain(s) { return segments(s).map((x) => x.t).join(''); }
  function cleanLabel(s) { return plain(fill(s)).replace(/\s*\(−\d Память\)/g, '').replace(/\s+/g, ' ').trim(); }

  function detectEmotion(x) {
    const sd = (x.match(/\*\(([^)]*)\)\*/g) || []).join(' ');
    for (const [emo, re] of EMO_RULES) if (re.test(sd)) return emo;
    if (/!{1}\?|\?!/.test(x)) return 'surprised';
    return null;
  }

  // ---------- вывод ----------
  const elText = $('#text'), elDialog = $('#dialog'), elName = $('#nameplate');

  function typeText(s, cls) {
    elText.className = cls || '';
    elText.innerHTML = '';
    elDialog.classList.remove('done');
    elText.scrollTop = 0;
    const segs = segments(s);
    const spans = segs.map((sg) => {
      const el = document.createElement(sg.c === 'i' ? 'i' : 'span');
      if (sg.c === 'sd') el.className = 'sd';
      elText.appendChild(el);
      return el;
    });
    let si = 0, ci = 0;
    busy = true;
    const speed = settings.speed;
    const finish = () => {
      segs.forEach((sg, k) => { spans[k].textContent = sg.t; });
      clearInterval(typer); typer = null; busy = false;
      elDialog.classList.add('done');
      scheduleAuto();
    };
    if (speed <= 0) { finish(); return finish; }
    typer = setInterval(() => {
      for (let n = 0; n < 2; n++) {
        if (si >= segs.length) { finish(); return; }
        spans[si].textContent = segs[si].t.slice(0, ++ci);
        if (ci >= segs[si].t.length) { si++; ci = 0; }
      }
    }, speed);
    return finish;
  }
  let finishTyping = null;

  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (settings.auto && waiting === 'tap') {
      const len = elText.textContent.length;
      autoTimer = setTimeout(() => { if (waiting === 'tap' && !busy) advance(); }, 1200 + len * 35);
    }
  }

  function setNameplate(name, key) {
    elName.textContent = name || '';
    const c = (CHAR[key] && CHAR[key].color) || 'linear-gradient(135deg,#d8d0ff,#9c8fd6)';
    elName.style.setProperty('--np', c);
  }

  function spriteKey(s) {
    if (!s || s === 'hero') return null;
    if (s === 'partner') s = S.path === 'magic' ? 'lina' : 'kayra';
    if (s === 'iskra' && !S.iskraHuman) return 'fox';
    if (s === 'kayra' && ARMOR_CHAPTERS.includes(S.ch)) return 'kayra-armor';
    return s;
  }
  function showSprite(key, emo) {
    const img = $('#sprite img');
    if (!key || !HAS_SPRITE.has(key)) { img.classList.remove('on', 'dim'); curSprite = null; return; }
    const file = emo && HAS_SPRITE.has(key + '-' + emo) ? key + '-' + emo : key;
    const src = 'art/sprites/' + file + '.webp';
    img.classList.remove('dim');
    if (curSprite !== file) {
      const changedChar = !curSprite || curSprite.split('-')[0] !== key;
      if (changedChar) img.classList.remove('on');
      img.onload = () => { img.classList.add('on'); };
      img.src = src;
      if (!changedChar) { img.classList.remove('bounce'); void img.offsetWidth; img.classList.add('bounce'); }
      curSprite = file;
    } else img.classList.add('on');
  }
  function dimSprite() { $('#sprite img').classList.add('dim'); }
  function hideSprite() { const img = $('#sprite img'); img.classList.remove('on', 'dim'); curSprite = null; }

  function setBg(key, instant) {
    if (key === curBg) return;
    curBg = key; if (S) S.bg = key;
    const layers = document.querySelectorAll('#bg .bg-img');
    const next = layers[1 - bgFront];
    if (!HAS_BG.has(key) && BG_ALIAS[key] && HAS_BG.has(BG_ALIAS[key])) key = BG_ALIAS[key];
    if (HAS_BG.has(key)) {
      next.className = 'bg-img';
      next.style.backgroundImage = 'url(art/bg/' + key + '.webp)';
      next.style.backgroundColor = '';
    } else {
      next.className = 'bg-img bg-fallback';
      next.style.backgroundImage = '';
      const t = BG_TINT[key] || '#3b2c6b';
      next.style.background = 'radial-gradient(120% 80% at 50% 20%, ' + t + ' 0%, #171233 65%, #0b0918 100%)';
    }
    if (instant) next.style.transition = 'none';
    requestAnimationFrame(() => {
      next.classList.add('on');
      layers[bgFront].classList.remove('on');
      bgFront = 1 - bgFront;
      if (instant) requestAnimationFrame(() => { next.style.transition = ''; });
    });
    hideSprite();
  }

  function fx(v) {
    if (v === 'shake') { const g = $('#game'); g.classList.remove('shake'); void g.offsetWidth; g.classList.add('shake'); return; }
    const f = $('#fx'); f.className = 'layer'; void f.offsetWidth; f.classList.add(v);
    if (tg && tg.HapticFeedback && v !== 'dark') try { tg.HapticFeedback.impactOccurred('medium'); } catch (e) { /* */ }
  }

  function toast(msg, cls) {
    const t = document.createElement('div');
    t.className = 'toast' + (cls ? ' ' + cls : '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3300);
  }

  function caption(text) {
    document.querySelectorAll('.scene-cap').forEach((x) => x.remove());
    const c = document.createElement('div');
    c.className = 'scene-cap';
    c.textContent = text.replace(/^Сцена\s+[\d.]+\.\s*/, '');
    $('#game').appendChild(c);
    setTimeout(() => c.remove(), 2600);
  }

  function addLog(who, x, kind) {
    S.log.push({ w: who, x: plain(fill(x)), k: kind });
    if (S.log.length > 150) S.log.shift();
  }

  // ---------- эффекты отношений ----------
  function applyEff(e) {
    if (!e) return;
    for (let k in e) {
      if (k === 'partner') k = S.path === 'magic' ? 'lina' : 'kayra';
      const v = e[k] !== undefined ? e[k] : e.partner;
      if (!v) continue;
      S.aff[k] = (S.aff[k] || 0) + v;
      const nm = (CHAR[k] && CHAR[k].name) || k;
      toast((v > 0 ? '♥ ' : '💔 ') + nm + (v > 0 ? ' запомнит это' : ' недовольна'), v > 0 ? 'gold' : '');
    }
  }

  // ---------- основной цикл ----------
  function step() {
    while (true) {
      const top = S.stack[S.stack.length - 1];
      if (!top) return chapterEnd();
      const arr = resolve(top.p);
      if (top.i >= arr.length) { S.stack.pop(); continue; }
      const idx = top.i++;
      const node = arr[idx];
      if (run(node, top, idx)) return;
    }
  }

  // возвращает true, если нужно ждать игрока
  function run(node, frame, idx) {
    switch (node.t) {
      case 'bg': setBg(node.v); return false;
      case 'fx': fx(node.v); return false;
      case 'scene':
        if (/Сцена\s+5\.5/.test(node.x) || S.ch > 5) S.iskraHuman = true;
        caption(node.x); return false;
      case 'sub': return false;
      case 'eff': applyEff(node.e); return false;
      case 'path': return false;
      case 'name': askName(); return true;
      case 'pv': {
        const v = node[S.path === 'magic' ? 'lina' : 'kayra'];
        return v ? run(v, frame, idx) : false;
      }
      case 'route': {
        const key = S[node.by];
        if (node.v[key]) S.stack.push({ p: frame.p.concat([idx, 'v', key]), i: 0 });
        else if (node.v.none) S.stack.push({ p: frame.p.concat([idx, 'v', 'none']), i: 0 });
        return false;
      }
      case 'choice': showChoice(node, frame, idx); return true;
      case 'n':
        setNameplate('', null); dimSprite();
        addLog('', node.x, 'n');
        say(fill(node.x), 'narr'); return true;
      case 'think':
        setNameplate(S.name + ' · мысли', 'hero'); dimSprite();
        addLog(S.name + ' (про себя)', node.x, 't');
        say(fill(node.x), 'think'); return true;
      case 'sys':
        setNameplate('Система', null); dimSprite();
        addLog('Система', node.x, 's');
        say('〔 ' + fill(node.x) + ' 〕', 'sys'); return true;
      case 'say': {
        const who = fill(node.w).replace(/\s*\(.*\)\s*$/, '');
        const key = spriteKey(node.s);
        let np = node.s === 'partner' ? (S.path === 'magic' ? 'lina' : 'kayra') : node.s;
        if (node.s === 'iskra' && !S.iskraHuman) np = 'iskra';
        setNameplate(fill(node.w), np);
        if (node.s === 'hero') dimSprite();
        else if (key) showSprite(key, detectEmotion(node.x));
        else hideSprite();
        addLog(who, node.x, 'say');
        say(fill(node.x), ''); return true;
      }
      default: return false;
    }
  }

  function say(text, cls) {
    $('#dialog').hidden = false;
    waiting = 'tap';
    finishTyping = typeText(text, cls);
  }

  function advance() {
    if (waiting !== 'tap') return;
    if (busy && finishTyping) { finishTyping(); return; }
    clearTimeout(autoTimer);
    waiting = null;
    step();
    autosave();
  }

  // ---------- выборы ----------
  function showChoice(node, frame, idx) {
    waiting = 'choice';
    clearTimeout(autoTimer);
    const box = $('#choices');
    box.innerHTML = '';
    const q = document.createElement('div');
    q.className = 'q';
    q.textContent = node.romance ? 'С кем ты проведёшь эту ночь?' : node.o.some((o) => o.need || o.k === 'Правда') ? 'Чем закончится история?' : 'Что ты скажешь?';
    box.appendChild(q);
    node.o.forEach((o, oi) => {
      const b = document.createElement('button');
      b.textContent = cleanLabel(o.l);
      const notes = [];
      let locked = false;
      if (o.mem) notes.push('❄ Слово инея · −1 Память (осталось ' + S.mem + ')');
      if (o.need && o.need.romance && S.romance !== o.need.romance) { locked = true; notes.push('Доступно только с Ильвенн'); }
      if (notes.length) { const c = document.createElement('span'); c.className = 'cost'; c.textContent = notes.join(' · '); b.appendChild(c); }
      if (locked) b.classList.add('locked');
      b.onclick = () => pick(node, frame, idx, oi);
      box.appendChild(b);
    });
    box.hidden = false;
  }

  function pick(node, frame, idx, oi) {
    const o = node.o[oi];
    $('#choices').hidden = true;
    S.log.push({ w: '▸ Ты выбрал', x: cleanLabel(o.l), k: 'c' });
    if (o.set) Object.assign(S, o.set);
    if (['Правда', 'Вместе', 'Домой', 'Имя богини'].includes(o.k)) S.ending = o.k;
    if (o.mem) { S.mem = Math.max(0, S.mem - 1); toast('❄ Память −1. Ещё одно воспоминание о доме тает.', ''); }
    applyEff(o.e);
    if (o.b && o.b.length) S.stack.push({ p: frame.p.concat([idx, 'o', oi]), i: 0 });
    waiting = null;
    step();
    autosave();
  }

  // ---------- имя ----------
  function askName() {
    waiting = 'name';
    $('#dialog').hidden = true;
    const p = $('#name-input');
    p.hidden = false;
    const f = $('#name-field');
    f.value = '';
    setTimeout(() => f.focus(), 50);
    $('#name-ok').onclick = () => {
      let v = f.value.trim().replace(/[<>{}]/g, '').slice(0, 16);
      if (!v) v = 'Рен';
      v = v.charAt(0).toUpperCase() + v.slice(1);
      S.name = v;
      p.hidden = true;
      waiting = null;
      step();
      autosave();
    };
    f.onkeydown = (e) => { if (e.key === 'Enter') $('#name-ok').click(); };
  }

  // ---------- главы ----------
  function chapterCard(ch, then) {
    const title = D.chapters[ch].title;
    const m = title.match(/^(.*?)\.\s*«(.+)»$/);
    $('.cc-arc').textContent = m ? m[1] : '';
    $('.cc-title').textContent = m ? m[2] : title;
    $('#chapter-name').textContent = title;
    const cc = $('#chapter-card');
    cc.hidden = true; void cc.offsetWidth; cc.hidden = false;
    setTimeout(() => { cc.hidden = true; then && then(); }, 2500);
  }

  function startChapter(ch) {
    S.ch = ch;
    S.stack = [{ p: [ch], i: 0 }];
    if (ch > 5) S.iskraHuman = true;
    const un = store.get('unlocked', 0);
    if (ch > un) store.set('unlocked', ch);
    store.set('profile', { name: S.name, path: S.path, romance: S.romance, aff: S.aff, mem: S.mem });
    $('#dialog').hidden = true;
    hideSprite();
    autosave();
    chapterCard(ch, () => step());
  }

  function chapterEnd() {
    if (S.ch + 1 < D.chapters.length) { startChapter(S.ch + 1); return; }
    store.set('unlocked', D.chapters.length - 1);
    const ends = store.get('endings', []);
    if (S.ending && !ends.includes(S.ending)) { ends.push(S.ending); store.set('endings', ends); }
    store.set('save_auto', null);
    showEnd();
  }

  function showEnd() {
    $('#dialog').hidden = true; hideSprite();
    openPanel('Конец', (body) => {
      const p = document.createElement('div');
      p.innerHTML = '<p style="margin:0 0 6px;line-height:1.5">Спасибо, что дочитал историю, ' + esc(S.name) + '.</p>' +
        '<p style="margin:0;color:var(--ink-dim)">Концовка: <b style="color:var(--gold)">' + esc(S.ending || '—') + '</b>. Всего концовок четыре, попробуй другие.</p>';
      body.appendChild(p);
      body.appendChild(btn('В главное меню', () => { closePanel(); showTitle(); }, true));
    }, true);
  }

  // ---------- сохранения ----------
  function snapshot() { return JSON.parse(JSON.stringify(S)); }
  function autosave() { if (S) store.set('save_auto', snapshot()); }
  function loadState(s) {
    S = s;
    // повторить последнюю реплику: откатиться на один узел назад
    const top = S.stack[S.stack.length - 1];
    if (top && top.i > 0) top.i--;
    curBg = null;
    hideTitle();
    setBg(S.bg || 'black', true);
    $('#chapter-name').textContent = D.chapters[S.ch].title;
    $('#choices').hidden = true;
    step();
  }

  // ---------- панели ----------
  function btn(label, fn, primary, extra) {
    const b = document.createElement('button');
    b.className = 'glass-btn big' + (primary ? ' primary' : '') + (extra ? ' ' + extra : '');
    b.innerHTML = label;
    b.onclick = fn;
    return b;
  }
  function openPanel(title, build, noClose) {
    const p = $('#panel');
    p.querySelector('.panel-title').textContent = title;
    const body = p.querySelector('.panel-body');
    body.innerHTML = '';
    build(body);
    p.querySelector('.panel-close').hidden = !!noClose;
    p.hidden = false;
    clearTimeout(autoTimer);
  }
  function closePanel() { $('#panel').hidden = true; scheduleAuto(); }
  $('#panel .panel-close').onclick = closePanel;

  function menu() {
    openPanel('Меню', (body) => {
      body.appendChild(btn('Продолжить', closePanel, true));
      body.appendChild(btn('Отношения', relations));
      body.appendChild(btn('Сохранить', () => slots(true)));
      body.appendChild(btn('Загрузить', () => slots(false)));
      body.appendChild(btn('Журнал', showLog));
      body.appendChild(btn('Настройки', settingsPanel));
      body.appendChild(btn('Главное меню', () => { autosave(); closePanel(); showTitle(); }));
    });
  }

  function relations() {
    openPanel('Отношения', (body) => {
      const names = AFF_SHOW.filter((k) => {
        if (k === 'kayra' && S.path === 'magic' && !S.aff.kayra) return false;
        if (k === 'lina' && S.path !== 'magic' && !S.aff.lina) return false;
        return true;
      });
      names.forEach((k) => {
        const v = S.aff[k] || 0;
        const row = document.createElement('div');
        row.className = 'row';
        const n = Math.max(0, Math.min(10, v));
        row.innerHTML = '<span class="nm">' + CHAR[k].name + '</span><span class="hearts">' + '♥'.repeat(n) + '<span style="opacity:.25">' + '♥'.repeat(Math.max(0, 5 - n)) + '</span></span>' + (v < 0 ? ' <small>(' + v + ')</small>' : '');
        body.appendChild(row);
      });
      const mem = document.createElement('div');
      mem.className = 'row';
      mem.innerHTML = '<span class="nm">Память</span><span style="color:var(--accent-2)">' + '❄'.repeat(S.mem) + '</span>';
      body.appendChild(mem);
      if (S.romance) {
        const r = { kayra: 'Кайра', lina: 'Лина', ilvenn: 'Ильвенн', none: 'никто (дружба)' }[S.romance];
        const d = document.createElement('div'); d.className = 'log-line'; d.textContent = 'Сердце: ' + r; body.appendChild(d);
      }
    });
  }

  function slots(saving) {
    openPanel(saving ? 'Сохранить' : 'Загрузить', (body) => {
      const list = [['auto', 'Автосохранение']].concat([1, 2, 3].map((n) => [String(n), 'Слот ' + n]));
      list.forEach(([id, label]) => {
        if (saving && id === 'auto') return;
        const s = store.get('save_' + id, null);
        const info = s ? D.chapters[s.ch].title + ' · ' + s.name : 'пусто';
        const b = btn(label + '<small>' + esc(info) + (s && s.at ? ' · ' + s.at : '') + '</small>', () => {
          if (saving) {
            const snap = snapshot();
            snap.at = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            store.set('save_' + id, snap); toast('Сохранено', 'gold'); slots(true);
          } else if (s) { closePanel(); loadState(s); }
        }, false, 'chapter-btn');
        if (!saving && !s) b.classList.add('locked');
        body.appendChild(b);
      });
    });
  }

  function showLog() {
    openPanel('Журнал', (body) => {
      S.log.slice(-80).forEach((l) => {
        const d = document.createElement('div');
        d.className = 'log-line' + (l.k === 'n' ? ' n' : '');
        d.innerHTML = (l.w ? '<b>' + esc(fill(l.w)) + ':</b> ' : '') + esc(l.x);
        body.appendChild(d);
      });
      setTimeout(() => { body.scrollTop = body.scrollHeight; }, 0);
    });
  }

  function settingsPanel() {
    openPanel('Настройки', (body) => {
      const speeds = [[45, 'Медленно'], [28, 'Обычно'], [12, 'Быстро'], [0, 'Сразу']];
      const row = document.createElement('div'); row.className = 'log-line'; row.textContent = 'Скорость текста'; body.appendChild(row);
      speeds.forEach(([v, l]) => body.appendChild(btn((settings.speed === v ? '● ' : '○ ') + l, () => { settings.speed = v; store.set('settings', settings); settingsPanel(); })));
      body.appendChild(btn((settings.auto ? '● ' : '○ ') + 'Авточтение', () => { settings.auto = !settings.auto; store.set('settings', settings); settingsPanel(); }));
    });
  }

  // ---------- титульный экран ----------
  function snowfall(root) {
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('div');
      s.className = 'snow';
      s.textContent = '❄';
      s.style.left = Math.random() * 100 + '%';
      s.style.fontSize = 8 + Math.random() * 12 + 'px';
      s.style.animationDuration = 7 + Math.random() * 9 + 's';
      s.style.animationDelay = -Math.random() * 12 + 's';
      s.style.opacity = 0.3 + Math.random() * 0.6;
      root.appendChild(s);
    }
  }

  function showTitle() {
    $('#title-screen').hidden = false;
    $('#topbar').hidden = true;
    $('#dialog').hidden = true;
    $('#choices').hidden = true;
    clearTimeout(autoTimer);
    $('#btn-continue').hidden = !store.get('save_auto', null);
    $('#btn-chapters').hidden = store.get('unlocked', 0) < 1;
    const tb = ['title', 'meadow'].find((k) => HAS_BG.has(k));
    if (tb) $('#title-screen .title-art').style.setProperty('--title-bg', 'url(art/bg/' + tb + '.webp)');
  }
  function hideTitle() { $('#title-screen').hidden = true; $('#topbar').hidden = false; }

  function newGame() {
    const go = () => { S = freshState(0); hideTitle(); curBg = null; startChapter(0); };
    if (store.get('save_auto', null)) {
      openPanel('Новая история?', (body) => {
        const d = document.createElement('div'); d.className = 'log-line'; d.textContent = 'Автосохранение перезапишется. Ручные слоты останутся.'; body.appendChild(d);
        body.appendChild(btn('Начать заново', () => { closePanel(); go(); }, true));
        body.appendChild(btn('Отмена', closePanel));
      });
    } else go();
  }

  function chapters() {
    const un = store.get('unlocked', 0);
    const prof = store.get('profile', {});
    openPanel('Главы', (body) => {
      D.chapters.forEach((c, i) => {
        const b = btn(c.title + (i > un ? '<small>ещё не открыта</small>' : ''), () => {
          closePanel();
          S = freshState(i);
          Object.assign(S, prof, { stack: [{ p: [i], i: 0 }], ch: i, log: [], aff: Object.assign({}, prof.aff || {}) });
          if (!S.path) S.path = 'sword';
          hideTitle(); curBg = null; startChapter(i);
        }, false, 'chapter-btn');
        if (i > un) b.classList.add('locked');
        body.appendChild(b);
      });
    });
  }

  // ---------- события ----------
  $('#dialog').addEventListener('click', advance);
  $('#sprite').addEventListener('click', advance);
  $('#game').addEventListener('click', (e) => {
    if (e.target.id === 'game' || e.target.classList.contains('bg-img') || e.target.id === 'fx') advance();
  });
  $('#btn-menu').onclick = (e) => { e.stopPropagation(); menu(); };
  $('#btn-log').onclick = (e) => { e.stopPropagation(); showLog(); };
  $('#btn-new').onclick = newGame;
  $('#btn-continue').onclick = () => { const s = store.get('save_auto', null); if (s) loadState(s); };
  $('#btn-chapters').onclick = chapters;
  document.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && waiting === 'tap' && $('#panel').hidden) { e.preventDefault(); advance(); }
  });

  if (tg) {
    try { tg.ready(); tg.expand(); if (tg.isVersionAtLeast && tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes(); if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) tg.setHeaderColor('#0b0918'); } catch (e) { /* вне Telegram */ }
  }
  snowfall($('#title-screen'));
  setBg('black', true);
  showTitle();

  // для отладки и тестов
  window.VN = { get state() { return S; }, advance, pick: (i) => { const b = document.querySelectorAll('#choices button')[i]; b && b.click(); } };
})();
