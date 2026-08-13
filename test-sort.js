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

function getSeriesGroups(tiles) {
  // 1. Pers
  const counts = {};
  tiles.forEach(t => {
      if(!counts[t.number]) counts[t.number] = [];
      counts[t.number].push(t);
  });
  
  const groups = [];
  const leftovers = [];
  
  for(let num in counts) {
      // Find unique colors for this number
      const colors = new Set();
      const per = [];
      const others = [];
      counts[num].forEach(t => {
          if(!colors.has(t.color)) {
              colors.add(t.color);
              per.push(t);
          } else {
              others.push(t);
          }
      });
      if(per.length >= 3) {
          groups.push(per);
          leftovers.push(...others);
      } else {
          leftovers.push(...counts[num]);
      }
  }
  
  // 2. Runs from leftovers
  leftovers.sort((a,b) => a.color.localeCompare(b.color) || a.number - b.number);
  // ... run logic
  console.log(groups);
  console.log(leftovers);
}
getSeriesGroups(tiles);
