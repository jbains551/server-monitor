const axios = require('axios');

const TO_NUMBER = '2056160901';

async function sendSMS(message) {
  const key = process.env.TEXTBELT_API_KEY;

  if (!key) {
    console.warn('[SMS] TEXTBELT_API_KEY not set — skipping SMS.');
    return null;
  }

  try {
    const response = await axios.post('https://textbelt.com/text', {
      phone:   TO_NUMBER,
      message,
      key,
    });

    const data = response.data;
    if (data.success) {
      console.log(`[SMS] Sent to ${TO_NUMBER} (quotaRemaining: ${data.quotaRemaining})`);
    } else {
      console.error(`[SMS] Failed: ${data.error}`);
    }
    return data;
  } catch (err) {
    console.error(`[SMS] Request failed: ${err.message}`);
    throw err;
  }
}

module.exports = { sendSMS, TO_NUMBER };
