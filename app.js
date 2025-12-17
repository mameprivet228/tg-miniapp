// ===== Telegram WebApp init + theming =====
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();

  const p = tg.themeParams || {};
  const root = document.documentElement;
  const setVar = (name, val) => { if (val) root.style.setProperty(name, val); };

  setVar("--bg", p.bg_color);
  setVar("--text", p.text_color);
  if (p.hint_color) root.style.setProperty("--muted", `${p.hint_color}CC`);
  setVar("--accent", p.button_color);
}

// ===== Helpers =====
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
function isRed(suit) { return suit === "♥" || suit === "♦"; }
function cardValueRank(rank) {
  if (rank === "A") return 11;
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank);
}
function handValue(hand) {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    sum += cardValueRank(c.r);
    if (c.r === "A") aces++;
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
}
function formatPercent(x) { return `${Math.round(x * 100)}%`; }

function bustProbabilityExact(hand, deck) {
  let bust = 0;
  for (const c of deck) if (handValue([...hand, c]) > 21) bust++;
  return deck.length ? bust / deck.length : 0;
}

// Рекомендация (упрощённая)
function recommendAction(playerSum, dealerUpRank) {
  const dealerUp = cardValueRank(dealerUpRank);
  if (playerSum <= 11) return "hit";
  if (playerSum >= 17) return "stand";
  if (dealerUp >= 7) return "hit";
  return "stand";
}

function basicHint(playerSum, dealerUpRank) {
  const rec = recommendAction(playerSum, dealerUpRank);
  if (playerSum <= 11) return "Бери карту: перебора не будет.";
  if (playerSum >= 17) return "Чаще лучше остановиться: риск перебора высокий.";
  return rec === "hit"
    ? "У дилера сильная открытая карта (7+). Часто стоит брать."
    : "У дилера слабая открытая карта (2–6). Часто стоит остановиться.";
}

function outcomeText(playerSum, dealerSum) {
  if (playerSum > 21) return "Перебор — ты проиграл(а).";
  if (dealerSum > 21) return "Дилер перебрал — ты выиграл(а)!";
  if (playerSum > dealerSum) return "Ты выиграл(а)!";
  if (playerSum < dealerSum) return "Ты проиграл(а).";
  return "Ничья.";
}

// ===== UI refs =====
const elDealerCards = document.getElementById("dealerCards");
const elPlayerCards = document.getElementById("playerCards");
const elDealerSum = document.getElementById("dealerSum");
const elPlayerSum = document.getElementById("playerSum");
const elHint = document.getElementById("hint");
const elBustProb = document.getElementById("bustProb");
const elComment = document.getElementById("comment");
const elStatus = document.getElementById("status");

const btnNew = document.getElementById("btnNew");
const btnHit = document.getElementById("btnHit");
const btnStand = document.getElementById("btnStand");

// Авто-обёртка “стол”
function ensureTableWrapper(cardsEl) {
  if (!cardsEl) return;
  const parent = cardsEl.parentElement;
  if (!parent) return;
  if (parent.classList.contains("table")) return;
  const wrap = document.createElement("div");
  wrap.className = "table";
  parent.insertBefore(wrap, cardsEl);
  wrap.appendChild(cardsEl);
}
ensureTableWrapper(elDealerCards);
ensureTableWrapper(elPlayerCards);

// ===== Lesson + Stats UI injection =====
function findOrCreateStatsAndLesson() {
  // ищем панель (последняя panel обычно с кнопками/edu)
  const panels = document.querySelectorAll(".panel");
  const lastPanel = panels[panels.length - 1];
  if (!lastPanel) return null;

  // если уже есть — не дублируем
  if (document.getElementById("statsBadge")) return true;

  const row = document.createElement("div");
  row.className = "statsRow";

  const badge = document.createElement("div");
  badge.className = "badge";
  badge.id = "statsBadge";
  badge.textContent = "Статы: —";

  const toggle = document.createElement("div");
  toggle.className = "toggle";
  toggle.id = "lessonToggle";
  toggle.innerHTML = `<span class="dot"></span><span id="lessonLabel">Урок: OFF</span>`;

  row.appendChild(badge);
  row.appendChild(toggle);

  // вставим сверху панели (перед controls)
  const controls = lastPanel.querySelector(".controls");
  lastPanel.insertBefore(row, controls);

  // quiz блок
  const edu = lastPanel.querySelector(".edu");
  if (edu) {
    const qt = document.createElement("div");
    qt.className = "edu-title";
    qt.id = "quizTitle";
    qt.textContent = "Вопрос (режим Урок)";

    const qb = document.createElement("div");
    qb.className = "box quiz";
    qb.id = "quizBox";
    qb.style.display = "none";
    qb.innerHTML = `
      <button id="quizHit" class="btn primary">Взять</button>
      <button id="quizStand" class="btn">Остановиться</button>
    `;

    edu.appendChild(qt);
    edu.appendChild(qb);
  }

  return true;
}
findOrCreateStatsAndLesson();

const elStatsBadge = document.getElementById("statsBadge");
const elLessonToggle = document.getElementById("lessonToggle");
const elLessonLabel = document.getElementById("lessonLabel");
const elQuizBox = document.getElementById("quizBox");
const btnQuizHit = document.getElementById("quizHit");
const btnQuizStand = document.getElementById("quizStand");

// ===== Stats storage =====
const STATS_KEY = "bj21_stats_v1";
function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { w:0, l:0, p:0, qOk:0, qAll:0, lesson:false };
    return { w:0,l:0,p:0,qOk:0,qAll:0,lesson:false, ...JSON.parse(raw) };
  } catch {
    return { w:0, l:0, p:0, qOk:0, qAll:0, lesson:false };
  }
}
function saveStats() {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
function renderStats() {
  if (!elStatsBadge) return;
  elStatsBadge.textContent = `Статы: ✅${stats.w} ❌${stats.l} 🤝${stats.p} | Урок: ${stats.qOk}/${stats.qAll}`;
  if (elLessonToggle && elLessonLabel) {
    elLessonToggle.classList.toggle("on", !!stats.lesson);
    elLessonLabel.textContent = `Урок: ${stats.lesson ? "ON" : "OFF"}`;
  }
}
let stats = loadStats();
renderStats();

elLessonToggle?.addEventListener("click", () => {
  stats.lesson = !stats.lesson;
  saveStats();
  renderStats();
  tg?.HapticFeedback?.impactOccurred?.("light");
  // quiz видимость обновим в draw()
  draw();
});

// ===== Render cards with animation target =====
function renderCards(el, cards, hideFirst = false, animateIndex = -1) {
  el.innerHTML = "";
  cards.forEach((c, idx) => {
    const d = document.createElement("div");

    if (hideFirst && idx === 0) {
      d.className = "card back" + (idx === animateIndex ? " deal" : "");
      el.appendChild(d);
      return;
    }

    d.className = "card " + (isRed(c.s) ? "red" : "black") + (idx === animateIndex ? " deal" : "");

    const corner = document.createElement("div");
    corner.className = "corner";
    corner.textContent = c.r;

    const suit = document.createElement("div");
    suit.className = "suit";
    suit.textContent = c.s;

    d.appendChild(corner);
    d.appendChild(suit);
    el.appendChild(d);
  });
}

// ===== State =====
let deck = [];
let player = [];
let dealer = [];
let inRound = false;
let dealerHidden = true;

// какие карты анимируем на следующем draw
let anim = { who: null, index: -1 };

function setButtons() {
  btnHit.disabled = !inRound;
  btnStand.disabled = !inRound;
}

function showQuiz(visible) {
  if (!elQuizBox) return;
  elQuizBox.style.display = visible ? "flex" : "none";
}

function draw() {
  const ps = handValue(player);
  const ds = handValue(dealer);

  // animate only one target per draw
  const dealerAnim = (anim.who === "dealer") ? anim.index : -1;
  const playerAnim = (anim.who === "player") ? anim.index : -1;

  renderCards(elDealerCards, dealer, dealerHidden, dealerAnim);
  renderCards(elPlayerCards, player, false, playerAnim);

  // сброс
  anim = { who: null, index: -1 };

  elPlayerSum.textContent = ps;
  elDealerSum.textContent = dealerHidden ? "?" : ds;

  if (inRound) {
    const dealerUp = dealer[1]?.r ?? dealer[0]?.r;
    const prob = bustProbabilityExact(player, deck);
    const rec = recommendAction(ps, dealerUp);

    elBustProb.textContent = `${formatPercent(prob)} (по оставшейся колоде: ${deck.length} карт)`;
    elHint.textContent = basicHint(ps, dealerUp);

    // Комментарий “люто” — коротко и по делу
    const risk = Math.round(prob * 100);
    const recRu = rec === "hit" ? "ВЗЯТЬ" : "ОСТАНОВИТЬСЯ";
    elComment.textContent = `Риск перебора при взятии: ${risk}%. Рекомендация: ${recRu}.`;

    // Урок: мини-вопрос
    if (stats.lesson) {
      showQuiz(true);
      elStatus.textContent = "Выбери действие в вопросе ниже 👇";
    } else {
      showQuiz(false);
      elStatus.textContent = "";
    }
  } else {
    elBustProb.textContent = "—";
    showQuiz(false);
  }

  renderStats();
}

// ===== Game flow =====
function startRound() {
  deck = buildDeck();
  player = [];
  dealer = [];
  dealerHidden = true;
  inRound = true;

  // раздача 2+2
  player.push(deck.pop());
  anim = { who: "player", index: player.length - 1 };
  draw();

  dealer.push(deck.pop());
  anim = { who: "dealer", index: dealer.length - 1 };
  draw();

  player.push(deck.pop());
  anim = { who: "player", index: player.length - 1 };
  draw();

  dealer.push(deck.pop());
  anim = { who: "dealer", index: dealer.length - 1 };
  draw();

  setButtons();

  const ps = handValue(player);
  const ds = handValue(dealer);
  if (ps === 21 || ds === 21) endRound();

  tg?.HapticFeedback?.impactOccurred?.("light");
}

function hit() {
  if (!inRound) return;
  player.push(deck.pop());
  anim = { who: "player", index: player.length - 1 };
  draw();

  tg?.HapticFeedback?.impactOccurred?.("light");

  if (handValue(player) > 21) endRound();
}

function stand() {
  if (!inRound) return;
  tg?.HapticFeedback?.impactOccurred?.("medium");
  endRound();
}

function applyResultToStats(ps, ds) {
  if (ps > 21) stats.l++;
  else if (ds > 21) stats.w++;
  else if (ps > ds) stats.w++;
  else if (ps < ds) stats.l++;
  else stats.p++;
  saveStats();
  renderStats();
}

function endRound() {
  dealerHidden = false;

  // дилер добирает до 17
  while (handValue(dealer) < 17) {
    dealer.push(deck.pop());
    anim = { who: "dealer", index: dealer.length - 1 };
    draw();
  }

  const ps = handValue(player);
  const ds = handValue(dealer);

  inRound = false;
  setButtons();
  draw();

  elStatus.textContent = outcomeText(ps, ds);
  applyResultToStats(ps, ds);

  const ok = (ps <= 21) && (ds > 21 || ps > ds);
  if (ps > 21) tg?.HapticFeedback?.notificationOccurred?.("error");
  else if (ok) tg?.HapticFeedback?.notificationOccurred?.("success");
  else if (ps === ds) tg?.HapticFeedback?.notificationOccurred?.("warning");
  else tg?.HapticFeedback?.notificationOccurred?.("error");
}

// ===== Lesson quiz logic =====
function gradeQuiz(choice) {
  if (!inRound) return;
  const ps = handValue(player);
  const dealerUp = dealer[1]?.r ?? dealer[0]?.r;
  const rec = recommendAction(ps, dealerUp);

  stats.qAll++;
  const ok = (choice === rec);
  if (ok) stats.qOk++;
  saveStats();
  renderStats();

  if (ok) {
    elStatus.textContent = "✅ Верно! Так чаще лучше по базовой стратегии.";
    tg?.HapticFeedback?.notificationOccurred?.("success");
  } else {
    const recRu = rec === "hit" ? "ВЗЯТЬ" : "ОСТАНОВИТЬСЯ";
    elStatus.textContent = `❌ Не совсем. По стратегии чаще лучше: ${recRu}.`;
    tg?.HapticFeedback?.notificationOccurred?.("warning");
  }
}

btnQuizHit?.addEventListener("click", () => gradeQuiz("hit"));
btnQuizStand?.addEventListener("click", () => gradeQuiz("stand"));

// ===== events =====
btnNew.addEventListener("click", startRound);
btnHit.addEventListener("click", hit);
btnStand.addEventListener("click", stand);

// Первый рендер
setButtons();
draw();
