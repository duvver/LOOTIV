const crypto = require('node:crypto');

const COLORS = ['kirmizi', 'sari', 'mavi', 'siyah'];
const MIN_NUMBER = 1;
const MAX_NUMBER = 13;

function createTileSet() {
  const tiles = [];
  for (const color of COLORS) {
    for (let number = MIN_NUMBER; number <= MAX_NUMBER; number++) {
      tiles.push({ id: `${color}-${number}-a`, color, number, joker: false });
      tiles.push({ id: `${color}-${number}-b`, color, number, joker: false });
    }
  }
  tiles.push({ id: 'joker-1', color: null, number: null, joker: true });
  tiles.push({ id: 'joker-2', color: null, number: null, joker: true });
  return tiles;
}

function shuffle(tiles) {
  const arr = tiles.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Karistirilmis destenin basindan ilk sahte-okey-olmayan tasi gosterge olarak
// ayirir (sahte okey gosterge gelirse bir sonraki tasa gecmek, yeniden cekmekle
// esdeger - deste zaten rastgele karistirilmis oldugu icin).
function extractIndicator(shuffledDeck) {
  const deck = shuffledDeck.slice();
  const idx = deck.findIndex((t) => !t.joker);
  const [indicator] = deck.splice(idx, 1);
  return { indicator, deck };
}

function realOkeySpecFor(indicator) {
  return {
    color: indicator.color,
    number: indicator.number === MAX_NUMBER ? MIN_NUMBER : indicator.number + 1,
  };
}

function isOkeyTile(tile, okeySpec) {
  return tile.joker || (tile.color === okeySpec.color && tile.number === okeySpec.number);
}

function tileKey(color, number) {
  return `${color}|${number}`;
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

function tilesToCounts(tiles) {
  const counts = {};
  for (const color of COLORS) {
    for (let number = MIN_NUMBER; number <= MAX_NUMBER; number++) {
      counts[tileKey(color, number)] = 0;
    }
  }
  let jokerCount = 0;
  for (const t of tiles) {
    if (t.joker) jokerCount++;
    else counts[tileKey(t.color, t.number)]++;
  }
  return { counts, jokerCount };
}

function countsSignature(counts, jokerCount) {
  let sig = String(jokerCount);
  for (const color of COLORS) {
    for (let number = MIN_NUMBER; number <= MAX_NUMBER; number++) {
      sig += counts[tileKey(color, number)];
    }
  }
  return sig;
}

// 14 tasi, her biri 3+ uzunlugunda seri (ayni renk, ardisik sayi) veya grup
// (ayni sayi, 2-4 farkli renk) parcalarina tam bolen bir dizilim var mi arar.
// Gercek okey tasi (okeySpec ile eslesen) hem kendi degeriyle hem joker olarak
// kullanilabilir; bu yuzden ayri bir "wildcard havuzu" olarak degil, ait oldugu
// sayi/renk hucresinden gerektiginde odunc alinarak modellenir.
function canFormRunsAndSets(tiles, okeySpec) {
  if (tiles.length !== 14) return false;
  const { counts, jokerCount } = tilesToCounts(tiles);
  const okeyKey = tileKey(okeySpec.color, okeySpec.number);
  const memo = new Map();

  function takeWildcard(tempCounts, tempJoker) {
    if (tempJoker > 0) return { counts: tempCounts, joker: tempJoker - 1, ok: true };
    if (tempCounts[okeyKey] > 0) {
      const next = { ...tempCounts, [okeyKey]: tempCounts[okeyKey] - 1 };
      return { counts: next, joker: tempJoker, ok: true };
    }
    return { ok: false };
  }

  function takeCell(tempCounts, tempJoker, k) {
    if (tempCounts[k] > 0) {
      return { counts: { ...tempCounts, [k]: tempCounts[k] - 1 }, joker: tempJoker, ok: true };
    }
    return takeWildcard(tempCounts, tempJoker);
  }

  function solve(counts_, jokerCount_) {
    const sig = countsSignature(counts_, jokerCount_);
    if (memo.has(sig)) return memo.get(sig);

    let target = null;
    outer: for (const color of COLORS) {
      for (let number = MIN_NUMBER; number <= MAX_NUMBER; number++) {
        if (counts_[tileKey(color, number)] > 0) {
          target = { color, number };
          break outer;
        }
      }
    }

    if (!target) {
      const result = jokerCount_ === 0;
      memo.set(sig, result);
      return result;
    }

    const { color: c, number: n } = target;

    // ---- Gruplar (ayni sayi, farkli renkler) ----
    const otherColors = COLORS.filter((x) => x !== c);
    for (const size of [2, 3]) {
      for (const combo of combinations(otherColors, size)) {
        const groupColors = [c, ...combo];
        let tempCounts = counts_;
        let tempJoker = jokerCount_;
        let ok = true;
        for (const gc of groupColors) {
          const step = takeCell(tempCounts, tempJoker, tileKey(gc, n));
          if (!step.ok) { ok = false; break; }
          tempCounts = step.counts;
          tempJoker = step.joker;
        }
        if (ok && solve(tempCounts, tempJoker)) {
          memo.set(sig, true);
          return true;
        }
      }
    }

    // ---- Seriler (ayni renk, ardisik sayilar) ----
    for (let s = MIN_NUMBER; s <= n; s++) {
      for (let e = n; e <= MAX_NUMBER; e++) {
        if (e - s + 1 < 3) continue;
        let tempCounts = counts_;
        let tempJoker = jokerCount_;
        let ok = true;
        for (let pos = s; pos <= e; pos++) {
          const step = takeCell(tempCounts, tempJoker, tileKey(c, pos));
          if (!step.ok) { ok = false; break; }
          tempCounts = step.counts;
          tempJoker = step.joker;
        }
        if (ok && solve(tempCounts, tempJoker)) {
          memo.set(sig, true);
          return true;
        }
      }
    }

    memo.set(sig, false);
    return false;
  }

  return solve(counts, jokerCount);
}

// Cift (7 ikili) bitis kontrolu. Gercek okey tasinin tum kopyalari joker
// havuzuna dahil edilir (tek basli kalan tekli taslari eslemek icin); kalan
// tek (count===1) farkli anahtar sayisi, kullanilabilir joker havuzundan
// fazla olamaz.
function canFormSevenPairs(tiles, okeySpec) {
  if (tiles.length !== 14) return false;
  const { counts, jokerCount } = tilesToCounts(tiles);
  const okeyKey = tileKey(okeySpec.color, okeySpec.number);
  let pool = jokerCount + (counts[okeyKey] || 0);
  let singles = 0;
  for (const color of COLORS) {
    for (let number = MIN_NUMBER; number <= MAX_NUMBER; number++) {
      const k = tileKey(color, number);
      if (k === okeyKey) continue;
      const c = counts[k];
      // Her 2 kopya kendi kendine cift olusturur; tek kalan wildcard ister.
      // 0 → 0 single, 1 → 1 single, 2 → 0 single, 3 → 1 single, 4 → 0 single
      if (c % 2 === 1) singles++;
    }
  }
  // okey havuzunun kendisi de cift yapmak zorunda: pool'dan singles kadar wildcard kullanilir,
  // kalan pool tek ise 1 wildcard cift eslenemez (ama okey tasi zaten 7. cifti yapabilir).
  // Toplamda 7 cift = 14 tas: singles kadar wildcard + kalanlar kendi aralarinda cift.
  if (pool < singles) return false;
  const remaining = pool - singles;
  // Kalan wildcardlar kendi aralarinda ciftlesmeli (cift sayida olmali)
  // ve toplam cift sayisi 7 olmali.
  // Toplam cift = (non-okey ciftler) + singles (wildcard ile eslenen) + remaining/2 (wildcard ciftleri)
  // non-okey ciftler: okey olmayan taslarin toplami - singles = (14 - pool) - singles ... karmasik.
  // Basit kontrol: pool >= singles ve toplam 14 tas 7 cifte bolunebilir (remaining cift ise).
  return remaining % 2 === 0;
}

function isValidFinishingHand(tiles, okeySpec) {
  return canFormSevenPairs(tiles, okeySpec) || canFormRunsAndSets(tiles, okeySpec);
}

module.exports = {
  COLORS,
  MIN_NUMBER,
  MAX_NUMBER,
  createTileSet,
  shuffle,
  extractIndicator,
  realOkeySpecFor,
  isOkeyTile,
  canFormRunsAndSets,
  canFormSevenPairs,
  isValidFinishingHand,
};
