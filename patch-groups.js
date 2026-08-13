const fs = require('fs');
let code = fs.readFileSync('public/js/okey101.js', 'utf8');

const isValidGroupFunc = `
  function isValidGroupOnClient(tileIds, type) {
      const tiles = tileIds.map(id => rackSlots.find(t => t && t.id === id)).filter(Boolean);
      if (tiles.length !== tileIds.length) return false;
      const okeySpec = currentOkeySpec;
      
      const effTiles = tiles.map(t => getEffectiveTile(t, okeySpec));
      const normals = effTiles.filter(t => !isWild(t, okeySpec));
      
      if (type === 'cift') {
          if (tiles.length !== 2) return false;
          if (normals.length === 2) {
              return normals[0].color === normals[1].color && normals[0].number === normals[1].number;
          }
          return true; // 1 or 0 normal tiles, assume wildcard covers it
      } else {
          if (tiles.length < 3) return false;
          if (normals.length < 2) return true;
          
          // Check Per
          const isPer = normals.every(t => t.number === normals[0].number);
          if (isPer) {
              const uniqueColors = new Set(normals.map(t => t.color));
              if (uniqueColors.size === normals.length) return true;
          }
          
          // Check Seri
          const isSeri = normals.every(t => t.color === normals[0].color);
          if (isSeri) {
              const sorted = [...normals].sort((a,b) => a.number - b.number);
              let has13 = false, has1 = false;
              for(const t of sorted) {
                  if (t.number===13) has13=true;
                  if (t.number===1) has1=true;
              }
              let span = sorted[sorted.length-1].number - sorted[0].number + 1;
              if (has13 && has1) {
                  const adjusted = sorted.map(t => t.number === 1 ? 14 : t.number).sort((a,b)=>a-b);
                  span = adjusted[adjusted.length-1] - adjusted[0] + 1;
              }
              if (span <= tiles.length && (new Set(normals.map(t=>t.number)).size === normals.length)) {
                  return true;
              }
          }
          return false;
      }
  }

  function getGroupsFromRack(type) {`;

code = code.replace('  function getGroupsFromRack(type) {', isValidGroupFunc);

const origAutoDetect = `
                  if (type === 'cift' && currentGroup.length === 2) {
                      groups.push(currentGroup);
                  } else if (type === 'seri' && currentGroup.length >= 3) {
                      groups.push(currentGroup);
                  }`;
                  
const newAutoDetect = `
                  if (isValidGroupOnClient(currentGroup, type)) {
                      groups.push(currentGroup);
                  }`;
code = code.replace(origAutoDetect, newAutoDetect);

// Also need to patch the end of the rack loop for auto-detect
const origEndDetect = `
          if (type === 'cift' && currentGroup.length === 2) groups.push(currentGroup);
          if (type === 'seri' && currentGroup.length >= 3) groups.push(currentGroup);
          return groups;`;
          
const newEndDetect = `
          if (isValidGroupOnClient(currentGroup, type)) groups.push(currentGroup);
          return groups;`;
code = code.replace(origEndDetect, newEndDetect);

// And the selectedTiles check
const origSelected = `
          if (currentGroup.length > 0) groups.push(currentGroup);
          return groups;`;
          
const newSelected = `
          if (currentGroup.length > 0) {
              if (isValidGroupOnClient(currentGroup, type)) groups.push(currentGroup);
          }
          return groups;`;
code = code.replace(origSelected, newSelected);

fs.writeFileSync('public/js/okey101.js', code);
