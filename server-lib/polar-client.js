const {createPolar} = require('@polar-sh/sdk/2026-10');

let client;

function polarClient() {
  if (!process.env.POLAR_ACCESS_TOKEN) throw new Error('Polar is not configured');
  if (!client) client = createPolar({
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    environment: process.env.POLAR_SERVER || 'production'
  });
  return client;
}

module.exports = {polarClient};
