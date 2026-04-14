const cron = require('node-cron');
const gatepassService = require('../services/gatepass.service');

function initGatepassJobs(io) {
  console.log('⏰ Initializing gate pass scheduled jobs...');

  // 1. Overdue Check
  // Runs every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      await gatepassService.processOverdue();
      if (io) io.emit('gatepass_updated');
    } catch (err) {
      console.error('[CRON] Failed to process overdue passes:', err);
    }
  });

  // 2. Unresolved Escalation
  // Runs daily at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[CRON] Running daily unresolved pass check at 8:00 AM');
    try {
      await gatepassService.processUnresolved();
      if (io) io.emit('gatepass_updated');
    } catch (err) {
      console.error('[CRON] Failed to process unresolved passes:', err);
    }
  });
}

module.exports = { initGatepassJobs };
