require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const okey = require('../lib/okeyLogic');
const { OkeyTable } = require('../lib/okeyTable');

function t(color, number, suffix = '') {
  return { id: `${color}-${number}-${suffix || Math.random()}`, color, number, joker: false };
}
function j(id) {
  return { id, color: null, number: null, joker: true };
}

async function main() {
  await db.init();

  const names = ['OkeyTest1', 'OkeyTest2', 'OkeyTest3', 'OkeyTest4'];
  const users = [];
  for (const name of names) {
    let user = await db.getUserByRumuz(name);
    if (!user) {
      const id = await db.createUser({
        rumuz: name,
        email: `${name.toLowerCase()}@test.local`,
        passwordHash: bcrypt.hashSync('test1234', 10),
        termsAccepted: true,
      });
      user = await db.getUserById(id);
    }
    await db.adjustLt(user.id, 1000 - user.lt_balance);
    user = await db.getUserById(user.id);
    users.push(user);
  }

  const table = new OkeyTable();
  const results = [];
  table.on('hand-result', (r) => results.push(r));
  table.on('log', (m) => console.log('[LOG]', m));
  // server.js'deki gercek 'hand-result' dinleyicisiyle ayni mantik (game_logs yazimi).
  table.on('hand-result', ({ handNumber, participants }) => {
    (async () => {
      for (const p of participants) {
        const freshUser = await db.getUserById(p.userId);
        const totalSnapshot = freshUser ? freshUser.lt_balance : 0;
        const result = p.ltChange > 0 ? 'win' : 'lose';
        await db.logGameResult({
          userId: p.userId,
          rumuz: p.name,
          handNumber,
          playedLt: Math.abs(p.ltChange),
          result,
          ltChange: p.ltChange,
          totalLtSnapshot: totalSnapshot,
          game: 'okey',
        });
      }
    })().catch((err) => console.error('game_logs yazim hatasi:', err));
  });

  for (let i = 0; i < 4; i++) {
    const res = await table.sit(users[i], i);
    if (res.error) throw new Error(res.error);
  }
  clearTimeout(table.startTimer);
  table.pendingStartCountdown = false;
  table.startHand();
  clearTimeout(table.turnTimer);

  // Determinism icin gosterge/okey'i elle sabitliyoruz.
  table.okeySpec = { color: 'kirmizi', number: 5 };
  table.indicator = { id: 'kirmizi-4-b', color: 'kirmizi', number: 4, joker: false };

  // Seat 0: gecerli 14 (run 1-4 kirmizi, run 5-7 sari, run 8-10 mavi, grup 11) + 1 fazla tas = 15
  const winningHand = [
    t('kirmizi', 1), t('kirmizi', 2), t('kirmizi', 3), t('kirmizi', 4),
    t('sari', 5), t('sari', 6), t('sari', 7),
    t('mavi', 8), t('mavi', 9), t('mavi', 10),
    t('siyah', 11), t('kirmizi', 11), t('sari', 11), t('mavi', 11),
    t('siyah', 1), // fazla tas (elden sonrasi 15.)
  ];
  if (!okey.isValidFinishingHand(winningHand.slice(0, 14), table.okeySpec)) {
    throw new Error('Test kurulumu hatali: crafted el gecerli degil.');
  }

  table.seats[0].tiles = winningHand;
  // Seat 1 gercek okey (kirmizi 5) tutuyor -> cifte odemeli olmali.
  table.seats[1].tiles = [t('kirmizi', 5), t('sari', 2), t('mavi', 3)];
  table.seats[2].tiles = [t('siyah', 2), t('sari', 3)];
  table.seats[3].tiles = [t('mavi', 4), t('siyah', 6)];

  table.turnSeat = 0;
  table.hasDrawn = true;
  table.drawSource = 'deck'; // elden bitis testi

  const balancesBefore = {};
  for (const u of users) balancesBefore[u.id] = (await db.getUserById(u.id)).lt_balance;

  const finishRes = table.handleFinish(users[0].id);
  if (finishRes.error) throw new Error(`Bitirme basarisiz: ${finishRes.error}`);

  await new Promise((r) => setTimeout(r, 800));

  console.log('lastHandSummary:', table.lastHandSummary);
  if (!table.lastHandSummary.eldenBitti) throw new Error('eldenBitti true olmaliydi (drawSource=deck).');
  if (table.lastHandSummary.ciftBitti) throw new Error('ciftBitti false olmaliydi (seri/grup ile bitti).');

  const r = results[0];
  console.log('hand-result participants:', r.participants);

  const BASE_STAKE = 20;
  const expectedPerLoser = {
    [users[1].id]: BASE_STAKE * 2 * 1 * 2, // elden(2) * cift-yok(1) * gosterge-sahibi(2) = 80
    [users[2].id]: BASE_STAKE * 2 * 1 * 1, // 40
    [users[3].id]: BASE_STAKE * 2 * 1 * 1, // 40
  };
  let totalExpected = 0;
  for (const [uid, amt] of Object.entries(expectedPerLoser)) totalExpected += amt;

  for (const p of r.participants) {
    const fresh = await db.getUserById(p.userId);
    const expectedChange = p.userId === users[0].id ? totalExpected : -expectedPerLoser[p.userId];
    if (p.ltChange !== expectedChange) {
      throw new Error(`${p.name} icin ltChange yanlis: beklenen ${expectedChange}, gelen ${p.ltChange}`);
    }
    const expectedBalance = balancesBefore[p.userId] + p.ltChange;
    if (fresh.lt_balance !== expectedBalance) {
      throw new Error(`${p.name} bakiyesi yanlis: beklenen ${expectedBalance}, gelen ${fresh.lt_balance}`);
    }
    console.log(`  ${p.name}: degisim=${p.ltChange} (beklenen ${expectedChange}) yeni bakiye=${fresh.lt_balance} OK`);
  }

  console.log(`Kazanan toplam: ${totalExpected} LT (beklenen 160) -> ${totalExpected === 160 ? 'OK' : 'HATA'}`);
  if (totalExpected !== 160) throw new Error('Toplam kazanc beklenenden farkli.');

  const logs = await db.getRecentGameLogs(10);
  const okeyLogs = logs.filter((l) => l.game === 'okey' && l.hand_number === r.handNumber);
  console.log(`game_logs icinde ${okeyLogs.length} okey satiri bulundu (4 beklenir).`);
  if (okeyLogs.length !== 4) throw new Error('game_logs satir sayisi yanlis.');

  clearTimeout(table.startTimer);
  clearTimeout(table.turnTimer);
  await db.pool.end();
  console.log('TEST TAMAMLANDI: basarili (bitirme + elden + gosterge-sahibi cifte odeme dogrulandi).');
}

main().catch((err) => {
  console.error('TEST BASARISIZ:', err);
  process.exit(1);
});
