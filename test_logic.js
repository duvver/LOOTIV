const logic = require('./lib/okey101Logic');
const spec = { color: 'red', number: 5 }; // just some okey

const seri = [
  { id: 1, color: 'black', number: 10, joker: false },
  { id: 2, color: 'black', number: 11, joker: false },
  { id: 3, color: 'black', number: 12, joker: false },
];

const v1 = logic.validateSeriOrPer(seri, spec);
console.log("Seri value:", v1);

const per = [
  { id: 4, color: 'black', number: 10, joker: false },
  { id: 5, color: 'red', number: 10, joker: false },
  { id: 6, color: 'yellow', number: 10, joker: false },
];
const v2 = logic.validateSeriOrPer(per, spec);
console.log("Per value:", v2);

const per2 = [
  { id: 7, color: 'black', number: 13, joker: false },
  { id: 8, color: 'red', number: 13, joker: false },
  { id: 9, color: 'yellow', number: 13, joker: false },
];
const v3 = logic.validateSeriOrPer(per2, spec);
console.log("Per 13 value:", v3);

