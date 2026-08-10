const logic = require('./okey101Logic');

function getSeriesGroups(tiles, okeySpec) {
  // We exclude wildcards for simple grouping, then we can append them if needed.
  // For this basic AI, we just find natural series and pers.
  const groups = [];
  const wilds = tiles.filter(t => logic.isWild(t, okeySpec));
  const pool = tiles.filter(t => !logic.isWild(t, okeySpec));
  
  // 1. Find Pers
  const numberMap = {};
  pool.forEach(t => {
      if (!numberMap[t.number]) numberMap[t.number] = [];
      numberMap[t.number].push(t);
  });
  
  const newPool = [];
  for (const num in numberMap) {
      const tList = numberMap[num];
      const colors = new Set();
      const per = [];
      const remainder = [];
      
      tList.forEach(t => {
          if (!colors.has(t.color)) {
              colors.add(t.color);
              per.push(t);
          } else {
              remainder.push(t);
          }
      });
      
      if (per.length >= 3) {
          groups.push(per);
          newPool.push(...remainder);
      } else {
          newPool.push(...tList);
      }
  }
  
  let pool2 = newPool;
  pool2.sort((a,b) => {
      const cA = a.color || '';
      const cB = b.color || '';
      const nA = a.number || 0;
      const nB = b.number || 0;
      return cA === cB ? nA - nB : cA.localeCompare(cB);
  });
  
  let currentRun = [];
  const leftovers = [];
  
  for (let i = 0; i < pool2.length; i++) {
      const curr = pool2[i];
      if (currentRun.length === 0) {
          currentRun.push(curr);
      } else {
          const prev = currentRun[currentRun.length - 1];
          if (curr.color === prev.color && curr.number === prev.number + 1) {
              currentRun.push(curr);
          } else if (curr.color === prev.color && curr.number === prev.number) {
              leftovers.push(curr);
          } else {
              if (currentRun.length >= 3) {
                  groups.push(currentRun);
              } else {
                  leftovers.push(...currentRun);
              }
              currentRun = [curr];
          }
      }
  }
  if (currentRun.length >= 3) {
      groups.push(currentRun);
  } else {
      leftovers.push(...currentRun);
  }
  
  return { groups, leftovers, wilds };
}

function getPairGroups(tiles, okeySpec) {
  const counts = {};
  const pool = tiles.filter(t => !logic.isWild(t, okeySpec));
  const wilds = tiles.filter(t => logic.isWild(t, okeySpec));
  
  pool.forEach(t => {
      const key = t.color + '-' + t.number;
      if (!counts[key]) counts[key] = [];
      counts[key].push(t);
  });
  
  const groups = [];
  const leftovers = [];
  
  for (const key in counts) {
      const tList = counts[key];
      while (tList.length >= 2) {
          groups.push([tList.shift(), tList.shift()]);
      }
      if (tList.length === 1) leftovers.push(tList[0]);
  }
  
  return { groups, leftovers, wilds };
}

function processTurn(table, seatIndex) {
  const seat = table.seats[seatIndex];
  if (!seat) return;
  
  // 1. Draw if needed
  if (!table.hasDrawn) {
      // Very basic AI: just draw from deck
      if (table.deck.length === 0) {
          table.settleByPenalty('Deste tukendi.');
          return;
      }
      table.handleDraw(seat.userId, 'deck');
      setTimeout(() => table.scheduleBotTurn(), 500); // Wait a bit after drawing
      return;
  }
  
  // 2. Try to Open or Process
  let madeMove = false;
  if (!seat.hasOpened) {
      const seriData = getSeriesGroups(seat.tiles, table.okeySpec);
      let totalValue = 0;
      const validSeriGroups = [];
      for (const g of seriData.groups) {
          const v = logic.validateSeriOrPer(g, table.okeySpec);
          if (v) {
              totalValue += v.value;
              validSeriGroups.push(g.map(t => t.id));
          }
      }
      
      if (totalValue >= table.currentMinScore) {
          const res = table.handleOpen(seat.userId, 'seri', validSeriGroups);
          if (!res.error) madeMove = true;
      } else {
          // Try pairs
          const pairData = getPairGroups(seat.tiles, table.okeySpec);
          const validPairs = [];
          for (const g of pairData.groups) {
              const v = logic.validateCift(g, table.okeySpec);
              if (v) validPairs.push(g.map(t => t.id));
          }
          if (validPairs.length >= table.currentMinCift) {
              const res = table.handleOpen(seat.userId, 'cift', validPairs);
              if (!res.error) madeMove = true;
          }
      }
  } else {
      // Try processing tiles
      for (const meld of table.boardMelds) {
          for (let i = seat.tiles.length - 1; i >= 0; i--) {
              const t = seat.tiles[i];
              const res = table.handleProcess({ userId: seat.userId, tileId: t.id, meldId: meld.id });
              if (!res.error) {
                  madeMove = true;
                  break; // Stop and re-evaluate next turn
              }
          }
      }
  }
  
  if (madeMove) {
      // Need to run bot logic again because it might be able to open more or discard
      setTimeout(() => table.scheduleBotTurn(), 1000);
      return;
  }
  
  // 3. Discard
  const seriData = getSeriesGroups(seat.tiles, table.okeySpec);
  let pool = seriData.leftovers.length > 0 ? seriData.leftovers : seat.tiles;
  const discardable = pool.filter(t => !logic.isWild(t, table.okeySpec));
  const finalPool = discardable.length ? discardable : pool;
  
  const tile = finalPool[Math.floor(Math.random() * finalPool.length)];
  table.handleDiscard(seat.userId, tile.id);
}

module.exports = {
  processTurn
};
