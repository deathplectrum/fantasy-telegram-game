// «Долг души» — первая рабочая версия.
// Город (хаб), вступление с богиней, зелья перед боем (максимум 2: по одному каждого вида),
// бой в реальном времени с таймерными атаками и ручным блоком, ручной спутник-зверь.
// Прогресс хранится в localStorage (с try/catch) и не обязателен для игры.

(function () {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  const SAVE_KEY = "dolg-dushi-save-v2";
  const MAX_LEVEL = 100;
  const app = document.getElementById("app");

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

  // Зелья: покупаются в городе, пьются только до боя. Максимум 2 — по одному каждого вида.
  const POTIONS = {
    strength: { name: "Зелье силы", price: 15, desc: "+3 к урону в бою" },
    guard: { name: "Зелье защиты", price: 15, desc: "−2 к урону врага" },
  };

  // Спутник-зверь. Найдётся в сюжете; даёт постоянный бонус.
  const COMPANION = { name: "Лисица Тень-в-Листве", bonus: "guard", desc: "−1 к урону врага" };

  // ---------- Состояние ----------
  function newState() {
    return {
      screen: "start", faction: null, level: 1, xp: 0, gold: 0, hp: 0,
      story: 0,            // 0 — вступление; 1 — богиня рассказала о долге; 2 — лиса найдена
      potions: {},         // запас зелий { strength: 1, guard: 0 }
      activePotions: [],   // выпитые перед боем (максимум 2, разные виды)
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

  // ---------- Экраны ----------
  function render() {
    if (S.screen === "start") return renderStart();
    if (S.screen === "intro") return renderIntro();
    if (S.screen === "town") return renderTown();
    if (S.screen === "fight") return renderFight();
  }

  function renderStart() {
    app.innerHTML = `
      <h1>Долг души</h1>
      <div class="card">
        <p class="muted">Ты попадаешь в фэнтези-мир. Тебя встречает белая богиня.</p>
        <p>Выбери путь. Его можно сменить позже, несколько раз за игру.</p>
      </div>
      <div class="choice">
        <button data-act="pick" data-faction="sword">Меч: много здоровья и блок</button>
        <button data-act="pick" data-faction="magic">Магия: сильный урон, мало здоровья</button>
      </div>`;
  }

  function renderIntro() {
    const lines = [
      "Богиня смотрит на тебя без улыбки. «Ты должен мне долг. Я дала тебе жизнь в этом мире, и теперь пришло время платить».",
      "Ты не помнишь, что брал в долг. Богиня лишь кивает на дорогу к городу: «Там разберёшься».",
    ];
    app.innerHTML = `
      <h1>Вступление</h1>
      <div class="card">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      <button data-act="to-town">Идти в город</button>`;
  }

  function renderTown() {
    const need = xpNeed(S.level);
    const xpPct = Math.min(100, Math.round((S.xp / need) * 100));
    const potionCount = S.activePotions.length;
    const potionsOwned = Object.entries(POTIONS).filter(([k]) => S.potions[k] > 0);
    const shop = Object.entries(POTIONS)
      .map(([k, p]) => `<button class="secondary" data-act="buy" data-potion="${k}" ${S.gold < p.price ? "disabled" : ""}>Купить: ${p.name} (${p.price} золота)</button>`)
      .join("");
    const drink = potionsOwned.map(([k]) => {
      const active = S.activePotions.includes(k);
      const disabled = active || potionCount >= 2;
      return `<button class="secondary" data-act="drink" data-potion="${k}" ${disabled ? "disabled" : ""}>${active ? "Уже выпито: " : "Выпить: "}${POTIONS[k].name} (${S.potions[k]})</button>`;
    }).join("");
    const companion = S.companion
      ? `<div class="muted">Спутник: ${esc(COMPANION.name)} (${COMPANION.desc})</div>`
      : `<div class="muted">Спутника пока нет.</div>`;

    app.innerHTML = `
      <h1>Город у ворот леса</h1>
      <div class="card">
        <h2>${FACTIONS[S.faction].name} · ${rankFor(S.level)}</h2>
        <div class="stats">
          <span>Уровень: <b>${S.level}</b> / ${MAX_LEVEL}</span>
          <span>Урон: <b>${playerDmg()}</b></span>
          <span>Здоровье: <b>${S.hp}</b> / ${playerMaxHp()}</span>
          <span>Золото: <b>${S.gold}</b></span>
        </div>
        <div class="muted">Опыт до следующего уровня</div>
        <div class="bar xp"><div style="width:${xpPct}%"></div></div>
        ${companion}
      </div>
      <div class="card">
        <h2>Зелья перед боем</h2>
        <p class="muted">Можно выпить до 2 зелий, по одному каждого вида. Во время боя пить нельзя.</p>
        ${drink || '<div class="muted">Запас пуст.</div>'}
        ${S.activePotions.length ? `<div class="muted">Выпито: ${S.activePotions.map((k) => POTIONS[k].name).join(", ")}</div>` : ""}
      </div>
      <div class="card">
        <h2>Лавка</h2>
        ${shop}
      </div>
      <div class="card">
        <h2>Зона: ${ZONE.name}</h2>
        <p class="muted">Уровни ${ZONE.minLevel}–${ZONE.maxLevel}. Ниже своего уровня опыта почти нет.</p>
        <button data-act="enter">В лес</button>
        <button class="secondary" data-act="heal">Отдохнуть в таверне (восстановить здоровье)</button>
      </div>
      <div class="card">
        <h2>Журнал</h2>
        <div class="log">${S.log.length ? S.log.map(esc).join("<br>") : "Пока тихо."}</div>
      </div>`;
  }

  function renderFight() {
    const f = fight;
    const hpPct = Math.max(0, (f.mob.hp / f.mob.maxHp) * 100);
    const playerPct = Math.max(0, (S.hp / playerMaxHp()) * 100);
    app.innerHTML = `
      <h1>${f.isBoss ? "Босс: " : ""}${esc(f.mob.name)}</h1>
      <div class="card">
        <div class="muted">Враг</div>
        <div class="bar enemy"><div style="width:${hpPct}%"></div></div>
        <div class="muted">${Math.max(0, Math.round(f.mob.hp))} / ${f.mob.maxHp}${f.isBoss ? ` · фаза ${f.phase}` : ""}</div>
      </div>
      <div class="card">
        <div class="muted">Ты</div>
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
    // Зелья действуют только на один бой.
    S.activePotions = [];
    S.screen = screen;
    fight = null;
    saveState();
    render();
  }

  // ---------- Действия ----------
  app.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;

    if (act === "pick") {
      S = newState();
      S.faction = btn.dataset.faction;
      S.hp = playerMaxHp();
      S.story = 1;
      S.gold = 30; // стартовые деньги, чтобы купить первое зелье
      S.screen = "intro";
      pushLog(`Ты выбрал путь: ${FACTIONS[S.faction].name}.`);
      saveState();
      return render();
    }
    if (act === "to-town") {
      S.screen = "town";
      saveState();
      return render();
    }
    if (act === "buy") {
      const k = btn.dataset.potion;
      const p = POTIONS[k];
      if (S.gold < p.price) return;
      S.gold -= p.price;
      S.potions[k] = (S.potions[k] || 0) + 1;
      pushLog(`Куплено: ${p.name}.`);
      saveState();
      return render();
    }
    if (act === "drink") {
      const k = btn.dataset.potion;
      if (!S.potions[k] || S.activePotions.includes(k) || S.activePotions.length >= 2) return;
      S.potions[k] -= 1;
      S.activePotions.push(k);
      pushLog(`Выпито перед боем: ${POTIONS[k].name} (${POTIONS[k].desc}).`);
      saveState();
      return render();
    }
    if (act === "heal") {
      S.hp = playerMaxHp();
      pushLog("Таверна вернула здоровье.");
      saveState();
      return render();
    }
    if (act === "enter") {
      if (Math.random() < 0.2) return startFight(BOSS, true);
      const base = MOBS[Math.floor(Math.random() * MOBS.length)];
      return startFight({ ...base, hp: base.hp + S.level * 2, dmg: base.dmg + Math.floor(S.level / 3) }, false);
    }
    if (act === "attack") return playerAttack();
    if (act === "block") return playerBlock();
    if (act === "flee") {
      pushLog("Ты отступил в город.");
      endFight("town");
    }
  });

  // Закрыли приложение в бою — при возврате в городе, без зелий в запасе не теряем.
  if (S.screen === "fight") S.screen = "town";
  S.activePotions = [];
  if (!S.faction) S.screen = "start";
  if (S.screen === "intro" && S.story >= 1 && !S.faction) S.screen = "start";
  if (S.faction && S.hp <= 0) S.hp = playerMaxHp();

  render();
})();
