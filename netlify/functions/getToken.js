const axios = require('axios');

let cachedToken = null;
let tokenExpiry = null;

exports.handler = async function () {
  // Reuse token if still valid
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return {
      statusCode: 200,
      body: JSON.stringify({ token: cachedToken })
    };
  }

  const url = "https://user-api-v2.simplybook.me/admin/auth";

  try {
    const response = await axios.post(url, {
      company: process.env.SIMPLYBOOK_COMPANY,
      login: process.env.SIMPLYBOOK_LOGIN,
      password: process.env.SIMPLYBOOK_PASSWORD
    }, {
      headers: { "Content-Type": "application/json" }
    });

    cachedToken = response.data.token;
    // Set expiry 5 mins before actual expiry as a buffer
    tokenExpiry = new Date(response.data.expires).getTime() - 5 * 60 * 1000;

    return {
      statusCode: 200,
      body: JSON.stringify({ token: cachedToken })
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
