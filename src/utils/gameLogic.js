'use strict';

// ================= SLOTS =================
const SLOT_SYMBOLS = [
  { emoji: '🍒', weight: 30, triple: 4 },
  { emoji: '🍋', weight: 25, triple: 6 },
  { emoji: '🍇', weight: 20, triple: 10 },
  { emoji: '🔔', weight: 12, triple: 20 },
  { emoji: '💎', weight: 8, triple: 50 },
  { emoji: '7️⃣', weight: 5, triple: 100 },
];
const SLOT_TOTAL = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0);

function spinReel() {
  let r = Math.random() * SLOT_TOTAL;
  for (const s of SLOT_SYMBOLS) {
    r -= s.weight;
    if (r < 0) return s;
  }
  return SLOT_SYMBOLS[0];
}

/** Hitung pengali (total yang dikembalikan / taruhan) untuk 3 simbol. */
function slotMultiplier(reels) {
  const [a, b, c] = reels.map((r) => r.emoji);
  if (a === b && b === c) return { mult: reels[0].triple, label: 'JACKPOT' };
  const cherries = reels.filter((r) => r.emoji === '🍒').length;
  if (cherries === 2) return { mult: 2, label: '2 Cherry' };
  if (a === b || b === c || a === c) return { mult: 0.5, label: 'Sepasang (setengah kembali)' };
  if (cherries === 1) return { mult: 0.25, label: '1 Cherry (seperempat kembali)' };
  return { mult: 0, label: 'Zonk' };
}

/** RTP teoritis, dihitung dengan enumerasi penuh. */
function slotRtp() {
  let rtp = 0;
  for (const x of SLOT_SYMBOLS)
    for (const y of SLOT_SYMBOLS)
      for (const z of SLOT_SYMBOLS) {
        const p = (x.weight * y.weight * z.weight) / SLOT_TOTAL ** 3;
        rtp += p * slotMultiplier([x, y, z]).mult;
      }
  return rtp;
}

// ================= ROULETTE =================
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rouletteColor = (n) => (n === 0 ? 'hijau' : RED.has(n) ? 'merah' : 'hitam');
const COLOR_EMOJI = { merah: '🔴', hitam: '⚫', hijau: '🟢' };

/** Return pengali total (0 jika kalah). */
function rouletteMultiplier(n, pick) {
  if (typeof pick === 'number') return n === pick ? 36 : 0;
  const color = rouletteColor(n);
  if (pick === 'merah' || pick === 'hitam') return color === pick ? 2 : 0;
  if (pick === 'hijau') return n === 0 ? 36 : 0;
  if (pick === 'genap') return n !== 0 && n % 2 === 0 ? 2 : 0;
  if (pick === 'ganjil') return n % 2 === 1 ? 2 : 0;
  return 0;
}

// ================= BLACKJACK =================
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(hand) {
  let total = 0;
  let aces = 0;
  for (const { rank } of hand) {
    if (rank === 'A') { total += 11; aces++; }
    else if ('JQK'.includes(rank)) total += 10;
    else total += Number(rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

const isBlackjack = (hand) => hand.length === 2 && handValue(hand) === 21;
const showHand = (hand) => hand.map((c) => `\`${c.rank}${c.suit}\``).join(' ');

/** Dealer menarik kartu sampai minimal 17. */
function dealerPlay(deck, dealer) {
  while (handValue(dealer) < 17) dealer.push(deck.pop());
}

// ================= DADU / RPS =================
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const rollDie = () => Math.floor(Math.random() * 6) + 1;

const RPS = {
  batu: { emoji: '✊', beats: 'gunting' },
  kertas: { emoji: '🖐️', beats: 'batu' },
  gunting: { emoji: '✌️', beats: 'kertas' },
};

module.exports = {
  SLOT_SYMBOLS, spinReel, slotMultiplier, slotRtp,
  rouletteColor, rouletteMultiplier, COLOR_EMOJI,
  newDeck, handValue, isBlackjack, showHand, dealerPlay,
  DICE_FACES, rollDie, RPS,
};
