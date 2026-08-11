// 101 Okey el/grup dogrulama ve puan hesaplama.
// Kaynak kurallar: 101elit.com/nasil-oynanir.html
// - Seri: ayni renk, ardisik, en az 3 tas. 12-13-1 GECERSIZ (donus yok).
// - Per: ayni sayi, farkli renkler, 3 veya 4 tas.
// - Cift: birebir ayni tas (renk+sayi) 2 adet; okey her tasin yerine gecebilir.
// - Okey (gosterge+1 tasi) her grubu tamamlayabilir ve
//   doldurdugu pozisyonun sayi degerini alir.
// - Sahte Okey (joker:true) yalnizca gercek okeyin kopyasidir, wildcard degildir.

const { COLORS } = require('./okeyLogic');

function isWild(tile, okeySpec) {
  // Yalnizca GERCEK OKEY (joker: false olup okeySpec ile eslesen) wildcard sayilir.
  return !tile.joker && okeySpec && tile.color === okeySpec.color && tile.number === okeySpec.number;
}

function getEffectiveTile(tile, okeySpec) {
  if (tile.joker && okeySpec) {
    // Sahte okey gercek okeyin kildigina burunur
    return { ...tile, color: okeySpec.color, number: okeySpec.number, joker: true };
  }
  return tile;
}

// Seri dogrulama: Istakadaki (dizilisteki) siraya gore SIKI (strict) kontrol yapar!
function validateSeri(tiles, okeySpec) {
  if (!Array.isArray(tiles) || tiles.length < 3) return null;
  const effTiles = tiles.map(t => getEffectiveTile(t, okeySpec));
  
  let seriesColor = null;
  for (const t of effTiles) {
    if (!isWild(t, okeySpec)) {
      seriesColor = t.color;
      break;
    }
  }
  if (!seriesColor) return null; 

  let expectedNumber = -1;
  for (const t of effTiles) {
    if (isWild(t, okeySpec)) {
      if (expectedNumber !== -1) expectedNumber++;
    } else {
      if (t.color !== seriesColor) return null;
      if (expectedNumber !== -1 && t.number !== expectedNumber) return null;
      expectedNumber = t.number + 1;
    }
  }
  
  const firstNormalIndex = effTiles.findIndex(t => !isWild(t, okeySpec));
  const firstNormal = effTiles[firstNormalIndex];
  
  const lo = firstNormal.number - firstNormalIndex;
  const hi = lo + tiles.length - 1;
  
  if (lo < 1) return null;
  if (hi > 13) return null; 
  
  const value = ((lo + hi) * (hi - lo + 1)) / 2;
  return { kind: 'seri', value, lo, hi, color: seriesColor };
}

// Per dogrulama
function validatePer(tiles, okeySpec) {
  if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 4) return null;
  const effTiles = tiles.map(t => getEffectiveTile(t, okeySpec));
  const wilds = effTiles.filter((t) => isWild(t, okeySpec));
  const normals = effTiles.filter((t) => !isWild(t, okeySpec));
  if (normals.length === 0) return null;

  const number = normals[0].number;
  if (!normals.every((t) => t.number === number)) return null;

  const colorsUsed = new Set(normals.map((t) => t.color));
  if (colorsUsed.size !== normals.length) return null; 
  if (normals.length + wilds.length > 4) return null; 

  return { kind: 'per', value: number * tiles.length, number, colorsUsed: [...colorsUsed] };
}

function validateSeriOrPer(tiles, okeySpec) {
  return validateSeri(tiles, okeySpec) || validatePer(tiles, okeySpec);
}

// Cift dogrulama
function validateCift(tiles, okeySpec) {
  if (!Array.isArray(tiles) || tiles.length !== 2) return null;
  const effTiles = tiles.map(t => getEffectiveTile(t, okeySpec));
  const normals = effTiles.filter((t) => !isWild(t, okeySpec));
  if (normals.length === 2) {
    const [a, b] = normals;
    if (a.color === b.color && a.number === b.number) return { kind: 'cift' };
    return null;
  }
  return { kind: 'cift' };
}

function canProcessSeri(meld, tile, okeySpec) {
  if (meld.kind !== 'seri') return null;
  const effTile = getEffectiveTile(tile, okeySpec);
  if (isWild(effTile, okeySpec)) {
    if (meld.hi < 13) return { lo: meld.lo, hi: meld.hi + 1, at: 'end' };
    if (meld.lo > 1) return { lo: meld.lo - 1, hi: meld.hi, at: 'start' };
    return null;
  }
  if (effTile.color !== meld.color) return null;
  if (effTile.number === meld.hi + 1 && meld.hi < 13) return { lo: meld.lo, hi: meld.hi + 1, at: 'end' };
  if (effTile.number === meld.lo - 1 && meld.lo > 1) return { lo: meld.lo - 1, hi: meld.hi, at: 'start' };
  return null;
}

function canProcessPer(meld, tile, okeySpec) {
  if (meld.kind !== 'per') return null;
  if (meld.tiles.length >= 4) return null;
  const effTile = getEffectiveTile(tile, okeySpec);
  if (isWild(effTile, okeySpec)) return { at: 'end' };
  if (effTile.number !== meld.number) return null;
  if (meld.colorsUsed.includes(effTile.color)) return null;
  return { at: 'end' };
}

function penaltyOf(tiles, okeySpec) {
  let total = 0;
  for (const t of tiles) {
    if (isWild(t, okeySpec)) total += 101;
    else if (t.joker) total += 101;
    else total += t.number;
  }
  return total;
}

function canReplaceJoker(meld, tile, targetJokerId, okeySpec) {
  const effTile = getEffectiveTile(tile, okeySpec);
  if (isWild(effTile, okeySpec)) return false; 
  
  const tIdx = meld.tiles.findIndex(t => t.id === targetJokerId);
  if (tIdx === -1) return false;
  
  const targetTile = getEffectiveTile(meld.tiles[tIdx], okeySpec);
  if (!isWild(targetTile, okeySpec)) return false; 

  const newTiles = [...meld.tiles];
  newTiles[tIdx] = tile;
  
  const valid = validateSeriOrPer(newTiles, okeySpec);
  if (valid) return true;
  return false;
}

module.exports = {
  isWild,
  validateSeri,
  validatePer,
  validateSeriOrPer,
  validateCift,
  canProcessSeri,
  canProcessPer,
  canReplaceJoker,
  penaltyOf,
};
