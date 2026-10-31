// «Легенды Средневековья» — Telegram Mini App.
// Главный экран из «стекла» поверх пиксельного фона, экран снаряжения в пиксельных рамках,
// бой в реальном времени (атака, приём, блок), сюжет сценками, ежедневки, награды, достижения.
// Прогресс хранится в localStorage; без него игра тоже работает, просто не сохраняется.

(function () {
  "use strict";

  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); if (tg.disableVerticalSwipes) tg.disableVerticalSwipes(); } catch (e) { /* не в Telegram */ } }
  const haptic = (kind) => { try { if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred(kind || "light"); } catch (e) { /* ignore */ } };

  const ST = window.STORY;
  const SAVE_KEY = "legendy-sredneveka-save-v3";
  const OLD_KEY = "legendy-sredneveka-save-v2";
  const MAX_LEVEL = 100;
  const MAX_SWITCHES = 3;

  const app = document.getElementById("app");
  const sheetEl = document.getElementById("sheet");
  const toastEl = document.getElementById("toast");

  const ICON = (n) => `assets/icons/${n}.png`;
  const SPR = (n) => `assets/sprites/${n}.png`;
  const ic = (n, cls) => `<img src="${ICON(n)}" alt=""${cls ? ` class="${cls}"` : ""}>`;
  const sp = (n, cls) => `<img src="${SPR(n)}" alt=""${cls ? ` class="${cls}"` : ""}>`;

  // ---------- Данные ----------
  const FACTIONS = {
    sword: {
      name: "Меч", hp: 40, hpL: 12, dmg: 5, dmgL: 2.2, cd: 0.7,
      weaponIcon: "sword", block: "Блок", skill: "Мощный удар", skillMul: 3, skillCd: 7, skillIcon: "skill",
      ranks: ["Оруженосец", "Воин", "Рыцарь", "Паладин"],
      sprites: ["sword1", "sword2", "sword3", "sword4"],
      weaponNames: ["Ржавый меч", "Стальной меч", "Рыцарский клинок", "Клинок зари"],
      desc: "Много здоровья, быстрые удары. Приём — «Мощный удар».",
    },
    magic: {
      name: "Магия", hp: 32, hpL: 11, dmg: 7, dmgL: 2.6, cd: 0.9,
      weaponIcon: "staff", block: "Щит", skill: "Огненный шар", skillMul: 4, skillCd: 9, skillIcon: "fire",
      ranks: ["Ученик", "Маг", "Магистр", "Архимаг"],
      sprites: ["magic1", "magic2", "magic3", "magic4"],
      weaponNames: ["Посох ученика", "Дубовый посох", "Посох бури", "Посох зари"],
      desc: "Сильный урон, меньше здоровья. Приём — «Огненный шар».",
    },
  };
  const rankIdx = (l) => (l >= 70 ? 3 : l >= 40 ? 2 : l >= 15 ? 1 : 0);

  const SLOTS = {
    weapon: { name: "Оружие", dmg: 2 },
    helm: { name: "Шлем", icon: "helm", hp: 8, names: ["Кожаный шлем", "Железный шлем", "Рыцарский шлем", "Шлем зари"] },
    armor: { name: "Доспех", icon: "armor", hp: 12, def: 1, names: ["Стёганка", "Кольчуга", "Латы", "Доспех зари"] },
    amulet: { name: "Амулет", icon: "amulet", dmg: 1, names: ["Медный амулет", "Серебряный амулет", "Лунный амулет", "Амулет зари"] },
    shield: { name: "Щит", icon: "shield", def: 2, names: ["Деревянный щит", "Окованный щит", "Башенный щит", "Щит зари"] },
    boots: { name: "Сапоги", icon: "boots", hp: 5, def: 1, names: ["Старые сапоги", "Кожаные сапоги", "Латные сапоги", "Сапоги зари"] },
  };
  const SLOT_KEYS = Object.keys(SLOTS);
  const tierOf = (l) => (l >= 60 ? 3 : l >= 30 ? 2 : l >= 10 ? 1 : 0);
  const upgradeCost = (l) => Math.round(10 * Math.pow(l, 1.35)) + 5;

  const ARTIFACTS = {
    fang: { name: "Клык вожака", icon: "fang", desc: "+8% к урону", dmg: 0.08 },
    seal: { name: "Печать Белой", icon: "seal", desc: "+15% золота за победы", gold: 0.15 },
    eye: { name: "Ведьмин глаз", icon: "eye", desc: "Приём перезаряжается на 25% быстрее", cdr: 0.25 },
    heart: { name: "Каменное сердце", icon: "heart", desc: "+15% к здоровью", hp: 0.15 },
    scale: { name: "Драконья чешуя", icon: "scale", desc: "−12% входящего урона", red: 0.12 },
    crystal: { name: "Кристалл героя", icon: "crystal", desc: "+6% к урону и здоровью", dmg: 0.06, hp: 0.06 },
  };

  const ZONES = [
    { id: "forest", name: "Тёмный лес", min: 1, max: 10,
      mobs: [
        { name: "Крыса-переросток", sprite: "rat", hp: 0.8, dmg: 0.8, iv: [2.4, 3.6] },
        { name: "Лесной волк", sprite: "wolf", hp: 1, dmg: 1, iv: [2, 3] },
        { name: "Гоблин-разбойник", sprite: "goblin", hp: 1.15, dmg: 1.1, iv: [2.2, 3.2] },
      ],
      boss: { name: "Гоблин-вожак", sprite: "goblin-boss", lvl: 8, iv: [2.6, 3.6], art: "fang" } },
    { id: "road", name: "Старый тракт", min: 10, max: 25,
      mobs: [
        { name: "Разбойник", sprite: "bandit", hp: 1, dmg: 1.05, iv: [2, 3] },
        { name: "Бешеный кабан", sprite: "boar", hp: 1.25, dmg: 0.95, iv: [2.4, 3.4] },
        { name: "Кровавая мышь", sprite: "bat", hp: 0.75, dmg: 0.9, iv: [1.6, 2.4] },
      ],
      boss: { name: "Атаман Кривой Нож", sprite: "ataman", lvl: 22, iv: [2.4, 3.4], art: "seal" } },
    { id: "swamp", name: "Гнилые болота", min: 25, max: 45,
      mobs: [
        { name: "Утопец", sprite: "drowned", hp: 1.2, dmg: 1, iv: [2.4, 3.4] },
        { name: "Болотная жаба", sprite: "toad", hp: 0.9, dmg: 1, iv: [2, 3] },
        { name: "Трясинный змей", sprite: "snake", hp: 0.9, dmg: 1.15, iv: [1.8, 2.8] },
      ],
      boss: { name: "Болотная ведьма", sprite: "witch", lvl: 42, iv: [2.4, 3.2], art: "eye" } },
    { id: "fortress", name: "Горная крепость", min: 45, max: 70,
      mobs: [
        { name: "Скелет-страж", sprite: "skeleton", hp: 1, dmg: 1.05, iv: [2, 3] },
        { name: "Призрак", sprite: "ghost", hp: 0.85, dmg: 1.1, iv: [1.8, 2.8] },
        { name: "Пещерный паук", sprite: "spider", hp: 1.05, dmg: 1, iv: [1.8, 2.6] },
      ],
      boss: { name: "Каменный страж", sprite: "golem", lvl: 66, iv: [2.8, 3.8], art: "heart" } },
    { id: "waste", name: "Пепельная пустошь", min: 70, max: 100,
      mobs: [
        { name: "Огненный бес", sprite: "imp", hp: 0.95, dmg: 1.1, iv: [1.8, 2.8] },
        { name: "Пламенный дух", sprite: "flame", hp: 0.85, dmg: 1.2, iv: [1.8, 2.6] },
        { name: "Пепельный рогач", sprite: "horned", hp: 1.3, dmg: 1, iv: [2.4, 3.4] },
      ],
      boss: { name: "Пепельный дракон", sprite: "dragon", lvl: 90, iv: [2.6, 3.4], art: "scale" } },
  ];
  const zoneById = (id) => ZONES.find((z) => z.id === id) || ZONES[0];

  const POTIONS = {
    strength: { name: "Зелье силы", icon: "pot-red", desc: "+20% к урону на один бой", base: 15 },
    guard: { name: "Зелье защиты", icon: "pot-blue", desc: "−20% входящего урона на один бой", base: 15 },
  };
  const potionPrice = (k) => POTIONS[k].base + S.level * 2;

  const COMPANION = { name: "Искра", sprite: "fox", dmg: 0.1, red: 0.05 };

  const DAILY = {
    easy: [
      { id: "win5", text: "Победи 5 врагов", need: 5, ev: "win" },
      { id: "potion1", text: "Выпей зелье перед боем", need: 1, ev: "potion" },
      { id: "upgrade2", text: "Усиль снаряжение 2 раза", need: 2, ev: "upgrade" },
      { id: "skill6", text: "Используй приём 6 раз", need: 6, ev: "skill" },
      { id: "perfect3", text: "Сделай 3 идеальных блока", need: 3, ev: "perfect" },
    ],
    hard: [
      { id: "boss1", text: "Победи любого босса", need: 1, ev: "boss" },
      { id: "win20", text: "Победи 20 врагов", need: 20, ev: "win" },
      { id: "perfect12", text: "Сделай 12 идеальных блоков", need: 12, ev: "perfect" },
    ],
  };

  const LOGIN_GOLD = [20, 30, 40, 55, 70, 90, 120];

  const ACH = [
    { id: "first", name: "Первая кровь", desc: "Победи первого врага", test: () => S.stats.wins >= 1, gold: 20 },
    { id: "wins50", name: "Закалка", desc: "Победи 50 врагов", test: () => S.stats.wins >= 50, gold: 150 },
    { id: "wins300", name: "Гроза округи", desc: "Победи 300 врагов", test: () => S.stats.wins >= 300, gold: 600 },
    { id: "lvl10", name: "Уже не новичок", desc: "Достигни 10 уровня", test: () => S.level >= 10, gold: 100 },
    { id: "lvl25", name: "Бывалый", desc: "Достигни 25 уровня", test: () => S.level >= 25, gold: 300 },
    { id: "lvl50", name: "Ветеран", desc: "Достигни 50 уровня", test: () => S.level >= 50, gold: 800 },
    { id: "lvl100", name: "Легенда", desc: "Достигни 100 уровня", test: () => S.level >= 100, gold: 3000 },
    { id: "fox", name: "Рыжий хвост", desc: "Найди Искру", test: () => S.companion, gold: 100 },
    { id: "upg25", name: "Подмастерье", desc: "Усиль снаряжение 25 раз", test: () => S.stats.upgrades >= 25, gold: 200 },
    { id: "perfect25", name: "Железная стойка", desc: "Сделай 25 идеальных блоков", test: () => S.stats.perfect >= 25, gold: 250 },
    { id: "bosses", name: "Охотник на чудовищ", desc: "Победи всех пятерых боссов", test: () => ZONES.every((z) => (S.bossKills[z.id] || 0) > 0), gold: 1000 },
    { id: "ending", name: "Чья это история", desc: "Заверши сюжет", test: () => !!S.ending, gold: 1500 },
    { id: "heroic", name: "Героизм", desc: "Победи героического босса", test: () => S.stats.heroic >= 1, gold: 800 },
  ];

  // ---------- Состояние ----------
  function newState() {
    return {
      v: 3, screen: "start", faction: null, name: "Герой", level: 1, xp: 0, gold: 30,
      switches: 0,
      gear: { weapon: 1, helm: 1, armor: 1, amulet: 1, shield: 1, boots: 1 },
      artifacts: [], artifact: null,
      potions: { strength: 1, guard: 0 }, activePotions: [],
      companion: false,
      chapter: 0, chRead: false, chProg: 0,
      ending: null,
      bossKills: {}, heroicKills: {}, bossLoss: 0,
      lastZone: "forest",
      daily: { date: "", quests: [] },
      login: { last: "", streak: 0, claimed: true },
      ach: {},
      stats: { wins: 0, deaths: 0, upgrades: 0, perfect: 0, heroic: 0 },
      tutorial: false,
      log: [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const s = Object.assign(newState(), JSON.parse(raw));
        s.gear = Object.assign(newState().gear, s.gear);
        s.stats = Object.assign(newState().stats, s.stats);
        return s;
      }
      const old = localStorage.getItem(OLD_KEY);
      if (old) {
        // Перенос из прошлой версии: уровень, золото, имя, путь, зелья, лиса.
        const o = JSON.parse(old);
        const s = newState();
        if (o.faction) {
          Object.assign(s, { faction: o.faction, name: o.name || "Герой", level: o.level || 1, xp: o.xp || 0, gold: o.gold || 0, screen: "town", tutorial: true });
          s.potions = Object.assign({ strength: 0, guard: 0 }, o.potions || {});
          if (o.companion) { s.companion = true; s.chapter = 2; s.artifacts = ["fang"]; s.artifact = "fang"; }
        }
        return s;
      }
    } catch (e) { /* хранилище недоступно — играем без сохранения */ }
    return newState();
  }

  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  let S = loadState();
  let fight = null;
  let timers = [];
  let scene = null;      // текущая сценка { lines, i, title, onDone }
  let equipSel = "weapon";
  let tutPage = 0;
  let pendingTrap = false;
  let rafId = 0;

  // ---------- Утилиты ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Math.round(n).toLocaleString("ru-RU");
  const xpNeed = (l) => Math.round(30 + l * l * 2.5 + l * 15);
  const F = () => FACTIONS[S.faction || "sword"];
  const heroSprite = () => F().sprites[rankIdx(S.level)];
  const rankName = () => F().ranks[rankIdx(S.level)];
  const art = () => (S.artifact && ARTIFACTS[S.artifact]) || {};
  const dayStr = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const today = () => dayStr(new Date());
  const yesterday = () => dayStr(new Date(Date.now() - 864e5));

  function itemName(slot, lvl) {
    if (slot === "weapon") return F().weaponNames[tierOf(lvl)];
    return SLOTS[slot].names[tierOf(lvl)];
  }
  function itemIcon(slot) { return slot === "weapon" ? F().weaponIcon : SLOTS[slot].icon; }

  // Характеристики героя (без зелий). gear можно подменить для предпросмотра улучшения.
  function calc(gear) {
    gear = gear || S.gear;
    const f = F(); const a = art();
    let dmg = f.dmg + f.dmgL * S.level, hp = f.hp + f.hpL * S.level, def = 0;
    for (const k of SLOT_KEYS) {
      const sl = SLOTS[k], l = gear[k];
      dmg += (sl.dmg || 0) * l; hp += (sl.hp || 0) * l; def += (sl.def || 0) * l;
    }
    dmg *= 1 + (S.companion ? COMPANION.dmg : 0) + (a.dmg || 0);
    hp *= 1 + (a.hp || 0);
    const defPct = Math.min(0.6, def / (def + 50 + S.level * 3));
    return { dmg: Math.round(dmg), hp: Math.round(hp), def: Math.round(def), defPct, power: Math.round(dmg * 6 + hp + def * 10) };
  }
  function incomingMul() {
    const c = calc(); const a = art();
    return (1 - c.defPct) * (1 - (S.companion ? COMPANION.red : 0)) * (1 - (a.red || 0)) * (S.activePotions.includes("guard") ? 0.8 : 1);
  }
  function fightDmg() { return calc().dmg * (S.activePotions.includes("strength") ? 1.2 : 1); }

  function pushLog(t) { S.log.unshift(t); S.log = S.log.slice(0, 40); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  // ---------- Ежедневное ----------
  function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function ensureDaily() {
    const t = today();
    if (S.daily.date === t) return;
    const h = hash(t + S.name);
    const e = DAILY.easy.slice();
    const a = e.splice(h % e.length, 1)[0];
    const b = e[(h >>> 8) % e.length];
    const c = DAILY.hard[(h >>> 16) % DAILY.hard.length];
    S.daily = { date: t, quests: [a, b, c].map((q, i) => ({ id: q.id, hard: i === 2, p: 0, claimed: false })) };
  }
  const questDef = (q) => (q.hard ? DAILY.hard : DAILY.easy).find((d) => d.id === q.id);

  function ensureLogin() {
    const t = today();
    if (S.login.last === t) return;
    S.login.streak = S.login.last === yesterday() ? (S.login.streak % 7) + 1 : 1;
    S.login.last = t;
    S.login.claimed = false;
  }
  const loginGold = (day) => Math.round(LOGIN_GOLD[day - 1] * (1 + S.level / 10));

  function track(ev, n) {
    n = n || 1;
    ensureDaily();
    for (const q of S.daily.quests) {
      const d = questDef(q);
      if (d && d.ev === ev && !q.claimed && q.p < d.need) {
        q.p = Math.min(d.need, q.p + n);
        if (q.p >= d.need) toast(`Задание гильдии выполнено: ${d.text}`);
      }
    }
  }

  function checkAch() {
    for (const a of ACH) {
      if (!S.ach[a.id] && a.test()) {
        S.ach[a.id] = true;
        S.gold += a.gold;
        pushLog(`Достижение «${a.name}»: +${a.gold} золота.`);
        toast(`🏆 Достижение: ${a.name} (+${a.gold} 🪙)`);
      }
    }
  }

  // ---------- Сюжет ----------
  const chapter = () => ST.CHAPTERS[S.chapter] || null;
  function chapterState() {
    const c = chapter();
    if (!c) return "finished";
    if (S.level < c.lvl) return "locked";
    if (!S.chRead) return "new";
    if (c.goal.type === "kills" && S.chProg >= c.goal.n) return "complete";
    if (c.goal.type === "boss" && S.chProg >= 1) return "complete";
    if (c.goal.type === "choice") return "choice";
    return "active";
  }
  function storyOnWin(zoneId, isBoss) {
    const c = chapter();
    if (!c || !S.chRead || S.level < c.lvl) return;
    const was = chapterState();
    if (c.goal.type === "kills" && c.goal.zone === zoneId && !isBoss) S.chProg++;
    if (c.goal.type === "boss" && c.goal.zone === zoneId && isBoss) S.chProg = 1;
    if (was !== "complete" && chapterState() === "complete") toast("📜 Глава выполнена! Загляни в «Задания».");
  }

  function playScene(lines, title, onDone) {
    scene = { lines, i: 0, title: title || "", onDone };
    S.screen = "scene";
    closeSheet();
    render();
  }
  function sceneNext() {
    if (!scene) return;
    const line = scene.lines[scene.i];
    if (line && line.choice) return; // ждём выбор
    scene.i++;
    if (scene.i >= scene.lines.length) return sceneEnd();
    renderScene();
  }
  function sceneEnd() {
    const done = scene && scene.onDone;
    scene = null;
    S.screen = S.faction ? "town" : "start";
    if (done) done(); else { saveState(); render(); }
  }

  function readChapter() {
    const c = chapter();
    playScene(c.scene, `Глава ${S.chapter + 1}. ${c.title}`, () => {
      S.chRead = true;
      S.chProg = S.chProg || 0;
      S.screen = "town";
      saveState();
      render();
      if (c.goal.type !== "choice") openSheet(questsHtml());
    });
  }
  function completeChapter() {
    const c = chapter();
    const finish = () => {
      if (c.reward.gold) S.gold += c.reward.gold;
      if (c.reward.companion && !S.companion) S.companion = true;
      pushLog(`Глава «${c.title}» завершена. +${c.reward.gold || 0} золота.`);
      S.chapter++; S.chRead = false; S.chProg = 0;
      checkAch();
      S.screen = "town";
      saveState();
      render();
      toast(`Глава завершена: +${c.reward.gold} 🪙`);
    };
    if (c.after) playScene(c.after, `Глава ${S.chapter + 1}. ${c.title}`, finish);
    else finish();
  }
  function finishEnding(key) {
    const e = ST.ENDINGS[key];
    playScene(e.lines, e.title, () => {
      const c = chapter();
      S.ending = key;
      S.gold += c ? c.reward.gold : 0;
      S.chapter = ST.CHAPTERS.length; S.chRead = false; S.chProg = 0;
      pushLog(`${e.title}. Открыты героические боссы.`);
      checkAch();
      S.screen = "town";
      saveState();
      render();
    });
  }

  // ---------- Панели ----------
  let sheetModal = false;
  function openSheet(html, modal) {
    sheetModal = !!modal;
    sheetEl.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
    sheetEl.hidden = false;
  }
  function closeSheet() { sheetEl.hidden = true; sheetEl.innerHTML = ""; sheetModal = false; }
  const head = (title, icon) => `<div class="sheet-head">${icon ? ic(icon) : ""}<h2>${title}</h2><button class="x" data-act="close-sheet" aria-label="Закрыть">✕</button></div>`;

  function heroHtml() {
    const c = calc(); const need = xpNeed(S.level);
    const pct = S.level >= MAX_LEVEL ? 100 : Math.min(100, (S.xp / need) * 100);
    const other = S.faction === "sword" ? "magic" : "sword";
    const left = MAX_SWITCHES - S.switches;
    return `${head(esc(S.name), "helm")}
      <div class="line">${sp(heroSprite())}<div class="grow"><b>${F().name} · ${rankName()}</b><span class="muted">Уровень ${S.level} из ${MAX_LEVEL}</span></div></div>
      <div class="bar xp"><i style="width:${pct}%"></i></div>
      <div class="muted" style="margin-top:4px">${S.level >= MAX_LEVEL ? "Максимальный уровень!" : `Опыт: ${fmt(S.xp)} / ${fmt(need)}`}</div>
      <div class="stat-grid">
        <div>Урон<b>${fmt(c.dmg)}</b></div><div>Здоровье<b>${fmt(c.hp)}</b></div>
        <div>Защита<b>${fmt(c.def)} <small class="muted">(−${Math.round(c.defPct * 100)}%)</small></b></div><div>Мощь<b>${fmt(c.power)}</b></div>
        <div>Побед<b>${fmt(S.stats.wins)}</b></div><div>Идеальных блоков<b>${fmt(S.stats.perfect)}</b></div>
      </div>
      ${S.companion ? `<div class="line">${sp("fox")}<div class="grow"><b>Искра</b><span class="muted">Всегда рядом: +10% к урону, −5% к урону по тебе</span></div></div>` : `<div class="muted">Зверь-спутник встретится тебе по сюжету.</div>`}
      <div class="card" style="margin-top:10px"><h3>Сменить путь</h3>
        <div class="muted">Можно ещё ${left} раз(а). Уровень и снаряжение сохраняются.</div>
        <button class="btn small" style="margin-top:8px;width:100%" data-act="ask-switch" ${left <= 0 ? "disabled" : ""}>${ic(FACTIONS[other].weaponIcon)} Перейти на путь «${FACTIONS[other].name}»</button>
      </div>`;
  }

  function settingsHtml() {
    return `${head("Настройки")}
      <div class="card"><h3>Имя героя</h3>
        <input class="name-input" id="name-input" maxlength="20" value="${esc(S.name)}">
        <button class="btn small" style="margin-top:8px;width:100%" data-act="save-name">Сохранить имя</button></div>
      <button class="btn" data-act="tutorial">${ic("book")} Как играть</button>
      <div style="height:10px"></div>
      <button class="btn" data-act="credits">${ic("scroll")} Откуда картинки</button>
      <div style="height:10px"></div>
      <button class="btn red-btn" data-act="ask-reset">Начать игру заново</button>`;
  }

  function creditsHtml() {
    return `${head("Откуда картинки")}
      <div class="muted" style="margin-bottom:8px">Вся графика — из открытых наборов с лицензией CC0 (общественное достояние).</div>
      <div class="line"><div class="grow"><b>Фон</b><span class="muted">SunnyLand Woods — ansimuz, opengameart.org</span></div></div>
      <div class="line"><div class="grow"><b>Предметы и значки</b><span class="muted">496 pixel art icons — 7Soul1, opengameart.org</span></div></div>
      <div class="line"><div class="grow"><b>Герои и часть врагов</b><span class="muted">Tiny Dungeon — Kenney, kenney.nl</span></div></div>
      <div class="line"><div class="grow"><b>Богиня, лиса, монстры</b><span class="muted">Tiny Creatures — Clint Bellanger, itch.io</span></div></div>
      <div class="line"><div class="grow"><b>Шрифты</b><span class="muted">Press Start 2P, Pixelify Sans — Google Fonts (OFL)</span></div></div>`;
  }

  function confirmHtml(title, text, act, label) {
    return `${head(title)}<div class="muted" style="margin-bottom:12px;font-size:15px">${text}</div>
      <div class="btn-row"><button class="btn" data-act="close-sheet">Отмена</button><button class="btn red-btn" data-act="${act}">${label}</button></div>`;
  }

  function logHtml() {
    return `${head("Журнал", "book")}${S.log.length ? S.log.map((l) => `<div class="line"><div class="grow">${esc(l)}</div></div>`).join("") : '<div class="muted">Пока тихо.</div>'}`;
  }

  function shopHtml() {
    const rows = Object.entries(POTIONS).map(([k, p]) => {
      const price = potionPrice(k);
      return `<div class="line">${ic(p.icon)}<div class="grow"><b>${p.name} <span class="muted">× ${S.potions[k] || 0}</span></b><span class="muted">${p.desc}</span></div>
        <button class="btn small" data-act="buy" data-potion="${k}" ${S.gold < price ? "disabled" : ""}>${price} 🪙</button></div>`;
    }).join("");
    const drink = Object.entries(POTIONS).map(([k, p]) => {
      const active = S.activePotions.includes(k);
      const full = S.activePotions.length >= 2;
      return `<div class="line">${ic(p.icon)}<div class="grow"><b>${p.name}</b><span class="muted">${active ? "Выпито, действует в следующем бою" : `В запасе: ${S.potions[k] || 0}`}</span></div>
        <button class="btn small" data-act="drink" data-potion="${k}" ${active || full || !S.potions[k] ? "disabled" : ""}>${active ? "✓" : "Выпить"}</button></div>`;
    }).join("");
    return `${head("Лавка", "potion")}
      <div class="muted" style="margin-bottom:6px">У тебя ${fmt(S.gold)} 🪙. Никаких покупок за деньги — только за игровое золото.</div>
      <div class="card">${rows}</div>
      <div class="card"><h3>Перед боем (${S.activePotions.length}/2)</h3>
        <div class="muted">В бою пить нельзя. Максимум два: одно силы и одно защиты.</div>${drink}</div>`;
  }

  function artifactsHtml() {
    const rows = Object.entries(ARTIFACTS).map(([k, a]) => {
      const has = S.artifacts.includes(k);
      const on = S.artifact === k;
      return `<div class="line" style="${has ? "" : "opacity:.45"}">${ic(a.icon)}<div class="grow"><b>${has ? a.name : "???"}</b><span class="muted">${has ? a.desc : "Выпадает с босса"}</span></div>
        ${has ? `<button class="btn small" data-act="equip-art" data-art="${k}" ${on ? "disabled" : ""}>${on ? "Надет" : "Надеть"}</button>` : ""}</div>`;
    }).join("");
    return `${head("Артефакты", "rings")}<div class="muted" style="margin-bottom:6px">Носить можно один. Каждый босс при первой победе отдаёт свой артефакт.</div><div class="card">${rows}</div>`;
  }

  function questsHtml() {
    const c = chapter(); const st = chapterState();
    let main;
    if (st === "finished") {
      main = `<div class="card"><h3>История окончена</h3><div class="muted">Ты прошёл «Долг души». Героические боссы ждут в меню «В бой».</div></div>`;
    } else {
      const g = c.goal;
      let prog = "";
      if (g.type === "kills") prog = ` (${Math.min(S.chProg, g.n)}/${g.n})`;
      if (g.type === "boss") prog = S.chProg ? " ✓" : "";
      const btn = {
        locked: `<div class="muted" style="margin-top:6px">🔒 Откроется на ${c.lvl} уровне.</div>`,
        new: `<button class="btn gold-btn" style="margin-top:10px" data-act="read-chapter">${ic("book")} Читать главу</button>`,
        active: `<div class="muted" style="margin-top:6px">Цель: ${g.text}${prog}</div><button class="btn small" style="margin-top:8px;width:100%" data-act="read-chapter">Перечитать</button>`,
        complete: `<div class="muted" style="margin-top:6px">Цель выполнена: ${g.text} ✓</div><button class="btn gold-btn" style="margin-top:10px" data-act="complete-chapter">Завершить главу</button>`,
        choice: `<button class="btn gold-btn" style="margin-top:10px" data-act="read-chapter">Сделать выбор</button>`,
      }[st];
      main = `<div class="card ${st === "locked" ? "lock" : ""}"><div class="muted">Глава ${S.chapter + 1} из ${ST.CHAPTERS.length}</div><h3>${c.title}</h3>${btn}</div>`;
    }
    const done = ST.CHAPTERS.slice(0, Math.min(S.chapter, ST.CHAPTERS.length - 1)).map((ch, i) =>
      `<div class="line"><div class="grow"><b>${i + 1}. ${ch.title}</b></div><button class="btn small" data-act="replay" data-ch="${i}">▶</button></div>`).join("");
    return `${head("Задания", "scroll")}<div class="muted" style="margin-bottom:6px">Сюжет «Долг души»</div>${main}${done ? `<div class="card"><h3>Прочитано</h3>${done}</div>` : ""}`;
  }

  function guildHtml() {
    ensureDaily();
    const rows = S.daily.quests.map((q, i) => {
      const d = questDef(q);
      const ready = q.p >= d.need && !q.claimed;
      const r = rewardOf(q);
      return `<div class="line">${ic(q.hard ? "trophy" : "scroll")}<div class="grow"><b>${q.hard ? "Тяжёлое: " : ""}${d.text}</b>
        <span class="muted">${q.claimed ? "Награда получена" : `${q.p}/${d.need} · награда ${fmt(r.gold)} 🪙 и ${fmt(r.xp)} опыта${q.hard ? " + зелье" : ""}`}</span>
        <div class="bar mini xp"><i style="width:${(q.p / d.need) * 100}%"></i></div></div>
        <button class="btn small" data-act="claim-daily" data-i="${i}" ${ready ? "" : "disabled"}>${q.claimed ? "✓" : "Забрать"}</button></div>`;
    }).join("");
    return `${head("Гильдия", "shield")}<div class="muted" style="margin-bottom:6px">Задания на сегодня: два лёгких и одно тяжёлое. Завтра будут новые.</div><div class="card">${rows}</div>`;
  }
  function rewardOf(q) {
    const need = xpNeed(S.level);
    return q.hard ? { gold: 80 + S.level * 10, xp: Math.round(need * 0.35) } : { gold: 20 + S.level * 4, xp: Math.round(need * 0.12) };
  }

  function rewardsHtml() {
    ensureLogin();
    const days = LOGIN_GOLD.map((g, i) => {
      const d = i + 1; const cur = d === S.login.streak;
      const got = d < S.login.streak || (cur && S.login.claimed);
      return `<div style="flex:1;text-align:center;padding:6px 0;border-radius:12px;background:${cur ? "rgba(255,209,102,.25)" : "rgba(255,255,255,.08)"};font-size:11px">
        <div>День ${d}</div>${ic(d === 7 ? "chest" : "coins")}<div>${got ? "✓" : fmt(loginGold(d))}</div></div>`;
    }).join("");
    const achRows = ACH.map((a) => `<div class="line" style="${S.ach[a.id] ? "" : "opacity:.5"}">${ic(S.ach[a.id] ? "trophy" : "key")}<div class="grow"><b>${a.name}</b><span class="muted">${a.desc} · ${a.gold} 🪙</span></div>${S.ach[a.id] ? "✓" : ""}</div>`).join("");
    return `${head("Награды", "amulet")}
      <div class="card"><h3>За вход каждый день</h3><div style="display:flex;gap:4px;margin:8px 0" class="login-days">${days.replace(/<img /g, '<img style="width:24px;height:24px;display:block;margin:2px auto" ')}</div>
        <button class="btn gold-btn" data-act="claim-login" ${S.login.claimed ? "disabled" : ""}>${S.login.claimed ? "Приходи завтра" : `Забрать награду дня ${S.login.streak}`}</button>
        <div class="muted" style="margin-top:6px">Седьмой день — сундук с золотом и двумя зельями.</div></div>
      <div class="card"><h3>Достижения (${ACH.filter((a) => S.ach[a.id]).length}/${ACH.length})</h3>${achRows}</div>`;
  }

  function zonesHtml() {
    const cards = ZONES.map((z) => {
      const open = S.level >= z.min || z.id === "forest";
      const c = chapter();
      const story = c && S.chRead && c.goal.zone === z.id && chapterState() === "active";
      const b = z.boss;
      const danger = b.lvl >= S.level + 5;
      const heroic = !!S.ending;
      return `<div class="card ${open ? "" : "lock"}">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><h3>${z.name}${story ? " <span class='gold'>★ сюжет</span>" : ""}</h3><span class="muted">ур. ${z.min}–${z.max}</span></div>
        <div class="sprites-row">${z.mobs.map((m) => sp(m.sprite)).join("")}<span style="flex:1"></span>${sp(b.sprite)}</div>
        ${open ? `<div class="zone-btns"><button class="btn small" data-act="fight" data-zone="${z.id}">${ic(F().weaponIcon)} Сражаться</button>
          <button class="btn small" data-act="boss" data-zone="${z.id}">${ic("skill")} Босс · ур. ${b.lvl}</button>
          ${heroic ? `<button class="btn small gold-btn" data-act="heroic" data-zone="${z.id}">Героический · ур. ${Math.min(115, b.lvl + 15)}</button>` : ""}</div>
          ${danger ? `<div class="warn-note">⚠ ${b.name} сильнее тебя на ${b.lvl - S.level} ур. При поражении — шанс 15% потерять улучшения одного предмета.</div>` : ""}`
        : `<div class="muted" style="margin-top:6px">🔒 Откроется на ${z.min} уровне.</div>`}
      </div>`;
    }).join("");
    return `${head("Куда идём?", F().weaponIcon)}
      <div class="line" style="margin-bottom:6px">${ic("potion")}<div class="grow"><b>Зелья перед боем: ${S.activePotions.length}/2</b><span class="muted">${S.activePotions.map((k) => POTIONS[k].name).join(", ") || "ничего не выпито"}</span></div><button class="btn small" data-act="open-shop">Лавка</button></div>
      ${cards}`;
  }

  function tutorialHtml() {
    const t = ST.TUTORIAL[tutPage];
    const last = tutPage >= ST.TUTORIAL.length - 1;
    return `<div class="tut"><div class="who">${sp("marta")}Марта · совет ${tutPage + 1}/${ST.TUTORIAL.length}</div><p>${esc(t[0])}</p></div>
      <div class="btn-row">${tutPage > 0 ? `<button class="btn" data-act="tut-prev">Назад</button>` : ""}<button class="btn gold-btn" data-act="${last ? "tut-done" : "tut-next"}">${last ? "Понятно!" : "Дальше"}</button></div>`;
  }

  // ---------- Экраны ----------
  function render() {
    stopRaf();
    document.body.classList.toggle("in-equip", S.screen === "equip");
    if (S.screen === "start") return renderStart();
    if (S.screen === "faction") return renderFaction();
    if (S.screen === "name") return renderName();
    if (S.screen === "scene") return renderScene();
    if (S.screen === "equip") return renderEquip();
    if (S.screen === "fight") return renderFight();
    return renderTown();
  }

  function renderStart() {
    app.innerHTML = `<div class="center-col">
      <div class="glass dark title-card">
        <h1>ЛЕГЕНДЫ<br>СРЕДНЕВЕКОВЬЯ</h1>
        <p>Долг души</p>
        <div class="sprites">${sp("sword3")}${sp("goddess")}${sp("magic2")}</div>
      </div>
      <button class="btn gold-btn go" data-act="begin">Начать путь</button>
      <div class="muted shadow-text" style="text-align:center">Бесплатно. Без рекламы. Только игра.</div>
    </div>`;
  }

  function renderFaction() {
    const card = (k) => {
      const f = FACTIONS[k];
      return `<button class="glass dark pick" data-act="pick" data-faction="${k}">${sp(f.sprites[0])}<div><b>${ic(f.weaponIcon).replace("<img", '<img style="width:22px;height:22px;vertical-align:-4px"')} ${f.name}</b><span>${f.desc}</span></div></button>`;
    };
    app.innerHTML = `<div class="center-col">
      <div class="glass dark dialog"><span class="who" style="background:${ST.CHARS.goddess.color}">Белая</span>Ну? Железо или голова? Выбирай. Потом, если что, передумаешь — разрешу пару раз.</div>
      ${card("sword")}${card("magic")}
    </div>`;
  }

  function renderName() {
    app.innerHTML = `<div class="center-col">
      <div class="actor">${sp("goddess")}</div>
      <div class="glass dark dialog"><span class="who" style="background:${ST.CHARS.goddess.color}">Белая</span>И как тебя звать-то, герой?</div>
      <input class="name-input glass" id="name-input" maxlength="20" placeholder="Имя героя" value="${S.name === "Герой" ? "" : esc(S.name)}">
      <button class="btn gold-btn go" data-act="name-done">Так меня зовут</button>
    </div>`;
  }

  function renderScene() {
    if (!scene) { S.screen = "town"; return render(); }
    const line = scene.lines[scene.i];
    let body;
    if (line.choice) {
      body = `<div class="choices">${line.choice.map(([label, act]) => `<button class="btn gold-btn" data-act="${act}">${esc(label)}</button>`).join("")}</div>`;
      app.innerHTML = `<div class="scene-wrap"><div class="scene-top"><span class="glass dark chapter-tag">${esc(scene.title)}</span></div>
        <div style="flex:1"></div><div class="actor">${sp("goddess")}</div>
        <div class="glass dark dialog narr">Решай. От этого зависит, чем закончится история.</div>${body}</div>`;
      return;
    }
    const [who, raw] = line;
    const text = esc(raw.replace(/\{name\}/g, S.name));
    let actor = "", cls = "", tag = "";
    if (who === "n") { cls = "narr"; }
    else if (who === "sys") { cls = "sys"; }
    else {
      const ch = ST.CHARS[who] || { name: who, color: "#fff" };
      const nm = who === "hero" ? S.name : ch.name;
      const spr = who === "hero" ? heroSprite() : ch.sprite;
      if (spr) actor = sp(spr);
      tag = `<span class="who" style="background:${ch.color}">${esc(nm)}</span>`;
    }
    app.innerHTML = `<div class="scene-wrap" data-act="scene-next">
      <div class="scene-top"><span class="glass dark chapter-tag">${esc(scene.title)}</span><button class="btn small" data-act="scene-skip">Пропустить ⏭</button></div>
      <div style="flex:1"></div>
      <div class="actor">${actor}</div>
      <div class="glass dark dialog ${cls}">${tag}${text}<span class="next">▼</span></div>
      <div class="muted shadow-text" style="text-align:center">Нажми, чтобы продолжить</div>
    </div>`;
  }

  function badges() {
    ensureDaily(); ensureLogin();
    const guild = S.daily.quests.filter((q) => { const d = questDef(q); return d && q.p >= d.need && !q.claimed; }).length;
    const st = chapterState();
    const quests = st === "new" || st === "complete" || st === "choice" ? 1 : 0;
    const rewards = S.login.claimed ? 0 : 1;
    return { guild, quests, rewards };
  }

  function renderTown() {
    const c = calc(); const b = badges();
    const appIc = (act, icon, label, n) => `<button class="app-ic" data-act="${act}"><div class="glass">${ic(icon)}${n ? `<span class="badge">${n}</span>` : ""}</div>${label}</button>`;
    const tab = (act, icon, label) => `<button class="tab" data-act="${act}"><div class="ic">${ic(icon)}</div>${label}</button>`;
    app.innerHTML = `
      <div class="top">
        <button class="glass dark circle" data-act="open-settings" aria-label="Настройки">⚙️</button>
        <button class="glass dark cap" data-act="open-hero"><b>${esc(S.name)}</b><small>Ур. ${S.level} · ${F().name} · ${rankName()}</small></button>
        <div class="glass dark coins">${ic("coins")}${fmt(S.gold)}</div>
      </div>
      <div class="glass dark power">МОЩЬ ${fmt(c.power)}</div>
      <div class="town-mid">
        <div class="side">${appIc("open-guild", "shield", "Гильдия", b.guild)}${appIc("open-quests", "scroll", "Задания", b.quests)}${appIc("open-rewards", "amulet", "Награды", b.rewards)}</div>
        <div class="hero-stand">${S.companion ? sp(COMPANION.sprite, "pet") : ""}${sp(heroSprite(), "sprite")}<div class="glass dark plate">${rankName()}</div></div>
      </div>
      <button class="btn gold-btn go" data-act="open-zones">${ic(F().weaponIcon)} В бой</button>
      <nav class="glass dark dock">
        ${tab("open-hero", "helm", "Герой")}${tab("open-equip", "sword", "Снаряжение")}${tab("open-arts", "rings", "Артефакты")}${tab("open-shop", "potion", "Лавка")}${tab("open-log", "book", "Журнал")}
      </nav>`;
  }

  function renderEquip() {
    const c = calc();
    const lvl = (k) => S.gear[k];
    const cls = (l) => (l >= 30 ? "lg" : l >= 10 ? "ep" : "");
    const slot = (k) => `<button class="slot ${cls(lvl(k))} ${equipSel === k ? "sel" : ""}" data-act="sel-slot" data-slot="${k}"><span>УР${lvl(k)}</span>${ic(itemIcon(k))}</button>`;
    const artSlot = S.artifact
      ? `<button class="slot lg" data-act="open-arts">${ic(ARTIFACTS[S.artifact].icon)}</button>`
      : `<button class="slot empty" data-act="open-arts">+</button>`;
    const sel = equipSel; const l = lvl(sel);
    const nextGear = Object.assign({}, S.gear, { [sel]: l + 1 });
    const n = calc(nextGear);
    const cost = upgradeCost(l);
    const capped = l >= S.level;
    const arrow = (a, b) => (b > a ? ` <span class="up">→ ${fmt(b)}</span>` : "");
    app.innerHTML = `<div class="equip"><div class="equip-in">
      <div class="ehead"><button class="frame back" data-act="go-town" aria-label="Назад">◀</button><h3>СНАРЯЖЕНИЕ</h3><div class="frame coins">${ic("coins")}${fmt(S.gold)}</div></div>
      <div class="epower">МОЩЬ ${fmt(c.power)}</div>
      <div class="stage">
        <div class="ring"></div>${ic(F().weaponIcon, "weapon")}
        <button class="frame wl ${sel === "weapon" ? "sel" : ""}" data-act="sel-slot" data-slot="weapon">${F().name.toUpperCase()} · УР.${lvl("weapon")}</button>
        <div class="col l">${slot("helm")}${slot("armor")}${slot("amulet")}</div>
        <div class="col r">${artSlot}${slot("shield")}${slot("boots")}</div>
      </div>
      <div class="frame estats">
        <div class="nm">${esc(itemName(sel, l))} · УР.${l}</div>
        <div class="erow"><span>Урон</span><span>${fmt(c.dmg)}${capped ? "" : arrow(c.dmg, n.dmg)}</span></div>
        <div class="erow"><span>Здоровье</span><span>${fmt(c.hp)}${capped ? "" : arrow(c.hp, n.hp)}</span></div>
        <div class="erow"><span>Защита</span><span>${fmt(c.def)}${capped ? "" : arrow(c.def, n.def)}</span></div>
        ${capped ? `<div class="erow" style="color:#ffb4a2"><span>Предмет не может быть выше уровня героя (${S.level}).</span></div>` : ""}
      </div>
      <div class="ebtns">
        <button class="pbtn" data-act="upgrade" ${capped || S.gold < cost ? "disabled" : ""}>УСИЛИТЬ<br>${fmt(cost)} 🪙</button>
        <button class="pbtn alt" data-act="open-arts">АРТЕ-<br>ФАКТЫ</button>
      </div>
    </div>
    <nav class="ptabs">
      <button class="ptab" data-act="go-town">${ic("helm")}Герой</button>
      <button class="ptab on">${ic("sword")}Снаряж.</button>
      <button class="ptab" data-act="open-arts">${ic("rings")}Артефакты</button>
      <button class="ptab" data-act="open-shop">${ic("potion")}Лавка</button>
      <button class="ptab" data-act="open-log">${ic("book")}Журнал</button>
    </nav></div>`;
  }

  // ---------- Бой ----------
  function makeEnemy(zone, kind) {
    let L, base, mob;
    if (kind === "edric") {
      L = S.level;
      return { name: "Сэр Эдрик Сияющий", sprite: "edric", lvl: L, hp: Math.round((30 + L * 20) * 7), dmg: Math.round((3 + L * 1.7) * 3), iv: [2.2, 3.2], xp: 0, gold: 0 };
    }
    if (kind === "boss" || kind === "heroic") {
      const b = zone.boss; const h = kind === "heroic";
      L = h ? Math.min(115, b.lvl + 15) : b.lvl;
      return { name: (h ? "Героический " : "") + b.name, sprite: b.sprite, lvl: L,
        hp: Math.round((30 + L * 20) * (h ? 12 : 8)), dmg: Math.round((3 + L * 1.7) * (h ? 4.4 : 3.4)), iv: b.iv,
        xp: Math.round((10 + L * 6) * 6), gold: Math.round((3 + L * 1.5) * 8) };
    }
    base = zone.mobs[rint(0, zone.mobs.length - 1)];
    L = clamp(S.level + rint(-2, 1), zone.min, zone.max);
    mob = { name: base.name, sprite: base.sprite, lvl: L,
      hp: Math.round((30 + L * 20) * base.hp * 2.5), dmg: Math.round((3 + L * 1.7) * base.dmg * 1.3), iv: base.iv,
      xp: 10 + L * 6, gold: Math.round((3 + L * 1.5) * rnd(0.8, 1.2)) };
    return mob;
  }
  function xpMul(mobL) {
    const d = S.level - mobL;
    return d <= 2 ? 1 : d <= 5 ? 0.5 : d <= 9 ? 0.15 : 0;
  }

  function startFight(zone, kind) {
    clearTimers();
    closeSheet();
    const mob = makeEnemy(zone, kind);
    mob.maxHp = mob.hp;
    const c = calc();
    const now = performance.now();
    fight = {
      zone, kind, mob, isBoss: kind !== "mob",
      hp: c.hp, maxHp: c.hp,
      phase: 1, atk: 0, tele: null, guardUntil: 0,
      cdA: now, cdS: now, cdB: now,
      durA: F().cd * 1000, durS: F().skillCd * 1000 * (1 - (art().cdr || 0)), durB: 2200,
      over: false, log: [`${mob.name} преграждает путь!`],
    };
    if (pendingTrap) { fight.hp = Math.round(fight.hp * 0.8); pendingTrap = false; fight.log.unshift("Нога ещё болит после капкана."); }
    if (kind === "mob") S.lastZone = zone.id;
    S.screen = "fight";
    render();
    later(900, scheduleEnemy);
  }

  function renderFight() {
    const f = fight; if (!f) { S.screen = "town"; return render(); }
    const pot = S.activePotions.map((k) => ic(POTIONS[k].icon)).join("");
    app.innerHTML = `<div class="fight">
      <div class="top"><button class="glass dark circle" data-act="flee" aria-label="Отступить">✕</button>
        <div class="glass dark cap"><b>${f.kind === "edric" ? "Площадь Верескового Брода" : esc(f.zone.name)}</b><small>${f.isBoss ? "Босс" : "Обычный бой"}</small></div></div>
      <div class="glass dark enemy-box" id="ebox">
        <img class="enemy-sprite ${f.kind === "heroic" ? "heroic" : ""}" id="esprite" src="${SPR(f.mob.sprite)}" alt="">
        <div class="enemy-name">${esc(f.mob.name)} <small>ур. ${f.mob.lvl}</small></div>
        <div class="bar enemy"><i id="ehp"></i></div>
        <div class="hp-text" id="ehpt"></div>
      </div>
      <div class="warn" id="warn"></div>
      <div class="flog" id="flog"></div>
      <div class="glass dark me-box" id="mebox">${sp(heroSprite())}
        <div class="grow"><div style="display:flex;justify-content:space-between;align-items:center"><b>${esc(S.name)}</b><span class="buffs">${S.companion ? sp("fox") : ""}${pot}</span></div>
        <div class="bar"><i id="php"></i></div><div class="hp-text" id="phpt"></div></div></div>
      <div class="fbtns">
        <button class="btn fbtn atk" data-act="attack">${ic(F().weaponIcon)}Атака<i class="cd" id="cdA"></i></button>
        <button class="btn fbtn skl" data-act="skill">${ic(F().skillIcon)}${F().skill}<i class="cd" id="cdS"></i></button>
        <button class="btn fbtn blk" data-act="block">${ic("shield")}${F().block}<i class="cd" id="cdB"></i></button>
      </div>
    </div>`;
    updateFight();
    startRaf();
  }

  function updateFight() {
    const f = fight; if (!f || S.screen !== "fight") return;
    const $ = (id) => document.getElementById(id);
    if (!$("ehp")) return;
    $("ehp").style.width = `${Math.max(0, (f.mob.hp / f.mob.maxHp) * 100)}%`;
    $("ehpt").textContent = `${fmt(Math.max(0, f.mob.hp))} / ${fmt(f.mob.maxHp)}${f.isBoss ? ` · фаза ${f.phase}` : ""}`;
    $("php").style.width = `${Math.max(0, (f.hp / f.maxHp) * 100)}%`;
    $("phpt").textContent = `${fmt(Math.max(0, f.hp))} / ${fmt(f.maxHp)} · урон ${fmt(fightDmg())}`;
    const w = $("warn");
    if (f.tele) { w.textContent = f.tele.heavy ? "!! СОКРУШИТЕЛЬНЫЙ УДАР — БЛОК !!" : "!! ЗАМАХ — БЛОК !!"; w.className = "warn on"; }
    else { w.textContent = ""; w.className = "warn"; }
    $("flog").innerHTML = f.log.slice(0, 3).map((l) => `<div>${esc(l)}</div>`).join("");
  }

  function startRaf() {
    stopRaf();
    const tick = () => {
      if (!fight || S.screen !== "fight") return;
      const now = performance.now();
      const set = (id, until, dur) => { const el = document.getElementById(id); if (el) el.style.height = `${clamp((until - now) / dur, 0, 1) * 100}%`; };
      set("cdA", fight.cdA, fight.durA); set("cdS", fight.cdS, fight.durS); set("cdB", fight.cdB, fight.durB);
      const mb = document.getElementById("mebox");
      if (mb) mb.classList.toggle("guard", now < fight.guardUntil);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }
  function stopRaf() { if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

  function floatNum(boxId, text, cls) {
    const box = document.getElementById(boxId); if (!box) return;
    const el = document.createElement("div");
    el.className = `float ${cls || ""}`;
    el.textContent = text;
    el.style.left = `${rnd(35, 65)}%`;
    box.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  function scheduleEnemy() {
    if (!fight || fight.over) return;
    const [a, b] = fight.mob.iv;
    const speed = fight.phase === 2 ? 0.85 : 1;
    later(rnd(a, b) * 1000 * speed, () => {
      if (!fight || fight.over) return;
      fight.atk++;
      const heavy = fight.isBoss && fight.atk % 3 === 0;
      let tele;
      if (fight.isBoss) tele = heavy || !(fight.phase === 2 && Math.random() < 0.25);
      else tele = Math.random() < 0.3;
      if (tele) {
        fight.tele = { heavy, mul: heavy ? 1.8 : fight.isBoss ? 1 : 1.5 };
        updateFight();
        haptic("medium");
        later(fight.isBoss ? 1500 : 1000, () => enemyStrike(fight && fight.tele ? fight.tele.mul : 1, true));
      } else enemyStrike(1, false);
    });
  }

  function enemyStrike(mul, wasTele) {
    if (!fight || fight.over) return;
    fight.tele = null;
    let dmg = fight.mob.dmg * mul * rnd(0.9, 1.1) * incomingMul();
    const guarded = performance.now() < fight.guardUntil;
    if (guarded && wasTele) {
      dmg *= 0.15; S.stats.perfect++; track("perfect");
      fight.log.unshift("Идеальный блок!"); floatNum("mebox", "БЛОК", "block");
    } else if (guarded) {
      dmg *= 0.4; fight.log.unshift(`${F().block}: удар ослаблен.`);
    }
    const cap = fight.maxHp * (fight.isBoss ? 0.4 : 0.5); // никто не убивает с одного удара
    dmg = Math.max(1, Math.round(Math.min(dmg, cap)));
    fight.hp -= dmg;
    if (!guarded) fight.log.unshift(`${fight.mob.name} бьёт: −${fmt(dmg)}`);
    floatNum("mebox", `−${fmt(dmg)}`, "me");
    haptic(dmg > fight.maxHp * 0.2 ? "heavy" : "light");
    if (fight.hp <= 0) return defeat();
    scheduleEnemy();
    updateFight();
  }

  function playerHit(mul, label) {
    const f = fight;
    const crit = Math.random() < 0.1;
    const dmg = Math.round(fightDmg() * mul * rnd(0.9, 1.1) * (crit ? 1.6 : 1));
    f.mob.hp -= dmg;
    f.log.unshift(`${label}: ${fmt(dmg)}${crit ? " (крит!)" : ""}`);
    floatNum("ebox", fmt(dmg), crit ? "crit" : "");
    const es = document.getElementById("esprite");
    if (es) { es.classList.add("hit"); setTimeout(() => es.classList.remove("hit"), 110); }
    if (f.isBoss && f.phase === 1 && f.mob.hp > 0 && f.mob.hp <= f.mob.maxHp * 0.5) {
      f.phase = 2; f.mob.dmg = Math.round(f.mob.dmg * 1.3);
      f.log.unshift(`${f.mob.name} приходит в ярость! Фаза 2.`);
      haptic("heavy");
    }
    if (f.mob.hp <= 0) return victory();
    updateFight();
  }
  function playerAttack() {
    const now = performance.now();
    if (!fight || fight.over || now < fight.cdA) return;
    fight.cdA = now + fight.durA;
    playerHit(1, "Удар");
  }
  function playerSkill() {
    const now = performance.now();
    if (!fight || fight.over || now < fight.cdS) return;
    fight.cdS = now + fight.durS;
    track("skill");
    haptic("medium");
    playerHit(F().skillMul, F().skill);
  }
  function playerBlock() {
    const now = performance.now();
    if (!fight || fight.over || now < fight.cdB) return;
    fight.cdB = now + fight.durB;
    fight.guardUntil = now + 1000;
  }

  function levelUp() {
    let ups = 0;
    while (S.level < MAX_LEVEL && S.xp >= xpNeed(S.level)) { S.xp -= xpNeed(S.level); S.level++; ups++; }
    if (S.level >= MAX_LEVEL) S.xp = 0;
    if (ups) pushLog(`Новый уровень: ${S.level}!`);
    return ups;
  }

  function victory() {
    const f = fight; f.over = true; clearTimers(); stopRaf();
    haptic("heavy");
    if (f.kind === "edric") {
      S.activePotions = []; fight = null; saveState();
      return finishEnding("prove");
    }
    const mul = xpMul(f.mob.lvl);
    const xp = Math.round(f.mob.xp * mul);
    const gold = Math.round(f.mob.gold * (1 + (art().gold || 0)));
    S.xp += xp; S.gold += gold; S.stats.wins++;
    const ups = levelUp();
    const loot = [`<span>${ic("coins")}+${fmt(gold)}</span>`, `<span>✨ +${fmt(xp)} опыта</span>`];
    let note = mul < 1 ? `<div class="hint">${mul === 0 ? "Враг намного слабее тебя — опыта за него не дают." : "Враг слабее тебя, опыта меньше. Попробуй зону посложнее."}</div>` : "";
    if (f.isBoss) {
      track("boss"); S.bossLoss = 0;
      const id = f.zone.id;
      if (f.kind === "heroic") {
        S.heroicKills[id] = (S.heroicKills[id] || 0) + 1; S.stats.heroic++;
        if (!S.artifacts.includes("crystal")) { S.artifacts.push("crystal"); loot.push(`<span>${ic("crystal")}Кристалл героя</span>`); }
      } else {
        S.bossKills[id] = (S.bossKills[id] || 0) + 1;
        const a = f.zone.boss.art;
        if (a && !S.artifacts.includes(a)) {
          S.artifacts.push(a); if (!S.artifact) S.artifact = a;
          loot.push(`<span>${ic(ARTIFACTS[a].icon)}${ARTIFACTS[a].name}</span>`);
          pushLog(`Найден артефакт: ${ARTIFACTS[a].name}.`);
        }
      }
    }
    track("win");
    storyOnWin(f.zone.id, f.isBoss);
    pushLog(`Победа: ${f.mob.name}. +${gold} золота, +${xp} опыта.`);
    if (ups) loot.push(`<span>⬆ Уровень ${S.level}!</span>`);
    S.activePotions = [];
    checkAch();
    saveState();
    const again = f.kind === "mob" ? "fight" : f.kind;
    openSheet(`<div class="result-big win">ПОБЕДА!</div><div class="loot">${loot.join("")}</div>${note}
      <div class="btn-row"><button class="btn" data-act="to-town">В город</button><button class="btn gold-btn" data-act="${again}" data-zone="${f.zone.id}">${f.isBoss ? "Ещё раз" : "Дальше"}</button></div>`, true);
  }

  function defeat() {
    const f = fight; f.over = true; clearTimers(); stopRaf();
    haptic("heavy");
    S.stats.deaths++;
    let extra = "";
    if (f.isBoss) {
      S.bossLoss++;
      if (f.mob.lvl >= S.level + 5 && Math.random() < 0.15) {
        const cands = SLOT_KEYS.filter((k) => k !== "weapon" && S.gear[k] > 1);
        const pool = cands.length ? cands : (S.gear.weapon > 1 ? ["weapon"] : []);
        if (pool.length) {
          const k = pool[rint(0, pool.length - 1)];
          const was = S.gear[k]; S.gear[k] = 1;
          extra += `<div class="hint" style="border-color:#ff5a4f;color:#ffb4a2">Ты полез на слишком сильного босса и потерял «${esc(itemName(k, was))}» (ур. ${was}). Кузнец выдал простую замену.</div>`;
          pushLog(`Потерян предмет: ${itemName(k, was)} (ур. ${was}).`);
        }
      }
      if (S.bossLoss >= 2 && f.kind !== "edric") {
        extra += `<div class="hint">Не сдавайся! Несколько советов:<br>• жми «${F().block}», когда видишь «!!», — идеальный блок почти гасит удар;<br>• усиль оружие и доспех в «Снаряжении»;<br>• выпей зелья силы и защиты перед боем;<br>• подними пару уровней на обычных врагах.</div>`;
      }
    }
    pushLog(`Поражение: ${f.mob.name}. Золото при тебе.`);
    S.activePotions = [];
    saveState();
    const again = f.kind === "mob" ? "fight" : f.kind;
    openSheet(`<div class="result-big lose">ПОРАЖЕНИЕ</div><div class="muted" style="text-align:center;margin-bottom:8px">Золото и опыт не потеряны. Марта уже ставит чайник.</div>${extra}
      <div class="btn-row"><button class="btn" data-act="to-town">В город</button><button class="btn gold-btn" data-act="${again}" data-zone="${f.zone.id}">Ещё раз</button></div>`, true);
  }

  function endFightToTown() {
    clearTimers(); stopRaf();
    fight = null; S.screen = "town"; closeSheet(); saveState(); render();
  }

  // ---------- Случайные события ----------
  function randomEvent(zone) {
    const L = S.level;
    const evs = [
      () => { const g = 10 + L * 3; S.gold += g; return [`Под корнями — старый сундук. Замок ржавый, сбиваешь его с одного удара. Внутри ${g} золотых.`, "chest"]; },
      () => { const k = Math.random() < 0.5 ? "strength" : "guard"; S.potions[k] = (S.potions[k] || 0) + 1; return [`Старушка с корзиной трав суёт тебе склянку: «На, милок, пригодится». Получено: ${POTIONS[k].name}.`, POTIONS[k].icon]; },
      () => { const x = Math.round(xpNeed(L) * 0.1); S.xp += x; levelUp(); return [`У костра бард поёт балладу про сэра Эдрика. Обидно, но поучительно. +${x} опыта.`, "book"]; },
      () => { pendingTrap = true; return ["Щёлк! Капкан. Нога цела, но следующий бой начнёшь с меньшим здоровьем.", "key"]; },
    ];
    const [text, icon] = evs[rint(0, evs.length - 1)]();
    pushLog(text);
    saveState();
    openSheet(`${head("По дороге…", icon)}<div class="tut"><p>${esc(text)}</p></div>
      <button class="btn gold-btn" data-act="event-go" data-zone="${zone.id}">Идти дальше</button>`, true);
  }

  // ---------- Действия ----------
  function readName() {
    const el = document.getElementById("name-input");
    const v = el ? el.value.trim() : "";
    return v ? v.slice(0, 20) : null;
  }

  function handleAction(btn) {
    const act = btn.dataset.act;
    const zone = btn.dataset.zone ? zoneById(btn.dataset.zone) : null;

    switch (act) {
      // Сценки и вступление
      case "scene-next": return sceneNext();
      case "scene-skip": {
        if (!scene) return;
        const ci = scene.lines.findIndex((l) => l.choice);
        if (ci >= 0 && scene.i < ci) { scene.i = ci; return renderScene(); }
        return sceneEnd();
      }
      case "begin": return playScene(ST.INTRO_A, "Пролог", () => { S.screen = "faction"; render(); });
      case "pick": {
        const keepName = S.name;
        S = newState(); S.name = keepName;
        S.faction = btn.dataset.faction;
        S.screen = "name";
        return render();
      }
      case "name-done": {
        S.name = readName() || "Герой";
        return playScene(ST.INTRO_B, "Пролог", () => {
          S.screen = "town"; saveState(); render();
          tutPage = 0; openSheet(tutorialHtml(), true);
        });
      }
      case "tut-next": tutPage++; return openSheet(tutorialHtml(), true);
      case "tut-prev": tutPage = Math.max(0, tutPage - 1); return openSheet(tutorialHtml(), true);
      case "tut-done": S.tutorial = true; saveState(); closeSheet(); return render();
      case "tutorial": tutPage = 0; return openSheet(tutorialHtml(), true);

      // Панели
      case "close-sheet": return closeSheet();
      case "open-settings": return openSheet(settingsHtml());
      case "credits": return openSheet(creditsHtml());
      case "open-hero": return openSheet(heroHtml());
      case "open-log": return openSheet(logHtml());
      case "open-shop": return openSheet(shopHtml());
      case "open-arts": return openSheet(artifactsHtml());
      case "open-guild": return openSheet(guildHtml());
      case "open-quests": return openSheet(questsHtml());
      case "open-rewards": return openSheet(rewardsHtml());
      case "open-zones": return openSheet(zonesHtml());
      case "open-equip": closeSheet(); S.screen = "equip"; return render();
      case "go-town": closeSheet(); S.screen = "town"; saveState(); return render();

      case "save-name": { const n = readName(); if (n) { S.name = n; saveState(); toast("Имя сохранено"); render(); } return openSheet(settingsHtml()); }
      case "ask-reset": return openSheet(confirmHtml("Начать заново?", "Весь прогресс будет удалён: уровень, золото, снаряжение и сюжет.", "do-reset", "Удалить"));
      case "do-reset": clearTimers(); fight = null; S = newState(); saveState(); closeSheet(); return render();
      case "ask-switch": {
        const other = S.faction === "sword" ? "magic" : "sword";
        return openSheet(confirmHtml("Сменить путь?", `Ты станешь: ${FACTIONS[other].name}. Осталось смен: ${MAX_SWITCHES - S.switches}. Уровень и снаряжение сохранятся.`, "do-switch", "Сменить"));
      }
      case "do-switch": {
        if (S.switches >= MAX_SWITCHES) return;
        S.faction = S.faction === "sword" ? "magic" : "sword"; S.switches++;
        pushLog(`Путь сменён: теперь ${F().name}.`);
        saveState(); closeSheet(); render(); return toast(`Теперь твой путь — ${F().name}`);
      }

      // Лавка и снаряжение
      case "buy": {
        const k = btn.dataset.potion; const p = potionPrice(k);
        if (S.gold < p) return;
        S.gold -= p; S.potions[k] = (S.potions[k] || 0) + 1;
        saveState(); render(); return openSheet(shopHtml());
      }
      case "drink": {
        const k = btn.dataset.potion;
        if (!S.potions[k] || S.activePotions.includes(k) || S.activePotions.length >= 2) return;
        S.potions[k]--; S.activePotions.push(k); track("potion");
        pushLog(`Выпито перед боем: ${POTIONS[k].name}.`);
        saveState(); render(); return openSheet(shopHtml());
      }
      case "equip-art": S.artifact = btn.dataset.art; saveState(); render(); return openSheet(artifactsHtml());
      case "sel-slot": equipSel = btn.dataset.slot; return render();
      case "upgrade": {
        const l = S.gear[equipSel]; const cost = upgradeCost(l);
        if (l >= S.level || S.gold < cost) return;
        S.gold -= cost; S.gear[equipSel] = l + 1; S.stats.upgrades++;
        track("upgrade"); checkAch(); haptic("medium");
        saveState(); render();
        return toast(`${itemName(equipSel, l + 1)} → ур. ${l + 1}`);
      }

      // Гильдия и награды
      case "claim-daily": {
        const q = S.daily.quests[+btn.dataset.i]; const d = questDef(q);
        if (!q || q.claimed || q.p < d.need) return;
        const r = rewardOf(q);
        q.claimed = true; S.gold += r.gold; S.xp += r.xp;
        if (q.hard) { const k = Math.random() < 0.5 ? "strength" : "guard"; S.potions[k] = (S.potions[k] || 0) + 1; }
        const ups = levelUp(); checkAch(); saveState(); render();
        toast(`+${fmt(r.gold)} 🪙, +${fmt(r.xp)} опыта${ups ? ` · уровень ${S.level}!` : ""}`);
        return openSheet(guildHtml());
      }
      case "claim-login": {
        if (S.login.claimed) return;
        const g = loginGold(S.login.streak);
        S.gold += g; S.login.claimed = true;
        if (S.login.streak === 7) { S.potions.strength = (S.potions.strength || 0) + 1; S.potions.guard = (S.potions.guard || 0) + 1; }
        saveState(); render(); toast(`Награда дня: +${fmt(g)} 🪙${S.login.streak === 7 ? " и два зелья" : ""}`);
        return openSheet(rewardsHtml());
      }

      // Сюжет
      case "read-chapter": return readChapter();
      case "complete-chapter": return completeChapter();
      case "replay": { const c = ST.CHAPTERS[+btn.dataset.ch]; return playScene(c.scene.concat(c.after || []).filter((l) => !l.choice), c.title, null); }
      case "end-prove": return playScene(ST.ENDINGS.prove.before, ST.ENDINGS.prove.title, () => startFight(ZONES[0], "edric"));
      case "end-together": return finishEnding("together");
      case "end-home": return finishEnding("home");

      // Бой
      case "fight": {
        if (fight && !fight.over) return;
        const z = zone || zoneById(S.lastZone);
        if (S.level < z.min && z.id !== "forest") return;
        if (Math.random() < 0.12) { fight = null; S.screen = "town"; render(); return randomEvent(z); }
        return startFight(z, "mob");
      }
      case "event-go": return startFight(zone || zoneById(S.lastZone), "mob");
      case "boss": return startFight(zone, "boss");
      case "heroic": return startFight(zone, "heroic");
      case "edric": return startFight(ZONES[0], "edric");
      case "attack": return playerAttack();
      case "skill": return playerSkill();
      case "block": return playerBlock();
      case "flee": pushLog("Ты отступил."); S.activePotions = []; return endFightToTown();
      case "to-town": return endFightToTown();
    }
  }

  // Боевые кнопки срабатывают по касанию сразу, остальные — по обычному клику.
  const FAST = { attack: 1, skill: 1, block: 1 };
  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest("[data-act]");
    if (btn && FAST[btn.dataset.act] && !btn.disabled) { e.preventDefault(); handleAction(btn); }
  });
  document.addEventListener("click", (e) => {
    if (e.target === sheetEl) { if (!sheetModal) closeSheet(); return; }
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled || FAST[btn.dataset.act]) return;
    handleAction(btn);
  });

  // ---------- Запуск ----------
  if (!S.faction || ["start", "faction", "name", "scene"].includes(S.screen) && !S.tutorial) {
    if (!S.faction) S.screen = "start";
  }
  if (S.screen === "fight" || S.screen === "scene") S.screen = S.faction ? "town" : "start";
  S.activePotions = S.activePotions || [];
  if (S.faction) { ensureDaily(); ensureLogin(); checkAch(); saveState(); }
  render();
  if (S.faction && !S.tutorial) { tutPage = 0; openSheet(tutorialHtml(), true); }

  // Для отладки и автотестов
  window.__game = { get S() { return S; }, set S(v) { S = v; }, render, saveState, calc, xpNeed };
})();
