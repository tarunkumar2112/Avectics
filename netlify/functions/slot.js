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

// Function to get a fresh token
async function fetchToken(SIMPLYBOOK_COMPANY, SIMPLYBOOK_LOGIN, SIMPLYBOOK_PASSWORD) {
  const authRes = await axios.post(
    "https://user-api-v2.simplybook.me/admin/auth",
    {
      company: SIMPLYBOOK_COMPANY,
      login: SIMPLYBOOK_LOGIN,
      password: SIMPLYBOOK_PASSWORD,
    },
    { headers: { "Content-Type": "application/json" } }
  );

  cachedToken = authRes.data.token;
  tokenExpiry = new Date(authRes.data.expires).getTime() - 5 * 60 * 1000; // expire 5 mins early
  return cachedToken;
}

// Function to get slots with token, retries once on 403
async function getSlots(serviceid, provider, SIMPLYBOOK_COMPANY) {
  const dates = getNextNDatesISO(30);
  const date_from = dates[0];
  const date_to = dates[dates.length - 1];

  // Internal function to make the slots request
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
        "X-Company-Login": SIMPLYBOOK_COMPANY,
        "X-Token": token,
      },
    });
  }

  // Check token validity or fetch new one
  if (!cachedToken || !tokenExpiry || Date.now() >= tokenExpiry) {
    await fetchToken(process.env.SIMPLYBOOK_COMPANY, process.env.SIMPLYBOOK_LOGIN, process.env.SIMPLYBOOK_PASSWORD);
  }

  try {
    // First try
    const response = await requestSlots(cachedToken);
    return { data: response.data, dates };
  } catch (err) {
    // If 403, refresh token and retry once
    if (err.response && err.response.status === 403) {
      await fetchToken(process.env.SIMPLYBOOK_COMPANY, process.env.SIMPLYBOOK_LOGIN, process.env.SIMPLYBOOK_PASSWORD);
      const retryResponse = await requestSlots(cachedToken);
      return { data: retryResponse.data, dates };
    }
    // Other errors, rethrow
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

    const SIMPLYBOOK_COMPANY = process.env.SIMPLYBOOK_COMPANY;
    const SIMPLYBOOK_LOGIN = process.env.SIMPLYBOOK_LOGIN;
    const SIMPLYBOOK_PASSWORD = process.env.SIMPLYBOOK_PASSWORD;

    if (!SIMPLYBOOK_COMPANY || !SIMPLYBOOK_LOGIN || !SIMPLYBOOK_PASSWORD) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "SimplyBook credentials missing" }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    }

    const { data, dates } = await getSlots(serviceid, provider, SIMPLYBOOK_COMPANY);

    // Find first available day with slots
    const firstAvailableDay = data.find(day => day.slots && day.slots.length > 0);

    if (firstAvailableDay) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          serviceid,
          provider,
          next_available_date: firstAvailableDay.date,
          available_slots: firstAvailableDay.slots,
          checked_dates: dates,
        }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({
          serviceid,
          provider,
          next_available_date: null,
          message: "No available slots found in the next 30 days.",
          checked_dates: dates,
        }),
        headers: { "Access-Control-Allow-Origin": "*" },
      };
    }
  } catch (err) {
    console.error("Error in getslot:", err.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
      headers: { "Access-Control-Allow-Origin": "*" },
    };
  }
};
