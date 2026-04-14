const db = require('../config/db');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const gatepassService = require('../services/gatepass.service');

async function runTest() {
  console.log('Testing Module 3: Gate Pass System\n');
  
  const studentEmail = 'student@hostel.com';
  const wardenEmail = 'warden@hostel.com';
  
  const student = db.prepare('SELECT id FROM users WHERE email = ?').get(studentEmail);
  const warden = db.prepare('SELECT id FROM users WHERE email = ?').get(wardenEmail);

  // Clean old passes for this student
  db.prepare('DELETE FROM gate_passes WHERE student_id = ?').run(student.id);
  console.log('[Student] Requesting a gate pass...');
  
  try {
    // Expected out +1 hour, Return +3 hours from mock
    const expectedOut = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const expectedReturn = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    
    // Check if we are physically in the blocked time window (9pm to 6am).
    // If so, testing this naturally will throw. Let's assume we can mock or catch.
    const res = gatepassService.requestPass(student.id, 'Visiting family', expectedOut, expectedReturn);
    console.log(`[Student] Pass ID ${res.id} requested successfully. Status: ${res.status}`);
    
    console.log('\n[Warden] Approving the pass...');
    const approval = gatepassService.updatePassStatus(res.id, warden.id, 'approved', 'Be careful!');
    console.log(`[Warden] Approved. Generated secure QR Token: ${approval.qrToken}`);
    
    console.log('\n[Security] Scanning Exit...');
    const scanExit = gatepassService.scanPass(approval.qrToken, 'exit');
    console.log(`[Security] ${scanExit.message} for ${scanExit.student}`);
    
    console.log('\n[Security] Scanning Return...');
    const scanReturn = gatepassService.scanPass(approval.qrToken, 'return');
    console.log(`[Security] ${scanReturn.message} for ${scanReturn.student}. Final Status: ${scanReturn.status}`);
    
    console.log('\n[System] Checking Overdue logic mockup...');
    // Artificially change a pass to be active but in the past
    const overdueTarget = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.prepare(`UPDATE gate_passes SET status = 'active', expected_return = ? WHERE id = ?`).run(overdueTarget, res.id);
    
    gatepassService.processOverdue(); // should flag it
    
    const finalCheck = db.prepare('SELECT status FROM gate_passes WHERE id = ?').get(res.id);
    console.log(`[System] Overdue cron flag check -> Status is now: ${finalCheck.status}`);

    console.log('\nTesting Complete!');
  } catch (err) {
    if (err.message.includes('9:00 PM and 6:00 AM')) {
      console.log('Test aborted gracefully because it is currently night time and requests are blocked.');
    } else {
      console.error(`Test failed: ${err.message}`);
    }
  }
}

runTest();
