const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Resident ki provider ko bheji hui request (pending / accepted / rejected)
const ServiceRequest = sequelize.define('ServiceRequest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  residentId: { type: DataTypes.INTEGER, allowNull: false },
  providerId: { type: DataTypes.INTEGER, allowNull: false },
  service: { type: DataTypes.ENUM('milkman', 'garbage', 'newspaper'), allowNull: false },
  startDate: { type: DataTypes.DATEONLY, allowNull: false },
  radiusKm: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 2 },
  notes: { type: DataTypes.STRING(500), allowNull: true },
  groupsJson: { type: DataTypes.JSON, allowNull: false },
  estimatedMonthly: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.ENUM('pending', 'accepted', 'rejected'), allowNull: false, defaultValue: 'pending' },
  respondedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'service_requests',
  underscored: true,
  timestamps: true,
});

ServiceRequest.associate = (db) => {
  ServiceRequest.belongsTo(db.User, { as: 'resident', foreignKey: 'residentId' });
  ServiceRequest.belongsTo(db.User, { as: 'provider', foreignKey: 'providerId' });
  ServiceRequest.hasMany(db.Subscription, { as: 'subscriptions', foreignKey: 'requestId', onDelete: 'CASCADE' });
};

module.exports = ServiceRequest;
