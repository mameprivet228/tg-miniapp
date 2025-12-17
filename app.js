// ===== Telegram WebApp init + theming =====
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();

  // Пробуем подхватить цвета темы Telegram
  const p = tg.themeParams || {};
  const root = document.documentElement;

  // helpers
  const setVar = (name, val) => { if (val) root.style.setProperty(name, val); };

  // Telegram: bg_color, text_color, hint_color, button_color, button_text_color, secondary_bg_color
  setVar("--bg", p.bg_color);
  setVar("--text", p.text_color);
  // muted можно приблизить к hint_color
  if (p.hint_color) root.style.setProperty("--muted", `${p.hint_color}CC`);
  // accent = button_color
  setVar("--accent", p.button_color);

  // чуть вибрации на нажатия (если поддерживается)
  tg.MainButton?.hide?.();
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
  while (sum > 21 && aces > 0) {
    sum -= 10; // A: 11 -> 1
    aces--;
  }
  return sum;
}

function formatPercent(x) {
  return `${Math.round(x * 100)}%`;
}

function bustProbabilityExact(hand, deck) {
  let bust = 0;
  for (const c of deck) {
    const hv = handValue([...hand, c]);
    if (hv > 21) bust++;
  }
  return deck.length ? bust / deck.length : 0;
}

// Простая подсказка (образовательная, упрощённая)
function basicHint(playerSum, dealerUpRank) {
  const dealerUp = cardValueRank(dealerUpRank);

  if (playerSum <= 11) return "Бери карту: перебора не будет.";
  if (playerSum >= 17) return "Чаще лучше остановиться: риск перебора высокий.";

  // 12–16
  if (dealerUp >= 7) return "У дилера сильная открытая карта (7+). Часто стоит брать.";
  return "У дилера слабая открытая карта (2–6). Часто стоит остановиться.";
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

// Если ты не добавлял <div class="table"> вручную в index.html — сделаем это автоматически:
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

// Рендер карты (красиво)
function renderCards(el, cards, hideFirst = false) {
  el.innerHTML = "";
  cards.forEach((c, idx) => {
    const d = document.createElement("div");

    if (hideFirst && idx === 0) {
      d.className = "card back";
      el.appendChild(d);
      return;
    }

    d.className = "card " + (isRed(c.s) ? "red" : "black");

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

function setButtons() {
  btnHit.disabled = !inRound;
  btnStand.disabled = !inRound;
}

function draw() {
  renderCards(elDealerCards, dealer, dealerHidden);
  renderCards(elPlayerCards, player, false);

  const ps = handValue(player);
  const ds = handValue(dealer);

  elPlayerSum.textContent = ps;
  elDealerSum.textContent = dealerHidden ? "?" : ds;

  if (inRound) {
    const dealerUp = dealer[1]?.r ?? dealer[0]?.r;
    const prob = bustProbabilityExact(player, deck);

    elBustProb.textContent = `${formatPercent(prob)} (по оставшейся колоде: ${deck.length} карт)`;
    elHint.textContent = basicHint(ps, dealerUp);

    if (ps >= 12 && ps <= 16) {
      elComment.textContent = `При ${ps} решение зависит от карты дилера и риска перебора (${formatPercent(prob)}).`;
    } else {
      elComment.textContent = `Твоя сумма ${ps}. Смотри на вероятность перебора и ожидаемую выгоду.`;
    }

    elStatus.textContent = "";
  } else {
    elBustProb.textContent = "—";
  }
}

function startRound() {
  deck = buildDeck();
  player = [];
  dealer = [];
  dealerHidden = true;
  inRound = true;

  player.push(deck.pop(), deck.pop());
  dealer.push(deck.pop(), deck.pop());

  setButtons();
  draw();

  const ps = handValue(player);
  const ds = handValue(dealer);
  if (ps === 21 || ds === 21) endRound();

  tg?.HapticFeedback?.impactOccurred?.("light");
}

function hit() {
  if (!inRound) return;

  player.push(deck.pop());
  const ps = handValue(player);
  draw();

  tg?.HapticFeedback?.impactOccurred?.("light");

  if (ps > 21) endRound();
}

function stand() {
  if (!inRound) return;
  tg?.HapticFeedback?.impactOccurred?.("medium");
  endRound();
}

function endRound() {
  dealerHidden = false;

  while (handValue(dealer) < 17) {
    dealer.push(deck.pop());
  }

  const ps = handValue(player);
  const ds = handValue(dealer);

  inRound = false;
  setButtons();
  draw();

  elStatus.textContent = outcomeText(ps, ds);

  // haptic итог
  const ok = (ps <= 21) && (ds > 21 || ps >= ds);
  if (ps > 21) tg?.HapticFeedback?.notificationOccurred?.("error");
  else if (ok && ps !== ds) tg?.HapticFeedback?.notificationOccurred?.("success");
  else tg?.HapticFeedback?.notificationOccurred?.("warning");
}

// ===== events =====
btnNew.addEventListener("click", startRound);
btnHit.addEventListener("click", hit);
btnStand.addEventListener("click", stand);

// Первый рендер
setButtons();
draw();
