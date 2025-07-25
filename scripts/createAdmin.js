const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'manager', 'staff'], default: 'staff' },
  permissions: [String],
  department: String,
  phoneNumber: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@company.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log('📧 Email: admin@company.com');
      process.exit(0);
    }
    
    // Create Admin User
    const adminPassword = await bcrypt.hash('admin123', 12);
    const adminUser = new User({
      name: 'System Administrator',
      email: 'admin@company.com',
      password: adminPassword,
      role: 'admin',
      department: 'Management',
      phoneNumber: '+1-555-ADMIN',
      permissions: [
        'view_inventory',
        'manage_inventory',
        'view_reports',
        'manage_users',
        'system_settings',
        'export_data',
        'manage_categories',
        'view_analytics'
      ],
      isActive: true
    });
    
    await adminUser.save();
    
    console.log('🎉 Admin user created successfully!');
    console.log('='.repeat(40));
    console.log('📧 Email: admin@company.com');
    console.log('🔑 Password: admin123');
    console.log('👑 Role: Administrator');
    console.log('✅ Status: Active');
    console.log('='.repeat(40));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

// node scripts/createAdmin.js
createAdmin();