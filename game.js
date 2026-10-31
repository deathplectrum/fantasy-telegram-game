// «Легенды Средневековья» — рабочая версия.
// Экран города: общая картинка, кнопки поверх, всплывающие панели (статистика, настройки, журнал).
// Бой в реальном времени: таймерные атаки врага, предупреждение перед сильным ударом, блок, зелья до боя.
// Прогресс хранится в localStorage (с try/catch) и не обязателен для игры.

(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  const SAVE_KEY = "legendy-sredneveka-save-v2";
  const MAX_LEVEL = 100;
  const app = document.getElementById("app");
  const sheetEl = document.getElementById("sheet");

  // ---------- Данные ----------
  const FACTIONS = {
    sword: { name: "Меч", hp: 30, dmg: 4, block: "Блок", ranks: ["Оруженосец", "Воин", "Рыцарь", "Паладин"] },
    magic: { name: "Магия", hp: 20, dmg: 6, block: "Щит", ranks: ["Ученик", "Маг", "Магистр", "Архимаг"] },
  };

  const ZONE = { name: "Тёмный лес", minLevel: 1, maxLevel: 10 };

  const MOBS = [
    { name: "Крыса-переросток", hp: 20, dmg: 3, xp: 15, interval: [2.5, 4] },
    { name: "Лесной волк", hp: 30, dmg: 5, xp: 25, interval: [2, 3.5] },
    { name: "Гоблин-разбойник", hp: 40, dmg: 7, xp: 40, interval: [2, 3] },
  ];

  const BOSS = { name: "Гоблин-вожак", hp: 120, dmg: 12, xp: 150, interval: [2.5, 4.5], phaseAt: 0.5 };

  // Зелья: покупаются в лавке, пьются только до боя. Максимум 2 — по одному каждого вида.
  const POTIONS = {
    strength: { name: "Зелье силы", price: 15, desc: "+3 к урону в бою" },
    guard: { name: "Зелье защиты", price: 15, desc: "−2 к урону врага" },
  };

  // Спутник-зверь. Даётся за победу над вожаком; даёт постоянный бонус.
  const COMPANION = { name: "Лисица Тень-в-Листве", desc: "−1 к урону врага" };

  // ---------- Состояние ----------
  function newState() {
    return {
      screen: "start", faction: null, name: "Герой", level: 1, xp: 0, gold: 0, hp: 0,
      story: 0,            // 0 — старт; 1 — вступление; 2 — лиса найдена
      theme: "auto",       // auto | light | dark
      potions: {},
      activePotions: [],
      companion: false,
      log: [],
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(newState(), JSON.parse(raw));
    } catch (e) { /* хранилище недоступно — играем без сохранения */ }
    return newState();
  }

  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  let S = loadState();
  let fight = null;
  let timers = [];

  // ---------- Вспомогательное ----------
  const rnd = (a, b) => a + Math.random() * (b - a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const xpNeed = (lvl) => lvl * 50;
  const rankFor = (lvl) => {
    const r = FACTIONS[S.faction].ranks;
    return r[Math.min(r.length - 1, Math.floor((lvl - 1) / 25))];
  };
  const playerDmg = () => FACTIONS[S.faction].dmg + S.level * 2 + (S.activePotions.includes("strength") ? 3 : 0);
  const playerMaxHp = () => FACTIONS[S.faction].hp + S.level * 8;
  const enemyDmgReduction = () => (S.activePotions.includes("guard") ? 2 : 0) + (S.companion ? 1 : 0);

  function pushLog(text) {
    S.log.unshift(text);
    S.log = S.log.slice(0, 30);
  }

  function clearTimers() {
    timers.forEach((t) => clearTimeout(t));
    timers = [];
  }

  function later(ms, fn) {
    timers.push(setTimeout(fn, ms));
  }

  function applyTheme() {
    const root = document.documentElement;
    if (S.theme === "light" || S.theme === "dark") root.dataset.theme = S.theme;
    else delete root.dataset.theme;
  }

  // ---------- Панели ----------
  function openSheet(html) {
    sheetEl.innerHTML = `<div class="sheet" role="dialog">${html}</div>`;
    sheetEl.hidden = false;
  }

  function closeSheet() {
    sheetEl.hidden = true;
    sheetEl.innerHTML = "";
  }

  function statsHtml() {
    const need = xpNeed(S.level);
    const xpPct = Math.min(100, Math.round((S.xp / need) * 100));
    const potions = Object.keys(POTIONS)
      .filter((k) => S.potions[k] > 0)
      .map((k) => `${POTIONS[k].name} × ${S.potions[k]}`)
      .join(", ") || "нет";
    return `
      <div class="sheet-head">
        <h2>${esc(S.name)}</h2>
        <button class="sheet-close" data-act="close-sheet">Закрыть</button>
      </div>
      <div class="muted">${FACTIONS[S.faction].name} · ${rankFor(S.level)} · уровень ${S.level} из ${MAX_LEVEL}</div>
      <div class="bar xp"><div style="width:${xpPct}%"></div></div>
      <div class="muted">Опыт: ${S.xp} / ${need}</div>
      <div class="stats" style="margin-top:12px">
        <span>⚔️ Урон: <b>${playerDmg()}</b></span>
        <span>❤️ Здоровье: <b>${S.hp}</b> / ${playerMaxHp()}</span>
        <span>🪙 Золото: <b>${S.gold}</b></span>
        <span>🐾 Спутник: <b>${S.companion ? esc(COMPANION.name) : "нет"}</b></span>
      </div>
      <div class="muted" style="margin-top:10px">🧪 Зелья в запасе: ${esc(potions)}</div>
      ${S.companion ? `<div class="muted">Бонус спутника: ${COMPANION.desc}</div>` : ""}`;
  }

  function settingsHtml() {
    const themeLabel = { auto: "Как в Telegram", light: "Светлая", dark: "Тёмная" }[S.theme];
    return `
      <div class="sheet-head">
        <h2>⚙️ Настройки</h2>
        <button class="sheet-close" data-act="close-sheet">Закрыть</button>
      </div>
      <div class="row-line"><span>Тема</span><button class="secondary" data-act="toggle-theme" style="margin:0;width:auto;padding:6px 12px">${themeLabel}</button></div>
      <div class="row-line" style="display:block">
        <span>Имя персонажа</span>
        <input type="text" id="name-input" maxlength="20" value="${esc(S.name)}">
        <button class="secondary" data-act="save-name" style="margin-top:8px">Сохранить имя</button>
      </div>
      <div class="row-line" style="display:block">
        <span>Сброс прогресса</span>
        <button class="secondary" data-act="reset" style="margin-top:8px;color:var(--danger);border-color:var(--danger)">Начать игру заново</button>
      </div>`;
  }

  function logHtml() {
    return `
      <div class="sheet-head">
        <h2>📜 Журнал</h2>
        <button class="sheet-close" data-act="close-sheet">Закрыть</button>
      </div>
      <div class="log">${S.log.length ? S.log.map(esc).join("<br>") : "Пока тихо."}</div>`;
  }

  function shopHtml() {
    const items = Object.entries(POTIONS).map(([k, p]) => `
      <div class="row-line">
        <span>${p.name} <span class="muted">(${p.desc})</span></span>
        <button class="secondary" data-act="buy" data-potion="${k}" style="margin:0;width:auto;padding:6px 12px" ${S.gold < p.price ? "disabled" : ""}>${p.price} 🪙</button>
      </div>`).join("");
    return `
      <div class="sheet-head">
        <h2>🛒 Лавка</h2>
        <button class="sheet-close" data-act="close-sheet">Закрыть</button>
      </div>
      <div class="muted" style="margin-bottom:6px">Золото: ${S.gold} 🪙</div>
      ${items}`;
  }

  function potionsHtml() {
    const owned = Object.keys(POTIONS).filter((k) => S.potions[k] > 0);
    const rows = owned.map((k) => {
      const active = S.activePotions.includes(k);
      const full = S.activePotions.length >= 2;
      const label = active ? "Выпито" : full ? "Лимит" : "Выпить";
      return `
        <div class="row-line">
          <span>${POTIONS[k].name} × ${S.potions[k]}</span>
          <button class="secondary" data-act="drink" data-potion="${k}" style="margin:0;width:auto;padding:6px 12px" ${active || full ? "disabled" : ""}>${label}</button>
        </div>`;
    }).join("");
    return `
      <div class="sheet-head">
        <h2>🧪 Зелья перед боем</h2>
        <button class="sheet-close" data-act="close-sheet">Закрыть</button>
      </div>
      <div class="muted" style="margin-bottom:6px">Можно выпить до 2 зелий, по одному каждого вида. Во время боя пить нельзя.</div>
      ${rows || '<div class="muted">Запас пуст. Купи зелья в лавке.</div>'}`;
  }

  function soonHtml(title, text) {
    return `
      <div class="sheet-head">
        <h2>${title}</h2>
        <button class="sheet-close" data-act="close-sheet">Закрыть</button>
      </div>
      <div class="muted">${text}</div>`;
  }

  // ---------- Экраны ----------
  function render() {
    document.body.classList.toggle("scene", S.screen === "town");
    if (S.screen === "start") return renderStart();
    if (S.screen === "intro") return renderIntro();
    if (S.screen === "town") return renderTown();
    if (S.screen === "fight") return renderFight();
  }

  function renderStart() {
    app.innerHTML = `
      <h1>Легенды Средневековья</h1>
      <div class="card">
        <p class="muted">Ты попадаешь в фэнтези-мир. Тебя встречает белая богиня.</p>
        <p>Выбери путь. Его можно сменить позже, несколько раз за игру.</p>
      </div>
      <div class="choice">
        <button data-act="pick" data-faction="sword">⚔️ Меч: много здоровья и блок</button>
        <button data-act="pick" data-faction="magic">🔮 Магия: сильный урон, мало здоровья</button>
      </div>`;
  }

  function renderIntro() {
    app.innerHTML = `
      <h1>Вступление</h1>
      <div class="card">
        <p>Богиня смотрит на тебя без улыбки. «Ты должен мне долг. Я дала тебе жизнь в этом мире, и теперь пришло время платить».</p>
        <p class="muted">Как тебя зовут?</p>
        <input type="text" id="name-input" maxlength="20" value="${esc(S.name)}">
      </div>
      <button data-act="to-town">Идти в город</button>`;
  }

  function renderTown() {
    const potionCount = S.activePotions.length;
    app.innerHTML = `
      <div class="scene-ui">
        <div class="topbar">
          <button class="icon-btn" data-act="open-settings" aria-label="Настройки">⚙️</button>
          <button class="pill" data-act="open-stats">
            <b>${esc(S.name)}</b>
            <small>Уровень ${S.level} · ${FACTIONS[S.faction].name} · ${rankFor(S.level)}</small>
          </button>
          <button class="icon-btn" data-act="open-log" aria-label="Журнал">📜</button>
        </div>
        <div class="scene-spacer"></div>
        <div class="actions">
          <button class="action" data-act="open-guild"><span class="ico">🛡️</span>Гильдия</button>
          <button class="action" data-act="open-tavern"><span class="ico">🍺</span>Таверна</button>
          <button class="action" data-act="open-shop"><span class="ico">🛒</span>Лавка</button>
          <button class="action" data-act="open-potions"><span class="ico">🧪</span>Зелья (${potionCount}/2)</button>
          <button class="action" data-act="open-house"><span class="ico">🏠</span>Дом</button>
          <button class="action" data-act="open-forest"><span class="ico">🌲</span>В лес</button>
        </div>
      </div>`;
  }

  function renderFight() {
    const f = fight;
    const hpPct = Math.max(0, (f.mob.hp / f.mob.maxHp) * 100);
    const playerPct = Math.max(0, (S.hp / playerMaxHp()) * 100);
    app.innerHTML = `
      <h1>${f.isBoss ? "Босс: " : ""}${esc(f.mob.name)}</h1>
      <div class="card">
        <div class="muted">👹 Враг</div>
        <div class="bar enemy"><div style="width:${hpPct}%"></div></div>
        <div class="muted">${Math.max(0, Math.round(f.mob.hp))} / ${f.mob.maxHp}${f.isBoss ? ` · фаза ${f.phase}` : ""}</div>
      </div>
      <div class="card">
        <div class="muted">🛡️ ${esc(S.name)}</div>
        <div class="bar"><div style="width:${playerPct}%"></div></div>
        <div class="muted">${Math.max(0, S.hp)} / ${playerMaxHp()} · урон ${playerDmg()}</div>
        <div class="warn">${f.warn ? "!! " + esc(f.warn) : ""}</div>
      </div>
      <div class="card">
        <div class="row">
          <button data-act="attack" ${f.over ? "disabled" : ""}>Атака (${playerDmg()})</button>
          <button data-act="block" ${f.over ? "disabled" : ""}>${FACTIONS[S.faction].block}</button>
        </div>
        <button class="secondary" data-act="flee" ${f.over ? "disabled" : ""}>Отступить</button>
      </div>
      <div class="card log">${f.log.map(esc).join("<br>")}</div>`;
  }

  // ---------- Бой ----------
  function startFight(mob, isBoss) {
    clearTimers();
    fight = {
      mob: { ...mob, maxHp: mob.hp },
      isBoss,
      phase: 1,
      phaseChanged: false,
      blocking: false,
      over: false,
      warn: "",
      log: [`Ты встречаешь: ${mob.name}.`],
    };
    S.screen = "fight";
    scheduleEnemyAttack();
    render();
    saveState();
  }

  // Каждая атака — свой таймер. У босса перед ударом предупреждение на 1,5 секунды;
  // у обычных мобов предупреждение бывает не всегда.
  function scheduleEnemyAttack() {
    if (!fight || fight.over) return;
    const [a, b] = fight.mob.interval;
    later(rnd(a, b) * 1000, () => {
      if (!fight || fight.over) return;
      const telegraph = fight.isBoss || Math.random() < 0.4;
      if (telegraph) {
        fight.warn = "Удар!";
        render();
        later(1500, enemyStrike);
      } else {
        enemyStrike();
      }
    });
  }

  function enemyStrike() {
    if (!fight || fight.over) return;
    fight.warn = "";
    let dmg = Math.max(1, fight.mob.dmg - enemyDmgReduction());
    if (fight.blocking) {
      dmg = Math.ceil(dmg / 2);
      fight.blocking = false;
      fight.log.unshift(`Ты блокируешь удар: ${dmg} урона.`);
    } else {
      fight.log.unshift(`${fight.mob.name} бьёт: ${dmg} урона.`);
    }
    S.hp -= dmg;
    if (S.hp <= 0) return defeat();
    scheduleEnemyAttack();
    render();
  }

  function playerAttack() {
    if (!fight || fight.over) return;
    const dmg = playerDmg();
    fight.mob.hp -= dmg;
    fight.log.unshift(`Ты бьёшь на ${dmg}.`);
    if (fight.isBoss && !fight.phaseChanged && fight.mob.hp <= fight.mob.maxHp * BOSS.phaseAt) {
      fight.phaseChanged = true;
      fight.phase = 2;
      fight.mob.dmg = Math.round(fight.mob.dmg * 1.4);
      fight.log.unshift("Босс переходит во вторую фазу!");
    }
    if (fight.mob.hp <= 0) return victory();
    render();
  }

  function playerBlock() {
    if (!fight || fight.over) return;
    fight.blocking = true;
    fight.log.unshift(`${FACTIONS[S.faction].block} поднят: следующий удар слабее.`);
    render();
  }

  function victory() {
    fight.over = true;
    clearTimers();
    const gain = fight.mob.xp;
    const gold = Math.round(rnd(3, 8) * (fight.isBoss ? 5 : 1));
    S.xp += gain;
    S.gold += gold;
    pushLog(`Победа над: ${fight.mob.name}. +${gain} опыта, +${gold} золота.`);
    while (S.xp >= xpNeed(S.level) && S.level < MAX_LEVEL) {
      S.xp -= xpNeed(S.level);
      S.level += 1;
      S.hp = playerMaxHp();
      pushLog(`Уровень ${S.level}! Урон ${playerDmg()}, здоровье ${playerMaxHp()}.`);
    }
    if (fight.isBoss && S.story < 2) {
      S.story = 2;
      S.companion = true;
      pushLog(`В награду за вожака к тебе вышла лисица «${COMPANION.name}». Она будет с тобой.`);
    }
    endFight("town");
  }

  function defeat() {
    fight.over = true;
    clearTimers();
    pushLog(`Ты пал в бою с: ${fight.mob.name}. Золото в руках не теряется.`);
    S.hp = playerMaxHp();
    endFight("town");
  }

  function endFight(screen) {
    S.activePotions = []; // зелья действуют только на один бой
    S.screen = screen;
    fight = null;
    saveState();
    render();
  }

  function resetGame() {
    clearTimers();
    fight = null;
    S = newState();
    S.screen = "start";
    saveState();
    closeSheet();
    render();
  }

  // ---------- Действия ----------
  function readName() {
    const input = document.getElementById("name-input");
    const name = input ? input.value.trim() : "";
    return name ? name.slice(0, 20) : S.name;
  }

  function handleAction(btn) {
    const act = btn.dataset.act;

    // Панели
    if (act === "close-sheet") return closeSheet();
    if (act === "open-stats") return openSheet(statsHtml());
    if (act === "open-settings") return openSheet(settingsHtml());
    if (act === "open-log") return openSheet(logHtml());
    if (act === "open-shop") return openSheet(shopHtml());
    if (act === "open-potions") return openSheet(potionsHtml());
    if (act === "open-guild") return openSheet(soonHtml("🛡️ Гильдия", "Ежедневные задания: две лёгкие и одна тяжёлая с большой наградой. Появятся в следующей версии."));
    if (act === "open-house") return openSheet(soonHtml("🏠 Дом", "Сундук с золотом и улучшения дома. Появятся позже."));

    if (act === "toggle-theme") {
      S.theme = S.theme === "auto" ? "light" : S.theme === "light" ? "dark" : "auto";
      applyTheme();
      saveState();
      return openSheet(settingsHtml());
    }
    if (act === "save-name") {
      S.name = readName();
      saveState();
      return openSheet(settingsHtml());
    }
    if (act === "reset") {
      if (window.confirm && window.confirm("Начать игру заново? Прогресс будет удалён.")) resetGame();
      return;
    }

    // Старт и вступление
    if (act === "pick") {
      const faction = btn.dataset.faction;
      S = newState();
      S.faction = faction;
      S.hp = playerMaxHp();
      S.gold = 30; // стартовые деньги, чтобы купить первое зелье
      S.story = 1;
      S.screen = "intro";
      pushLog(`Ты выбрал путь: ${FACTIONS[faction].name}.`);
      saveState();
      return render();
    }
    if (act === "to-town") {
      S.name = readName();
      S.screen = "town";
      saveState();
      return render();
    }

    // Город
    if (act === "buy") {
      const k = btn.dataset.potion;
      const p = POTIONS[k];
      if (S.gold < p.price) return;
      S.gold -= p.price;
      S.potions[k] = (S.potions[k] || 0) + 1;
      pushLog(`Куплено: ${p.name}.`);
      saveState();
      return openSheet(shopHtml());
    }
    if (act === "drink") {
      const k = btn.dataset.potion;
      if (!S.potions[k] || S.activePotions.includes(k) || S.activePotions.length >= 2) return;
      S.potions[k] -= 1;
      S.activePotions.push(k);
      pushLog(`Выпито перед боем: ${POTIONS[k].name} (${POTIONS[k].desc}).`);
      saveState();
      closeSheet();
      return render();
    }
    if (act === "open-tavern") {
      S.hp = playerMaxHp();
      pushLog("Таверна вернула здоровье. Отдых стоит ничего.");
      saveState();
      return openSheet(soonHtml("🍺 Таверна", `Ты отдохнул, здоровье восстановлено: ${S.hp} / ${playerMaxHp()}. Наёмники и истории появятся позже.`));
    }
    if (act === "open-forest") {
      closeSheet();
      if (Math.random() < 0.2) return startFight(BOSS, true);
      const base = MOBS[Math.floor(Math.random() * MOBS.length)];
      return startFight({ ...base, hp: base.hp + S.level * 2, dmg: base.dmg + Math.floor(S.level / 3) }, false);
    }

    // Бой
    if (act === "attack") return playerAttack();
    if (act === "block") return playerBlock();
    if (act === "flee") {
      pushLog("Ты отступил в город.");
      return endFight("town");
    }
  }

  document.addEventListener("click", (e) => {
    // Клик по затемнению вне панели закрывает её.
    if (e.target === sheetEl) return closeSheet();
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    handleAction(btn);
  });

  // Закрыли приложение в бою — при возврате в городе. Зелья не сохраняем между сессиями.
  if (S.screen === "fight") S.screen = "town";
  S.activePotions = [];
  if (!S.faction) S.screen = "start";
  if (S.faction && S.hp <= 0) S.hp = playerMaxHp();

  applyTheme();
  render();
})();
