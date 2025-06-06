const axios = require("axios");

let cachedToken = null;
let tokenExpiry = null;

function getNextNDatesISO(limit = 30) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < limit; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
}

async function fetchToken(company, login, password) {
  const authRes = await axios.post(
    "https://user-api-v2.simplybook.me/admin/auth",
    { company, login, password },
    { headers: { "Content-Type": "application/json" } }
  );

  cachedToken = authRes.data.token;
  tokenExpiry = new Date(authRes.data.expires).getTime() - 5 * 60 * 1000; // expire 5 mins early
  return cachedToken;
}

async function getSlots(serviceid, provider, company, login, password) {
  const dates = getNextNDatesISO(30);
  const date_from = dates[0];
  const date_to = dates[dates.length - 1];

  async function requestSlots(token) {
    return axios.get("https://user-api-v2.simplybook.me/admin/timeline/slots", {
      params: {
        service_id: serviceid,
        provider_id: provider,
        date_from,
        date_to,
        with_available_slots: 1,
      },
      headers: {
        "Content-Type": "application/json",
        "X-Company-Login": company,
        "X-Token": token,
      },
    });
  }

  // Check token validity
  if (!cachedToken || !tokenExpiry || Date.now() >= tokenExpiry) {
    await fetchToken(company, login, password);
  }

  try {
    const response = await requestSlots(cachedToken);
    return { data: response.data, dates };
  } catch (err) {
    if (err.response && err.response.status === 403) {
      // Token expired, get new one and retry once
      await fetchToken(company, login, password);
      const retryResponse = await requestSlots(cachedToken);
      return { data: retryResponse.data, dates };
    }
    throw err;
  }
}

exports.handler = async function (event) {
  try {
    const { serviceid, provider } = event.queryStringParameters || {};

    if (!serviceid || !provider) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing serviceid or provider" }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    }

    const company = process.env.SIMPLYBOOK_COMPANY;
    const login = process.env.SIMPLYBOOK_LOGIN;
    const password = process.env.SIMPLYBOOK_PASSWORD;

    if (!company || !login || !password) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "SimplyBook credentials missing" }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    }

    const { data, dates } = await getSlots(serviceid, provider, company, login, password);

    return {
      statusCode: 200,
      body: JSON.stringify({ serviceid, provider, slots: data, checked_dates: dates }),
      headers: { "Access-Control-Allow-Origin": "*" },
    };
  } catch (error) {
    console.error("Error in getslotdata:", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
      headers: { "Access-Control-Allow-Origin": "*" },
    };
  }
};
