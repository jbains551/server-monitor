const axios = require('axios');

const NTFY_TOPIC = process.env.NTFY_TOPIC || 'server-monitor-jbains';
const NTFY_URL   = `https://ntfy.sh/${NTFY_TOPIC}`;

async function sendSMS(message) {
  const isAlert    = /ALERT|OFFLINE/i.test(message);
  const isRecovery = /RECOVERY|ONLINE/i.test(message);

  const priority = isAlert ? 'urgent' : 'default';
  const tags     = isAlert    ? 'rotating_light,red_circle'
                 : isRecovery ? 'white_check_mark'
                 : 'desktop_computer';

  try {
    await axios.post(NTFY_URL, message, {
      headers: {
        'Title':    'Server Monitor',
        'Priority': priority,
        'Tags':     tags,
      },
    });
    console.log(`[Notify] Sent to ntfy.sh/${NTFY_TOPIC}`);
    return { success: true };
  } catch (err) {
    console.error(`[Notify] Request failed: ${err.message}`);
    throw err;
  }
}

module.exports = { sendSMS };
