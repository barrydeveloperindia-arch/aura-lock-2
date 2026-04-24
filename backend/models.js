const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, enum: ['admin', 'user', 'security'], default: 'user' },
    accessLevel: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    faceEncoding: { type: [Number], default: [] },
    fingerprintId: { type: Number },
    rfidUid: { type: String },
    pin: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Index for employeeId
userSchema.index({ employeeId: 1 });

const accessLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
    name: { type: String, required: true }, // fallback name for unknown users
    method: { type: String, enum: ['Face', 'Fingerprint', 'PIN', 'RFID'], required: true },
    status: { type: String, enum: ['Granted', 'Denied'], required: true },
    deviceId: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    lastActivity: { type: Date, default: Date.now }
});

// Indexes for optimized searching and filtering
accessLogSchema.index({ name: 'text' });
accessLogSchema.index({ timestamp: -1 });
accessLogSchema.index({ method: 1, status: 1 });

const User = mongoose.model('User', userSchema);
const AccessLog = mongoose.model('AccessLog', accessLogSchema);
const Device = mongoose.model('Device', deviceSchema);

module.exports = { User, AccessLog, Device };
