function getSeriesGroups(tiles) {
  const groups = [];
  let pool = [...tiles];
  
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
  
  pool = newPool;
  
  pool.sort((a,b) => (a.color === b.color ? a.number - b.number : a.color.localeCompare(b.color)));
  
  let currentRun = [];
  const leftovers = [];
  
  for (let i = 0; i < pool.length; i++) {
      const curr = pool[i];
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
  
  leftovers.sort((a,b) => (a.color === b.color ? a.number - b.number : a.color.localeCompare(b.color)));
  
  let currentColorGroup = [];
  for (const t of leftovers) {
      if (currentColorGroup.length === 0) {
          currentColorGroup.push(t);
      } else {
          if (currentColorGroup[0].color === t.color) {
              currentColorGroup.push(t);
          } else {
              groups.push(currentColorGroup);
              currentColorGroup = [t];
          }
      }
  }
  if (currentColorGroup.length > 0) {
      groups.push(currentColorGroup);
  }
  
  return groups;
}

const { createTileSet, shuffle } = require('./lib/okeyLogic.js');
let set = createTileSet();
for(let i=0; i<100; i++) {
   set = shuffle(set);
   let hand = set.slice(0, 21);
   try {
       getSeriesGroups(hand);
   } catch(e) {
       console.log("CRASH!", e);
       process.exit(1);
   }
}
console.log("No crash over 100 runs.");
