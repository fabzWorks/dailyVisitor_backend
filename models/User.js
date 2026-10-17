const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Resident aur provider dono isi table main (role column se pata chalta hai)
const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  role: { type: DataTypes.ENUM('resident', 'provider'), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(150), allowNull: false, unique: true },
  password: { type: DataTypes.STRING(255), allowNull: false },
  gender: { type: DataTypes.STRING(20), allowNull: true },
  contact: { type: DataTypes.STRING(20), allowNull: true },
}, {
  tableName: 'users',
  underscored: true,
  timestamps: true,
});

User.associate = (db) => {
  User.hasOne(db.Address, { as: 'address', foreignKey: 'userId', onDelete: 'CASCADE' });
  User.hasOne(db.ProviderService, { as: 'providerService', foreignKey: 'userId', onDelete: 'CASCADE' });
};

module.exports = User;
