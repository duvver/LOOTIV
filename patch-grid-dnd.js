const fs = require('fs');
let code = fs.readFileSync('public/js/okey101.js', 'utf8');

const oldGridDND = `
  // Process (İşleme) Drop Zone
  if (centerGridMain) {
      centerGridMain.ondragover = (e) => {
          e.preventDefault(); // allow drop
      };
      centerGridMain.ondrop = (e) => {
          e.preventDefault();
`;

const newGridDND = `
  // Process (İşleme) Drop Zone
  if (centerGridMain) {
      centerGridMain.ondragover = (e) => {
          e.preventDefault(); // allow drop
          const targetCell = e.target.closest('.cell');
          document.querySelectorAll('.center-area .cell.drag-target').forEach(el => el.classList.remove('drag-target'));
          if (targetCell && dragTileId) {
              targetCell.classList.add('drag-target');
          }
      };
      centerGridMain.ondragleave = (e) => {
          const targetCell = e.target.closest('.cell');
          if (targetCell) {
              targetCell.classList.remove('drag-target');
          }
      };
      centerGridMain.ondrop = (e) => {
          document.querySelectorAll('.center-area .cell.drag-target').forEach(el => el.classList.remove('drag-target'));
          e.preventDefault();
`;

code = code.replace(oldGridDND.trim(), newGridDND.trim());
fs.writeFileSync('public/js/okey101.js', code);
