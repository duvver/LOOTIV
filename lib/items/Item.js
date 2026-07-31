class Item {
  constructor(catalogData, instanceData = {}) {
    this.catalogId = catalogData.id;
    this.inventoryId = instanceData.id || null;
    this.name = catalogData.name;
    this.category = catalogData.category || 'diger';
    this.rarity = catalogData.rarity || 'common';
    this.imageUrl = catalogData.image_url || '';

    // Default base attributes
    this.baseAttributes = catalogData.base_attributes || {};

    // Instance specific
    this.upgradeLevel = instanceData.upgrade_level || 0;
    this.listed = instanceData.listed || false;
  }

  get displayName() {
    if (this.upgradeLevel > 0) {
      return `${this.name} +${this.upgradeLevel}`;
    }
    return this.name;
  }

  // To be overridden by subclasses
  get currentAttributes() {
    return { ...this.baseAttributes };
  }

  // Calculate generic attributes if needed (e.g. general value multiplier)
  get rarityColor() {
    switch (this.rarity) {
      case 'common': return 'text-gray-400';
      case 'rare': return 'text-blue-500';
      case 'epic': return 'text-purple-500';
      case 'legendary': return 'text-yellow-500';
      default: return 'text-gray-400';
    }
  }

  toJSON() {
    return {
      catalogId: this.catalogId,
      inventoryId: this.inventoryId,
      name: this.name,
      displayName: this.displayName,
      category: this.category,
      rarity: this.rarity,
      imageUrl: this.imageUrl,
      upgradeLevel: this.upgradeLevel,
      listed: this.listed,
      attributes: this.currentAttributes,
      rarityColor: this.rarityColor
    };
  }
}

module.exports = Item;
