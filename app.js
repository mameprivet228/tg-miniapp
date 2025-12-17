// ===== Telegram WebApp init + viewport fix =====
console.log("APP.JS LOADED OK");
const tg = window.Telegram?.WebApp;

function applyTgViewport() {
  const h = tg?.viewportStableHeight || tg?.viewportHeight;
  if (h) document.documentElement.style.setProperty("--tg-vh", `${h}px`);
}

if (tg) {
  tg.ready();
  tg.expand();

  // Telegram theme → CSS vars
  const p = tg.themeParams || {};
  const root = document.documentElement;
  const setVar = (name, val) => { if (val) root.style.setProperty(name, val); };

  setVar("--bg", p.bg_color);
  setVar("--text", p.text_color);
  if (p.hint_color) root.style.setProperty("--muted", `${p.hint_color}CC`);
  setVar("--accent", p.button_color);

  applyTgViewport();
  tg.onEvent?.("viewportChanged", applyTgViewport);
} else {
  // браузер
  document.documentElement.style.setProperty("--tg-vh", "100vh");
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

// подсказка (простая стратегия)
function recommendAction(playerSum, dealerUpRank) {
  const dealerUp = cardValueRank(dealerUpRank);
  if (playerSum <= 11) return "hit";
  if (playerSum >= 17) return "stand";
  return dealerUp >= 7 ? "hit" : "stand";
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

// Авто-обёртка “стол”, если в index.html нет div.table
function ensureTableWrapper(cardsEl) {
  if (!cardsEl) return;
  const parent = cardsEl.parentElement;
  if (!parent || parent.classList.contains("table")) return;
  const wrap = document.createElement("div");
  wrap.className = "table";
  parent.insertBefore(wrap, cardsEl);
  wrap.appendChild(cardsEl);
}
ensureTableWrapper(elDealerCards);
ensureTableWrapper(elPlayerCards);

// Рендер карт + “deal” анимация
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

// индекс анимации
let anim = { who: null, index: -1 };

function setButtons() {
  btnHit.disabled = !inRound;
  btnStand.disabled = !inRound;
}

function draw() {
  const dealerAnim = anim.who === "dealer" ? anim.index : -1;
  const playerAnim = anim.who === "player" ? anim.index : -1;

  renderCards(elDealerCards, dealer, dealerHidden, dealerAnim);
  renderCards(elPlayerCards, player, false, playerAnim);
  anim = { who: null, index: -1 };

  const ps = handValue(player);
  const ds = handValue(dealer);

  elPlayerSum.textContent = ps;
  elDealerSum.textContent = dealerHidden ? "?" : ds;

  if (inRound) {
    const dealerUp = dealer[1]?.r ?? dealer[0]?.r;
    const prob = bustProbabilityExact(player, deck);
    const rec = recommendAction(ps, dealerUp);
    const recRu = rec === "hit" ? "ВЗЯТЬ" : "ОСТАНОВИТЬСЯ";

    elBustProb.textContent = `${formatPercent(prob)} (по оставшейся колоде: ${deck.length} карт)`;
    elHint.textContent = basicHint(ps, dealerUp);
    elComment.textContent = `Риск перебора: ${Math.round(prob*100)}%. Рекомендация: ${recRu}.`;
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

function endRound() {
  dealerHidden = false;

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

  if (ps > 21) tg?.HapticFeedback?.notificationOccurred?.("error");
  else if (ds > 21 || ps > ds) tg?.HapticFeedback?.notificationOccurred?.("success");
  else tg?.HapticFeedback?.notificationOccurred?.("warning");
}

// events
btnNew.addEventListener("click", startRound);
btnHit.addEventListener("click", hit);
btnStand.addEventListener("click", stand);

// init
setButtons();
draw();

