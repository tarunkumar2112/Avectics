const axios = require('axios');

async function getAuthToken() {
  const tokenResp = await axios.get(`${process.env.URL}/.netlify/functions/getToken`);
  return tokenResp.data.token;
}

exports.handler = async function () {
  const API_BASE = 'https://user-api-v2.simplybook.me/admin/bookings/available-slots';
  const services = [/* ...service array as before... */];

  const from = new Date().toISOString().split('T')[0];
  const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().split('T')[0];

  try {
    const token = await getAuthToken();

    const headers = {
      'Content-Type': 'application/json',
      'X-Company-Login': process.env.SIMPLYBOOK_COMPANY,
      'X-Token': token,
    };

    const results = await Promise.all(
      services.map(async (svc) => {
        const url = `${API_BASE}?provider_id=${svc.provider}&service_id=${svc.id}&from=${from}&to=${to}`;
        const response = await axios.get(url, { headers });

        const dates = Object.keys(response.data.available || {}).filter((date) => {
          if (svc.name.includes('2a') || svc.name.includes('2b')) {
            return new Date(date).getDay() === 2; // Tuesday
          }
          return true;
        });

        return {
          service: svc.name,
          next_available: dates.length > 0 ? dates[0] : 'No slots available',
        };
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify(results),
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
