const fs = require('fs');
const path = './public/js/okey101.js';
let content = fs.readFileSync(path, 'utf8');

const replacement = `
  function isWild(tile, okeySpec) {
      return !tile.joker && okeySpec && tile.color === okeySpec.color && tile.number === okeySpec.number;
  }

  function getEffectiveTile(tile, okeySpec) {
      if (tile.joker && okeySpec) {
          return { ...tile, color: okeySpec.color, number: okeySpec.number, joker: true };
      }
      return tile;
  }

  function isValidGroupOnClient(tileIds, type) {
      const tiles = tileIds.map(id => rackSlots.find(t => t && t.id === id)).filter(Boolean);
      if (tiles.length !== tileIds.length) return false;
      const okeySpec = gameState && gameState.okeySpec ? gameState.okeySpec : null;
      
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
          if (isSeri) return true;
          
          // There's also the 12-13-1 case in Seri, but isSeri only checks color, which is generous enough to pass it.
          // If it fails both (e.g. Red 3, Blue 4, Yellow 5), it's garbage.
          return false;
      }
  }

  // Helper: Group selected tiles based on adjacency in the rackSlots array
  function getGroupsFromRack(type) {
      if (selectedTiles.size > 0) {
          const groups = [];
          let currentGroup = [];
          for (let i = 0; i < rackSlots.length; i++) {
              const tile = rackSlots[i];
              if (tile && selectedTiles.has(tile.id)) {
                  currentGroup.push(tile.id);
              } else {
                  if (currentGroup.length > 0) {
                      groups.push(currentGroup);
                      currentGroup = [];
                  }
              }
          }
          if (currentGroup.length > 0) groups.push(currentGroup);
          return groups;
      } else {
          // Auto-detect based on empty slots, pre-filtered by basic validity
          const groups = [];
          let currentGroup = [];
          
          const addGroupIfValid = () => {
              if (type === 'cift' && currentGroup.length === 2) {
                  if (isValidGroupOnClient(currentGroup, 'cift')) groups.push(currentGroup);
              } else if (type === 'seri' && currentGroup.length >= 3) {
                  if (isValidGroupOnClient(currentGroup, 'seri')) groups.push(currentGroup);
              }
          };

          for (let i = 0; i < rackSlots.length; i++) {
              const tile = rackSlots[i];
              // YENI MIMARI: İki satırımız var. 0-19 arası üst satır, 20-39 arası alt satır.
              // Eğer satır sonuna geldiysek, bitişikmiş gibi algılamaması için currentGroup'u sıfırlamalıyız!
              if (i === 20 && currentGroup.length > 0) {
                  addGroupIfValid();
                  currentGroup = [];
              }

              if (tile) {
                  currentGroup.push(tile.id);
              } else {
                  addGroupIfValid();
                  currentGroup = [];
              }
          }
          addGroupIfValid();
          return groups;
      }
  }
`;

content = content.replace(/\/\/ Helper: Group selected tiles[\s\S]*?return groups;\n      \}\n  \}/, replacement.trim());
fs.writeFileSync(path, content);
