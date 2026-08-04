const crypto = require('node:crypto');

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_VALUES = { H: 4, S: 3, D: 2, C: 1 };
const RANK_NAMES = {
  6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

const HAND_NAMES = [
  'Yuksek Kart', // 0
  'Per',         // 1
  'Doper',       // 2
  'Uclu',        // 3
  'Kent',        // 4
  'Ful',         // 5 (Full House - in Turkish Poker, Flush beats Full)
  'Renk',        // 6 (Flush)
  'Kare',        // 7
  'Flos',        // 8 (Straight Flush)
];

function getMinRank(playerCount) {
  if (playerCount <= 2) return 9; // 24 cards
  if (playerCount === 3) return 8; // 28 cards
  if (playerCount === 4) return 7; // 32 cards
  return 6; // 36 cards for 5 players
}

function createDeck(playerCount = 4) {
  const deck = [];
  const minRank = getMinRank(playerCount);
  for (const suit of SUITS) {
    for (let rank = minRank; rank <= 14; rank++) {
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

// In Turkish Poker, you only ever hold 5 cards. No need for combinations.
function evaluate5(cards, minRank) {
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
    // Normal straight (e.g. 14, 13, 12, 11, 10)
    if (uniq[0] - uniq[4] === 4) {
      straightHigh = uniq[0];
    }
    // Minor straight (A, minRank, minRank+1, minRank+2, minRank+3)
    // Check if the highest is A (14) and the rest are the lowest possible 4 ranks
    else if (uniq[0] === 14 && 
             uniq[1] === minRank + 3 && 
             uniq[2] === minRank + 2 && 
             uniq[3] === minRank + 1 && 
             uniq[4] === minRank) {
      straightHigh = minRank + 3; // The highest card of the sequence (excluding Ace which acts as low)
    }
  }
  const isStraight = straightHigh !== null;

  // Primary suit weight for tie-breaking
  const primaryRank = isStraight ? straightHigh : groups[0].rank;
  const primaryCards = cards.filter(c => c.rank === primaryRank);
  const primarySuitWeight = Math.max(...primaryCards.map(c => SUIT_VALUES[c.suit] || 0));

  // Hand rankings for Turkish Poker (Flush beats Full House)
  // We append primarySuitWeight as the final tie-breaker element in the score array.
  if (isFlush && isStraight) return [8, straightHigh, primarySuitWeight]; // Straight Flush
  if (groups[0].count === 4) return [7, groups[0].rank, groups[1].rank, primarySuitWeight]; // Four of a kind
  if (isFlush) return [6, ...ranks, primarySuitWeight]; // Flush
  if (groups[0].count === 3 && groups[1].count === 2) return [5, groups[0].rank, groups[1].rank, primarySuitWeight]; // Full House
  if (isStraight) return [4, straightHigh, primarySuitWeight]; // Straight
  if (groups[0].count === 3) return [3, groups[0].rank, ...groups.slice(1).map((g) => g.rank), primarySuitWeight]; // Three of a kind
  if (groups[0].count === 2 && groups[1].count === 2) {
    const pairRanks = [groups[0].rank, groups[1].rank].sort((a, b) => b - a);
    return [2, pairRanks[0], pairRanks[1], groups[2].rank, primarySuitWeight]; // Two pairs
  }
  if (groups[0].count === 2) return [1, groups[0].rank, ...groups.slice(1).map((g) => g.rank), primarySuitWeight]; // One pair
  return [0, ...ranks, primarySuitWeight]; // High card
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

// evaluateBest just evaluates the 5 cards. No combinations needed for 5-card draw.
function evaluateBest(cards, minRank = 6) {
  if (cards.length !== 5) {
    throw new Error('evaluateBest requires exactly 5 cards in Turkish Poker.');
  }
  
  const score = evaluate5(cards, minRank);
  const isRoyal = score[0] === 8 && score[1] === 14;
  
  return {
    score,
    cards,
    handRank: score[0],
    name: isRoyal ? 'Royal Renkli Kent' : HAND_NAMES[score[0]],
  };
}

function getSmartDiscards(cards, minRank) {
  const score = evaluate5(cards, minRank);
  const category = score[0];
  
  if (category >= 4) {
    return []; // Made hand (Straight or better)
  }
  
  const ranks = cards.map(c => c.rank);
  if (category === 3) { // Trips
    return cards.filter(c => c.rank !== score[1]);
  }
  if (category === 2) { // Two Pair
    return cards.filter(c => c.rank !== score[1] && c.rank !== score[2]);
  }
  if (category === 1) { // One Pair
    return cards.filter(c => c.rank !== score[1]);
  }
  
  // High Card: Check for draws
  const suitCounts = {};
  cards.forEach(c => suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1);
  const flushSuit = Object.keys(suitCounts).find(suit => suitCounts[suit] === 4);
  if (flushSuit) {
    return cards.filter(c => c.suit !== flushSuit);
  }
  
  const uniqRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let straightCards = null;
  for (let i = 0; i <= uniqRanks.length - 4; i++) {
    if (uniqRanks[i] - uniqRanks[i+3] === 3) {
       straightCards = uniqRanks.slice(i, i+4);
       break;
    }
  }
  if (!straightCards && uniqRanks.includes(14) && uniqRanks.includes(minRank) && uniqRanks.includes(minRank+1) && uniqRanks.includes(minRank+2)) {
    straightCards = [14, minRank, minRank+1, minRank+2];
  }
  
  if (straightCards) {
     return cards.filter(c => !straightCards.includes(c.rank));
  }
  
  // Total trash: keep the highest card, discard the rest
  const highestRank = Math.max(...ranks);
  return cards.filter(c => c.rank !== highestRank);
}

module.exports = {
  SUIT_SYMBOLS,
  RANK_NAMES,
  HAND_NAMES,
  getMinRank,
  createDeck,
  shuffle,
  cardLabel,
  evaluateBest,
  compareScores,
  getSmartDiscards,
};
