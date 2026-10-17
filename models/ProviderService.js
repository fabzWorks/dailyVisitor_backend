const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Provider ki service ki detail.
// days = "Mon,Tue,Wed" ; timeSlots = [{from:'06:00', to:'09:00'}] (sab selected dino par lagte hain)
const ProviderService = sequelize.define('ProviderService', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  service: { type: DataTypes.ENUM('milkman', 'garbage', 'newspaper'), allowNull: false },
  servicePrice: { type: DataTypes.DECIMAL(10, 2), allowNull: true },   // newspaper: per copy, garbage: per kg
  milkProducts: { type: DataTypes.JSON, allowNull: true },             // [{ name, price }]
  newspaperTypes: { type: DataTypes.JSON, allowNull: true },           // ['dawn','jang']
  weight: { type: DataTypes.DECIMAL(6, 1), allowNull: true },          // garbage: max kg per pickup
  days: { type: DataTypes.STRING(50), allowNull: false },
  timeSlots: { type: DataTypes.JSON, allowNull: false },
}, {
  tableName: 'provider_service',
  underscored: true,
  timestamps: false,
});

ProviderService.associate = (db) => {
  ProviderService.belongsTo(db.User, { as: 'user', foreignKey: 'userId' });
};

module.exports = ProviderService;
