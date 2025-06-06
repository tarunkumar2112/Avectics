// File: functions/getAvailableSlots.js
const axios = require('axios');

const targetServices = [
  'UAPL Theory 1 day course',
  'Course 2a: 4 Days Beginner Practical Lesson (Rotorcraft ≤ 7kg)',
  'Course 2b: 4 Days Beginner Practical Lesson (Rotorcraft ≤ 25kg)',
  'UAPL Assessment Class A 25kg / Proficiency Check',
  'UAPL Assessment Class A 7kg / Proficiency Check'
];

async function getAuthToken() {
  const tokenResp = await axios.get(`${process.env.FURL}/.netlify/functions/getToken`);
  return tokenResp.data.token;
}

exports.handler = async function () {
  const from = new Date().toISOString().split('T')[0];
  const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const token = await getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      'X-Company-Login': process.env.SIMPLYBOOK_COMPANY,
      'X-Token': token
    };

    // Fetch all services
    const serviceRes = await axios.get('https://user-api-v2.simplybook.me/admin/services?per_page=100', { headers });
    const allServices = serviceRes.data.data;

    const matched = allServices.filter(svc =>
      targetServices.some(name => svc.name.trim().startsWith(name.trim()))
    );

    const results = await Promise.all(
      matched.map(async (svc) => {
        const providerId = svc.providers[0];
        const serviceId = svc.id;
        const name = svc.name;

        const url = `https://user-api-v2.simplybook.me/admin/bookings/available-slots?provider_id=${providerId}&service_id=${serviceId}&from=${from}&to=${to}`;
        const res = await axios.get(url, { headers });

        let availableDates = Object.keys(res.data.available || {});

        if (name.includes('Course 2a') || name.includes('Course 2b')) {
          // Only include Tuesday slots
          availableDates = availableDates.filter(date => new Date(date).getDay() === 2);
        }

        return {
          service: name,
          next_available: availableDates.length > 0 ? availableDates[0] : 'No slots available'
        };
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify(results)
    };
  } catch (err) {
    console.error('Error:', err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
