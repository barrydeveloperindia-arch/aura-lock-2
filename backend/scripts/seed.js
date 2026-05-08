require('dotenv').config();
const mongoose = require('mongoose');
const { User, AccessLog, Device } = require('./models');

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Clear existing data
        await User.deleteMany({});
        await AccessLog.deleteMany({});
        await Device.deleteMany({});

        // Seed Users
        const users = await User.insertMany([
            { name: 'Shiv Kumar', email: '5089shivkumar@gmail.com', role: 'admin', accessLevel: 5, status: 'active', faceRegistered: true, fingerprintRegistered: true, pin: '1234' },
            { name: 'John Doe', email: 'john@example.com', role: 'user', accessLevel: 3, status: 'active', faceRegistered: true, fingerprintRegistered: false, pin: '5678' },
            { name: 'Jane Smith', email: 'jane@example.com', role: 'user', accessLevel: 2, status: 'inactive', faceRegistered: false, fingerprintRegistered: true, pin: '9012' },
            { name: 'Robert Brown', email: 'robert@example.com', role: 'user', accessLevel: 4, status: 'active', faceRegistered: true, fingerprintRegistered: true }
        ]);

        // Seed Devices
        await Device.insertMany([
            { deviceId: 'esp32_01', name: 'Main Entrance', status: 'online', lastActivity: new Date() },
            { deviceId: 'esp32_02', name: 'Server Room', status: 'offline', lastActivity: new Date(Date.now() - 1000 * 60 * 60 * 24) },
            { deviceId: 'esp32_03', name: 'Back Office', status: 'online', lastActivity: new Date() }
        ]);

        // Seed Access Logs
        const now = new Date();
        await AccessLog.insertMany([
            { userId: users[1]._id, name: users[1].name, method: 'Face', status: 'Granted', deviceId: 'esp32_01', timestamp: new Date(now - 1000 * 60 * 10) },
            { userId: users[2]._id, name: users[2].name, method: 'Fingerprint', status: 'Denied', deviceId: 'esp32_01', timestamp: new Date(now - 1000 * 60 * 60) },
            { userId: users[0]._id, name: users[0].name, method: 'PIN', status: 'Granted', deviceId: 'esp32_02', timestamp: new Date(now - 1000 * 60 * 60 * 2) },
            { name: 'Unknown Stranger', method: 'Face', status: 'Denied', deviceId: 'esp32_01', timestamp: new Date(now - 1000 * 60 * 5) }
        ]);

        console.log('Database seeded successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
};

seedData();
