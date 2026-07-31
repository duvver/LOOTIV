// 101 Okey el/grup dogrulama ve puan hesaplama.
// Kaynak kurallar: 101elit.com/nasil-oynanir.html
// - Seri: ayni renk, ardisik, en az 3 tas. 12-13-1 GECERSIZ (donus yok).
// - Per: ayni sayi, farkli renkler, 3 veya 4 tas.
// - Cift: birebir ayni tas (renk+sayi) 2 adet; okey her tasin yerine gecebilir.
// - Okey (gosterge+1 tasi ve sahte okeyler) her grubu tamamlayabilir ve
//   doldurdugu pozisyonun sayi degerini alir.

const { COLORS } = require('./okeyLogic');

function isWild(tile, okeySpec) {
  return tile.joker || (okeySpec && tile.color === okeySpec.color && tile.number === okeySpec.number);
}

// Seri dogrulama: gecerliyse { kind:'seri', value, lo, hi, color }, degilse null.
function validateSeri(tiles, okeySpec) {
  if (!Array.isArray(tiles) || tiles.length < 3) return null;
  const wilds = tiles.filter((t) => isWild(t, okeySpec));
  const normals = tiles.filter((t) => !isWild(t, okeySpec));
  if (normals.length === 0) return null; // en az 1 gercek tas olmali

  const color = normals[0].color;
  if (!normals.every((t) => t.color === color)) return null;

  const nums = normals.map((t) => t.number).sort((a, b) => a - b);
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === nums[i - 1]) return null; // seri icinde ayni sayi iki kez olamaz
  }

  let freeWilds = wilds.length;
  const span = nums[nums.length - 1] - nums[0] + 1;
  const gaps = span - nums.length;
  if (gaps > freeWilds) return null;
  freeWilds -= gaps;

  // Kalan okeyler seriyi uclardan uzatir: once yukari (13'e kadar), sonra asagi (1'e kadar).
  let lo = nums[0];
  let hi = nums[nums.length - 1];
  while (freeWilds > 0 && hi < 13) { hi++; freeWilds--; }
  while (freeWilds > 0 && lo > 1) { lo--; freeWilds--; }
  if (freeWilds > 0) return null; // okeyler sigmadi

  const value = ((lo + hi) * (hi - lo + 1)) / 2;
  return { kind: 'seri', value, lo, hi, color };
}

// Per dogrulama: gecerliyse { kind:'per', value, number, colorsUsed }, degilse null.
function validatePer(tiles, okeySpec) {
  if (!Array.isArray(tiles) || tiles.length < 3 || tiles.length > 4) return null;
  const wilds = tiles.filter((t) => isWild(t, okeySpec));
  const normals = tiles.filter((t) => !isWild(t, okeySpec));
  if (normals.length === 0) return null;

  const number = normals[0].number;
  if (!normals.every((t) => t.number === number)) return null;

  const colorsUsed = new Set(normals.map((t) => t.color));
  if (colorsUsed.size !== normals.length) return null; // renkler farkli olmali
  if (normals.length + wilds.length > 4) return null; // per en fazla 4 tas

  return { kind: 'per', value: number * tiles.length, number, colorsUsed: [...colorsUsed] };
}

// Seri VEYA per olarak dogrula (acilis gruplari icin).
function validateSeriOrPer(tiles, okeySpec) {
  return validateSeri(tiles, okeySpec) || validatePer(tiles, okeySpec);
}

// Cift dogrulama: tam 2 tas; ikisi ayni tas ya da tas+okey ya da okey+okey.
function validateCift(tiles, okeySpec) {
  if (!Array.isArray(tiles) || tiles.length !== 2) return null;
  const wilds = tiles.filter((t) => isWild(t, okeySpec));
  const normals = tiles.filter((t) => !isWild(t, okeySpec));
  if (normals.length === 2) {
    const [a, b] = normals;
    if (a.color === b.color && a.number === b.number) return { kind: 'cift' };
    return null;
  }
  // 1 tas + 1 okey veya 2 okey her zaman cift sayilir
  return { kind: 'cift' };
}

// Yerdeki bir SERI grubuna tas islenebilir mi? Islenirse yeni {lo,hi} doner.
function canProcessSeri(meld, tile, okeySpec) {
  if (meld.kind !== 'seri') return null;
  if (isWild(tile, okeySpec)) {
    if (meld.hi < 13) return { lo: meld.lo, hi: meld.hi + 1, at: 'end' };
    if (meld.lo > 1) return { lo: meld.lo - 1, hi: meld.hi, at: 'start' };
    return null;
  }
  if (tile.color !== meld.color) return null;
  if (tile.number === meld.hi + 1 && meld.hi < 13) return { lo: meld.lo, hi: meld.hi + 1, at: 'end' };
  if (tile.number === meld.lo - 1 && meld.lo > 1) return { lo: meld.lo - 1, hi: meld.hi, at: 'start' };
  return null;
}

// Yerdeki 3'lu PER grubuna 4. tas islenebilir mi?
function canProcessPer(meld, tile, okeySpec) {
  if (meld.kind !== 'per') return null;
  if (meld.tiles.length >= 4) return null;
  if (isWild(tile, okeySpec)) return { at: 'end' };
  if (tile.number !== meld.number) return null;
  if (meld.colorsUsed.includes(tile.color)) return null;
  return { at: 'end' };
}

// Elde kalan taslarin ceza puani. Okey/sahte okey elde kalirsa 101 ceza.
function penaltyOf(tiles, okeySpec) {
  let total = 0;
  for (const t of tiles) {
    if (isWild(t, okeySpec)) total += 101;
    else total += t.number;
  }
  return total;
}

module.exports = {
  isWild,
  validateSeri,
  validatePer,
  validateSeriOrPer,
  validateCift,
  canProcessSeri,
  canProcessPer,
  penaltyOf,
};
