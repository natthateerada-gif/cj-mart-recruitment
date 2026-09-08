// Fire-and-forget POST to the Recruitment Management System's webhook URL,
// if one has been configured. Never throws and never delays or fails the
// caller — an applicant's submission must always succeed even if the RMS
// webhook is down, slow, or not yet built.

async function notifyRmsWebhook(event, payload) {
  const url = process.env.RMS_WEBHOOK_URL;
  if (!url) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, data: payload, sentAt: new Date().toISOString() }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch (err) {
    console.warn('RMS webhook delivery failed (non-fatal):', err.message);
  }
}

module.exports = { notifyRmsWebhook };
