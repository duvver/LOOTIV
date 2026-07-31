const Item = require('./Item');
const Belt = require('./Belt');
const Weapon = require('./Weapon');
const Armor = require('./Armor');

class ItemFactory {
  static create(catalogData, instanceData = {}) {
    const category = (catalogData.category || '').toLowerCase();

    switch (category) {
      case 'belt':
      case 'kemer':
        return new Belt(catalogData, instanceData);
      case 'weapon':
      case 'silah':
        return new Weapon(catalogData, instanceData);
      case 'armor':
      case 'zirh':
        return new Armor(catalogData, instanceData);
      default:
        // Fallback for koleksiyon, diger, vb.
        return new Item(catalogData, instanceData);
    }
  }
}

module.exports = ItemFactory;
