const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Har subscription ka har din ka status: arrived / completed / skipped + resident ka note
const Delivery = sequelize.define('Delivery', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  subscriptionId: { type: DataTypes.INTEGER, allowNull: false },
  deliveryDate: { type: DataTypes.DATEONLY, allowNull: false },
  arrivedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  skippedAt: { type: DataTypes.DATE, allowNull: true },
  residentNote: { type: DataTypes.STRING(500), allowNull: true },
  notedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'deliveries',
  underscored: true,
  timestamps: false,
  indexes: [{ unique: true, name: 'uq_sub_date', fields: ['subscription_id', 'delivery_date'] }],
});

Delivery.associate = (db) => {
  Delivery.belongsTo(db.Subscription, { as: 'subscription', foreignKey: 'subscriptionId' });
};

module.exports = Delivery;
