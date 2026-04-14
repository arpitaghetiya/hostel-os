/**
 * Seed script: Creates test users for all 3 roles.
 * Run: npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const authService = require('../services/auth.service');

console.log('🌱 Seeding database with test users...\n');

const testUsers = [
  {
    name: 'Warden Singh',
    email: 'warden@hostel.com',
    password: 'password123',
    role: 'warden',
    room_no: null,
    hostel_id: 'HOSTEL-A',
    phone: '9876543210'
  },
  {
    name: 'Rahul Kumar',
    email: 'student@hostel.com',
    password: 'password123',
    role: 'student',
    room_no: '101',
    hostel_id: 'HOSTEL-A',
    phone: '9876543211'
  },
  {
    name: 'Amit Sharma',
    email: 'student2@hostel.com',
    password: 'password123',
    role: 'student',
    room_no: '102',
    hostel_id: 'HOSTEL-A',
    phone: '9876543212'
  },
  {
    name: 'Priya Patel',
    email: 'student3@hostel.com',
    password: 'password123',
    role: 'student',
    room_no: '203',
    hostel_id: 'HOSTEL-A',
    phone: '9876543213'
  },
  {
    name: 'Security Guard',
    email: 'security@hostel.com',
    password: 'password123',
    role: 'security',
    room_no: null,
    hostel_id: 'HOSTEL-A',
    phone: '9876543214'
  }
];

let created = 0;
let skipped = 0;

for (const user of testUsers) {
  try {
    authService.register(user);
    console.log(`  ✅ Created ${user.role}: ${user.email}`);
    created++;
  } catch (err) {
    if (err.status === 409) {
      console.log(`  ⏭️  Skipped ${user.role}: ${user.email} (already exists)`);
      skipped++;
    } else {
      console.log(`  ❌ Failed ${user.email}: ${err.message}`);
    }
  }
}

console.log(`\n🎉 Seeding complete! Created: ${created}, Skipped: ${skipped}`);
console.log('\n📋 Test credentials:');
console.log('   Warden:   warden@hostel.com / password123');
console.log('   Student:  student@hostel.com / password123');
console.log('   Security: security@hostel.com / password123\n');
process.exit(0);
