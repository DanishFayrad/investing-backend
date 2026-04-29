const mongoose = require('mongoose');
const User = require('./models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const adminEmail = 'admin@primeinvest.com';
    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      console.log('Admin already exists');
      process.exit();
    }

    const admin = new User({
      firstName: 'System',
      lastName: 'Admin',
      email: adminEmail,
      password: 'admin123',
      role: 'admin'
    });

    await admin.save();
    console.log('Admin user created successfully!');
    console.log('Email: admin@primeinvest.com');
    console.log('Password: admin123');
    process.exit();
  } catch (error) {
    console.error('Error seeding admin:', error);
    process.exit(1);
  }
};

seedAdmin();
