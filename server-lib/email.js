async function sendMagicLink({to, url, env, fetchImpl = fetch, log = console.log, mac = false}) {
  const from = env.EMAIL_FROM;
  const key = env.EMAIL_API_KEY;
  const text = mac
    ? `Sign in to ClearFrame for Mac. Open this link on the Mac where you requested sign-in.\n\n${url}\n\nThis link expires in 15 minutes. If you did not ask for it, you can ignore this message.`
    : `Sign in to ClearFrame Pro.\n\n${url}\n\nThis link expires in 15 minutes and can be used once. If you did not ask for it, you can ignore this message.`;
  if (!key) {
    log(`[clearframe] magic link for ${to}: ${url}`);
    return {delivered: 'console'};
  }
  if (!from) {
    const error = new Error('EMAIL_FROM is not set');
    error.code = 'config';
    throw error;
  }
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({
      from,
      to,
      subject: mac ? 'Sign in to ClearFrame for Mac' : 'Sign in to ClearFrame Pro',
      text,
      html: mac
        ? `<p>Sign in to ClearFrame for Mac. Open this link on the Mac where you requested sign-in.</p><p><a href="${url}">Open ClearFrame</a></p><p>This link expires in 15 minutes. If you did not ask for it, you can ignore this message.</p>`
        : `<p>Sign in to ClearFrame Pro.</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes and can be used once. If you did not ask for it, you can ignore this message.</p>`
    })
  });
  if (!response.ok) {
    const error = new Error(`Email request failed (${response.status})`);
    error.code = 'email';
    throw error;
  }
  return {delivered: 'api'};
}

module.exports = {sendMagicLink};
