const axios = require('axios');

exports.handler = async function () {
  const SIMPLYBOOK_COMPANY = process.env.SIMPLYBOOK_COMPANY;
  const SIMPLYBOOK_LOGIN = process.env.SIMPLYBOOK_LOGIN;
  const SIMPLYBOOK_PASSWORD = process.env.SIMPLYBOOK_PASSWORD;

  try {
    // Get token
    const authRes = await axios.post("https://user-api-v2.simplybook.me/admin/auth", {
      company: SIMPLYBOOK_COMPANY,
      login: SIMPLYBOOK_LOGIN,
      password: SIMPLYBOOK_PASSWORD
    }, {
      headers: { "Content-Type": "application/json" }
    });

    const token = authRes.data.token;

    // Get services
    const servicesRes = await axios.get("https://user-api-v2.simplybook.me/admin/services", {
      headers: {
        "Content-Type": "application/json",
        "X-Company-Login": SIMPLYBOOK_COMPANY,
        "X-Token": token
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ services: servicesRes.data })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
