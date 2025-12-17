// ===== Telegram WebApp init =====
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// ===== Helpers =====
const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function buildDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  // простое перемешивание Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function isRed(suit) { return suit === "♥" || suit === "♦"; }

function cardValueRank(rank) {
  if (rank === "A") return 11;         // сначала туз = 11 (потом корректируем)
  if (rank === "K" || rank === "Q" || rank === "J") return 10;
  return Number(rank);
}

function handValue(hand) {
  // считаем туз как 11, затем уменьшаем до 1 при переборе
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    const v = cardValueRank(c.r);
    sum += v;
    if (c.r === "A") aces++;
  }
  while (sum > 21 && aces > 0) {
    sum -= 10; // 11 -> 1
    aces--;
  }
  return sum;
}

function renderCards(el, cards, hideFirst = false) {
  el.innerHTML = "";
  cards.forEach((c, idx) => {
    const d = document.createElement("div");
    if (hideFirst && idx === 0) {
      d.className = "card back";
      d.textContent = "🂠";
    } else {
      d.className = "card" + (isRed(c.s) ? " red" : "");
      d.textContent = `${c.r}${c.s}`;
    }
    el.appendChild(d);
  });
}

function formatPercent(x) {
  return `${Math.round(x * 100)}%`;
}

// вероятность перебора при следующей карте на основе оставшейся колоды
function bustProbability(currentSum, deck) {
  if (currentSum >= 21) return currentSum > 21 ? 1 : 0;
  let bust = 0;
  for (const c of deck) {
    let testHand = [{r:"X",s:"?"}]; // заглушка
    // проще: считаем добавку карты как значение, но с тузом аккуратно
    // корректнее: симулируем добавление карты к виртуальной руке без инфо о тузах игрока сложно.
    // Поэтому делаем точный расчет через "виртуальную руку" — будем передавать hand отдельно ниже.
  }
  return 0;
}

function bustProbabilityExact(hand, deck) {
  let bust = 0;
  for (const c of deck) {
    const hv = handValue([...hand, c]);
    if (hv > 21) bust++;
  }
  return deck.length ? bust / deck.length : 0;
}

// простая подсказка (образовательная, без гарантии оптимальности)
function basicHint(playerSum, dealerUpRank) {
  const dealerUp = cardValueRank(dealerUpRank);

  // очень упрощенная логика:
  if (playerSum <= 11) return "Почти всегда стоит брать карту: перебора не будет.";
  if (playerSum >= 17) return "Чаще выгодно остановиться: риск перебора высокий, а улучшение небольшое.";

  // 12–16
  if (dealerUp >= 7) return "У дилера сильная открытая карта (7+). Часто имеет смысл брать карту.";
  return "У дилера слабая открытая карта (2–6). Часто имеет смысл остановиться и дать дилеру перебрать.";
}

function outcomeText(playerSum, dealerSum) {
  if (playerSum > 21) return "Перебор — ты проиграл(а).";
  if (dealerSum > 21) return "Дилер перебрал — ты выиграл(а)!";
  if (playerSum > dealerSum) return "Ты выиграл(а)!";
  if (playerSum < dealerSum) return "Ты проиграл(а).";
  return "Ничья.";
}

// ===== State =====
let deck = [];
let player = [];
let dealer = [];
let inRound = false;
let dealerHidden = true;

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

  // дилеру скрываем сумму, пока скрыта первая карта
  elDealerSum.textContent = dealerHidden ? "?" : ds;

  // образовательные блоки
  if (inRound) {
    const dealerUp = dealer[1]?.r ?? dealer[0]?.r;
    const prob = bustProbabilityExact(player, deck);
    elBustProb.textContent = `${formatPercent(prob)} (по оставшейся колоде: ${deck.length} карт)`;
    elHint.textContent = basicHint(ps, dealerUp);

    // комментарий: "почему" + риск
    if (ps >= 12 && ps <= 16) {
      elComment.textContent = `При сумме ${ps} решение зависит от открытой карты дилера и риска перебора (${formatPercent(prob)}).`;
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

  // раздача: игрок 2, дилер 2 (первую дилера скрываем)
  player.push(deck.pop(), deck.pop());
  dealer.push(deck.pop(), deck.pop());

  setButtons();
  draw();

  // авто-проверка блэкджека
  const ps = handValue(player);
  const ds = handValue(dealer);
  if (ps === 21 || ds === 21) endRound();
}

function hit() {
  if (!inRound) return;
  player.push(deck.pop());
  const ps = handValue(player);
  draw();
  if (ps > 21) endRound();
}

function stand() {
  if (!inRound) return;
  endRound();
}

function endRound() {
  dealerHidden = false;

  // дилер добирает до 17
  while (handValue(dealer) < 17) {
    dealer.push(deck.pop());
  }

  const ps = handValue(player);
  const ds = handValue(dealer);

  inRound = false;
  setButtons();
  draw();

  elStatus.textContent = outcomeText(ps, ds);

  // Telegram haptic (если доступно)
  tg?.HapticFeedback?.notificationOccurred(ps > 21 ? "error" : (ps > ds || ds > 21 ? "success" : "warning"));
}

// ===== events =====
btnNew.addEventListener("click", startRound);
btnHit.addEventListener("click", hit);
btnStand.addEventListener("click", stand);

// первый рендер
setButtons();
draw();