const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Accept hui request ka schedule (har group ki aik row). Resident aur provider dono ko dikhti hai.
const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  requestId: { type: DataTypes.INTEGER, allowNull: false },
  residentId: { type: DataTypes.INTEGER, allowNull: false },
  providerId: { type: DataTypes.INTEGER, allowNull: false },
  service: { type: DataTypes.ENUM('milkman', 'garbage', 'newspaper'), allowNull: false },
  days: { type: DataTypes.STRING(50), allowNull: false },          // "Mon,Tue"
  fromTime: { type: DataTypes.STRING(5), allowNull: false },       // "08:00"
  toTime: { type: DataTypes.STRING(5), allowNull: false },         // "09:00"
  details: { type: DataTypes.STRING(250), allowNull: true },
  startDate: { type: DataTypes.DATEONLY, allowNull: false },
  monthlyRate: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'Active' },
  slotIndex: { type: DataTypes.TINYINT, allowNull: true },         // ghante ke andar 10-minute ki jagah (0..5)
}, {
  tableName: 'subscriptions',
  underscored: true,
  timestamps: true,
});

Subscription.associate = (db) => {
  Subscription.belongsTo(db.ServiceRequest, { as: 'request', foreignKey: 'requestId' });
  Subscription.belongsTo(db.User, { as: 'resident', foreignKey: 'residentId' });
  Subscription.belongsTo(db.User, { as: 'provider', foreignKey: 'providerId' });
  Subscription.hasMany(db.Delivery, { as: 'deliveries', foreignKey: 'subscriptionId', onDelete: 'CASCADE' });
};

module.exports = Subscription;
