require('dotenv').config({ path: 'c:/Users/eness/Desktop/LOOTIV/.env' });
const bcrypt = require('bcryptjs');
const db = require('c:/Users/eness/Desktop/LOOTIV/lib/db');
const { OkeyTable } = require('c:/Users/eness/Desktop/LOOTIV/lib/okeyTable');

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
    if (user.lt_balance < 1000) await db.adjustLt(user.id, 1000 - user.lt_balance);
    user = await db.getUserById(user.id);
    users.push(user);
    console.log(`Kullanici hazir: ${user.rumuz} (id=${user.id}, bakiye=${user.lt_balance})`);
  }

  const table = new OkeyTable();
  table.on('log', (msg) => console.log('[LOG]', msg));
  let handResultSeen = null;
  table.on('hand-result', (r) => { handResultSeen = r; });

  for (let i = 0; i < 4; i++) {
    const res = await table.sit(users[i], i);
    if (res.error) throw new Error(`sit hatasi (${users[i].rumuz}): ${res.error}`);
  }
  console.log('4 oyuncu oturdu. Seatler:', table.seats.map((s) => s && s.name));

  // maybeScheduleStart normalde setTimeout ile baslar; testte gecikmeyi atlamak icin dogrudan cagiriyoruz.
  clearTimeout(table.startTimer);
  table.pendingStartCountdown = false;
  table.startHand();

  console.log('El basladi. Gosterge:', table.indicator, 'Okey:', table.okeySpec);
  console.log('Tas sayilari:', table.seats.map((s) => s.tiles.length));
  const counts14 = table.seats.filter((s) => s.tiles.length === 14).length;
  const counts15 = table.seats.filter((s) => s.tiles.length === 15).length;
  if (counts14 !== 3 || counts15 !== 1) {
    throw new Error('Dagitim yanlis: 3 oyuncu 14, 1 oyuncu 15 tas olmali.');
  }

  const balancesBefore = {};
  for (const u of users) balancesBefore[u.id] = (await db.getUserById(u.id)).lt_balance;

  let turns = 0;
  const MAX_TURNS = 400;
  while (table.stage === 'playing' && turns < MAX_TURNS) {
    turns++;
    const idx = table.turnSeat;
    const seat = table.seats[idx];

    if (!table.hasDrawn) {
      const src = table.lastDiscard && table.lastDiscard.availableToSeat === idx && Math.random() < 0.3 ? 'discard' : 'deck';
      const res = table.handleDraw(seat.userId, src);
      if (res.error) {
        // iskarta uygun degilse desteden dene
        const res2 = table.handleDraw(seat.userId, 'deck');
        if (res2.error) throw new Error(`draw hatasi: ${res2.error}`);
      }
      if (table.stage !== 'playing') break;
    }

    // bitirmeyi dene, olmazsa rastgele bir tas at
    const finishRes = table.handleFinish(seat.userId);
    if (!finishRes.error) {
      console.log(`${seat.name} eli bitirdi! (tur ${turns})`);
      break;
    }
    const tileToDiscard = table.seats[idx].tiles[Math.floor(Math.random() * table.seats[idx].tiles.length)];
    const discardRes = table.handleDiscard(seat.userId, tileToDiscard.id);
    if (discardRes.error) throw new Error(`discard hatasi: ${discardRes.error}`);
  }

  console.log(`Simulasyon bitti. Toplam tur: ${turns}, sahne: ${table.stage}`);
  console.log('El ozeti:', table.lastHandSummary);

  // hand-result event'i async settleHand icinde ateslendigi icin biraz bekle
  await new Promise((r) => setTimeout(r, 500));

  if (handResultSeen) {
    console.log('hand-result participants:', handResultSeen.participants);
    for (const p of handResultSeen.participants) {
      const fresh = await db.getUserById(p.userId);
      const expected = balancesBefore[p.userId] + p.ltChange;
      const ok = fresh.lt_balance === expected;
      console.log(`  ${p.name}: once=${balancesBefore[p.userId]} degisim=${p.ltChange} simdi=${fresh.lt_balance} beklenen=${expected} ${ok ? 'OK' : 'HATA!'}`);
      if (!ok) throw new Error(`LT bakiyesi tutmuyor: ${p.name}`);
    }
  } else if (table.stage === 'finished' && table.lastHandSummary && !table.lastHandSummary.winnerName) {
    console.log('El berabere (deste tukendi), LT degisimi olmamali - dogru davranis.');
  } else if (turns >= MAX_TURNS) {
    throw new Error('El makul tur sayisinda bitmedi, sonsuz donguye girmis olabilir.');
  }

  clearTimeout(table.startTimer);
  clearTimeout(table.turnTimer);
  await db.pool.end();
  console.log('TEST TAMAMLANDI: basarili.');
}

main().catch((err) => {
  console.error('TEST BASARISIZ:', err);
  process.exit(1);
});
