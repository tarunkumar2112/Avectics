const axios = require('axios');

let cachedToken = null;
let tokenExpiry = null;

exports.handler = async function (event) {
  const { service_id, provider_id, date } = event.queryStringParameters;

  if (!service_id || !provider_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing service_id or provider_id" })
    };
  }

  const SIMPLYBOOK_COMPANY = process.env.SIMPLYBOOK_COMPANY;
  const SIMPLYBOOK_LOGIN = process.env.SIMPLYBOOK_LOGIN;
  const SIMPLYBOOK_PASSWORD = process.env.SIMPLYBOOK_PASSWORD;

  try {
    // Step 1: Reuse token if valid
    if (!cachedToken || !tokenExpiry || Date.now() >= tokenExpiry) {
      const authResponse = await axios.post("https://user-api-v2.simplybook.me/admin/auth", {
        company: SIMPLYBOOK_COMPANY,
        login: SIMPLYBOOK_LOGIN,
        password: SIMPLYBOOK_PASSWORD
      }, {
        headers: {
          "Content-Type": "application/json"
        }
      });

      cachedToken = authResponse.data.token;
      tokenExpiry = new Date(authResponse.data.expires).getTime() - 5 * 60 * 1000; // 5 mins buffer
    }

    // Step 2: Fetch next available slot
    const today = new Date().toISOString().split('T')[0];

    const slotResponse = await axios.get("https://user-api-v2.simplybook.me/admin/schedule/first-available-slot", {
      params: {
        service_id,
        provider_id,
        date: date || today
      },
      headers: {
        "Content-Type": "application/json",
        "X-Company-Login": SIMPLYBOOK_COMPANY,
        "X-Token": cachedToken
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        service_id,
        provider_id,
        next_available: slotResponse.data?.start_date_time || null
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
