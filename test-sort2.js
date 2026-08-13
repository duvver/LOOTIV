function getSeriesGroups(tiles) {
  const groups = [];
  let pool = [...tiles];
  
  // 1. Find Pers (Sets: 3 or 4 of same number, different colors)
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
  
  // 2. Find Runs (Series: 3+ consecutive numbers of same color)
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
  
  // 3. Group leftovers intelligently (by color)
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

const tiles = [
  {id:1, color:'red', number:3},
  {id:2, color:'red', number:4},
  {id:3, color:'red', number:5},
  {id:4, color:'blue', number:3},
  {id:5, color:'black', number:3},
  {id:6, color:'yellow', number:3},
  {id:7, color:'red', number:13},
  {id:8, color:'blue', number:1},
  {id:9, color:'black', number:2},
];
try {
  console.log("Testing getSeriesGroups...");
  const g = getSeriesGroups(tiles);
  console.log(JSON.stringify(g, null, 2));
} catch(e) {
  console.error("ERROR", e);
}
