const fs = require('fs');
let code = fs.readFileSync('public/js/okey101.js', 'utf8');

// 1. Initial array size
code = code.replace(/rackSlots = new Array\(34\).fill\(null\);/g, 'rackSlots = new Array(40).fill(null);');

// 2. renderRack loop
code = code.replace(/for \(let i = 0; i < 34; i\+\+\) \{/g, 'for (let i = 0; i < 40; i++) {');

// 3. Row split
code = code.replace(/if \(i < 17\) \{\s*rackRow1\.appendChild\(slotEl\);\s*\} else \{\s*rackRow2\.appendChild\(slotEl\);\s*\}/g, 'if (i < 20) {\n            rackRow1.appendChild(slotEl);\n        } else {\n            rackRow2.appendChild(slotEl);\n        }');

// 4. Shift limits in ondragover and ondrop.
// Instead of simple replace, let's use a function to rewrite the shift logic.
const shiftLogicOld = `
                    let leftEmpty = -1;
                    for (let step = 1; step <= 34; step++) {
                        if (targetIdx - step >= 0 && vSlots[targetIdx - step] === null) { leftEmpty = targetIdx - step; break; }
                    }
                    let rightEmpty = -1;
                    for (let step = 1; step <= 34; step++) {
                        if (targetIdx + step < 34 && vSlots[targetIdx + step] === null) { rightEmpty = targetIdx + step; break; }
                    }
`;
const shiftLogicNew = `
                    const isRow1 = targetIdx < 20;
                    const rowStart = isRow1 ? 0 : 20;
                    const rowEnd = isRow1 ? 19 : 39;

                    let leftEmpty = -1;
                    for (let step = 1; step <= 20; step++) {
                        if (targetIdx - step >= rowStart && vSlots[targetIdx - step] === null) { leftEmpty = targetIdx - step; break; }
                    }
                    let rightEmpty = -1;
                    for (let step = 1; step <= 20; step++) {
                        if (targetIdx + step <= rowEnd && vSlots[targetIdx + step] === null) { rightEmpty = targetIdx + step; break; }
                    }
`;
code = code.replace(shiftLogicOld, shiftLogicNew);

const dropShiftLogicOld = `
                        let leftEmpty = -1;
                        for (let step = 1; step <= 34; step++) {
                            if (targetIdx - step >= 0 && rackSlots[targetIdx - step] === null) { leftEmpty = targetIdx - step; break; }
                        }
                        let rightEmpty = -1;
                        for (let step = 1; step <= 34; step++) {
                            if (targetIdx + step < 34 && rackSlots[targetIdx + step] === null) { rightEmpty = targetIdx + step; break; }
                        }
`;
const dropShiftLogicNew = `
                        const isRow1 = targetIdx < 20;
                        const rowStart = isRow1 ? 0 : 20;
                        const rowEnd = isRow1 ? 19 : 39;

                        let leftEmpty = -1;
                        for (let step = 1; step <= 20; step++) {
                            if (targetIdx - step >= rowStart && rackSlots[targetIdx - step] === null) { leftEmpty = targetIdx - step; break; }
                        }
                        let rightEmpty = -1;
                        for (let step = 1; step <= 20; step++) {
                            if (targetIdx + step <= rowEnd && rackSlots[targetIdx + step] === null) { rightEmpty = targetIdx + step; break; }
                        }
`;
code = code.replace(dropShiftLogicOld, dropShiftLogicNew);

// 5. Layout groups max gaps
code = code.replace(/const maxGaps = 34 - tilesCount;/g, 'const maxGaps = 40 - tilesCount;');

// 6. Layout groups row wrap
const layoutGroupOld = `
          if (currentIdx < 17) {
              const tilesRemaining = groups.slice(i).reduce((acc, g) => acc + g.length, 0);
              const groupsRemaining = groups.length - i;
              const slotsNeeded = tilesRemaining + groupsRemaining - 1;
              
              // Wrap to bottom row if group overflows top, or if we are midway and bottom has room
              if (currentIdx + group.length > 17 || (currentIdx >= 7 && slotsNeeded <= 17)) {
                  currentIdx = 17;
              }
          }
          
          for (const tile of group) {
              if (currentIdx < 34) {
`;
const layoutGroupNew = `
          if (currentIdx < 20) {
              const tilesRemaining = groups.slice(i).reduce((acc, g) => acc + g.length, 0);
              const groupsRemaining = groups.length - i;
              const slotsNeeded = tilesRemaining + groupsRemaining - 1;
              
              // Wrap to bottom row if group overflows top, or if we are midway and bottom has room
              if (currentIdx + group.length > 20 || (currentIdx >= 10 && slotsNeeded <= 20)) {
                  currentIdx = 20;
              }
          }
          
          for (const tile of group) {
              if (currentIdx < 40) {
`;
code = code.replace(layoutGroupOld, layoutGroupNew);

fs.writeFileSync('public/js/okey101.js', code);
