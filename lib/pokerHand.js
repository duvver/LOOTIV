const crypto = require('node:crypto');

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const HAND_NAMES = [
  'Yuksek Kart',
  'Cift',
  'Iki Cift',
  'Uclu',
  'Kent',
  'Renk',
  'Full',
  'Kare',
  'Renkli Kent',
];

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

function shuffle(deck) {
  const arr = deck.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function cardLabel(card) {
  return `${RANK_NAMES[card.rank]}${SUIT_SYMBOLS[card.suit]}`;
}

function combinations(arr, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) {
      results.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

function evaluate5(cards) {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank);

  const uniq = [...new Set(ranks)];
  let straightHigh = null;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join(',') === '14,5,4,3,2') straightHigh = 5;
  }
  const isStraight = straightHigh !== null;

  if (isFlush && isStraight) return [8, straightHigh];
  if (groups[0].count === 4) return [7, groups[0].rank, groups[1].rank];
  if (groups[0].count === 3 && groups[1].count === 2) return [6, groups[0].rank, groups[1].rank];
  if (isFlush) return [5, ...ranks];
  if (isStraight) return [4, straightHigh];
  if (groups[0].count === 3) return [3, groups[0].rank, ...groups.slice(1).map((g) => g.rank)];
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairRanks = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    return [2, pairRanks[0], pairRanks[1], groups[2].rank];
  }
  if (groups[0].count === 2) return [1, groups[0].rank, ...groups.slice(1).map((g) => g.rank)];
  return [0, ...ranks];
}

function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function evaluateBest(cards7) {
  const combos = combinations(cards7, 5);
  let best = null;
  for (const combo of combos) {
    const score = evaluate5(combo);
    if (!best || compareScores(score, best.score) > 0) {
      best = { score, cards: combo };
    }
  }
  const isRoyal = best.score[0] === 8 && best.score[1] === 14;
  return {
    score: best.score,
    cards: best.cards,
    handRank: best.score[0],
    name: isRoyal ? 'Royal Flush' : HAND_NAMES[best.score[0]],
  };
}

module.exports = {
  SUIT_SYMBOLS,
  RANK_NAMES,
  HAND_NAMES,
  createDeck,
  shuffle,
  cardLabel,
  evaluateBest,
  compareScores,
};
