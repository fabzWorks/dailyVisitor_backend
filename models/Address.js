const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Har user ka address + map location
const Address = sequelize.define('Address', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
  country: { type: DataTypes.STRING(80), allowNull: true },
  province: { type: DataTypes.STRING(80), allowNull: true },
  city: { type: DataTypes.STRING(80), allowNull: true },
  area: { type: DataTypes.STRING(120), allowNull: true },
  address: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'address',
  underscored: true,
  timestamps: false,
});

Address.associate = (db) => {
  Address.belongsTo(db.User, { as: 'user', foreignKey: 'userId' });
};

module.exports = Address;
