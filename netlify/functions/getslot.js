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

exports.handler = async function (event) {
  // Enable CORS for all origins
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const { serviceid, provider } = event.queryStringParameters || {};

    if (!serviceid || !provider) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Missing serviceid or provider" }),
      };
    }

    const SIMPLYBOOK_COMPANY = process.env.SIMPLYBOOK_COMPANY;
    const SIMPLYBOOK_LOGIN = process.env.SIMPLYBOOK_LOGIN;
    const SIMPLYBOOK_PASSWORD = process.env.SIMPLYBOOK_PASSWORD;

    if (!SIMPLYBOOK_COMPANY || !SIMPLYBOOK_LOGIN || !SIMPLYBOOK_PASSWORD) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "SimplyBook credentials missing" }),
      };
    }

    // Get or reuse token
    if (!cachedToken || !tokenExpiry || Date.now() >= tokenExpiry) {
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
      tokenExpiry = new Date(authRes.data.expires).getTime() - 5 * 60 * 1000; // 5 mins early
    }

    // Prepare date range
    const dates = getNextNDatesISO(30);
    const date_from = dates[0];
    const date_to = dates[dates.length - 1];

    // Get slots
    const slotsRes = await axios.get(
      "https://user-api-v2.simplybook.me/admin/timeline/slots",
      {
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
          "X-Token": cachedToken,
        },
      }
    );

    const days = slotsRes.data;

    // Find first day with available slots
    const firstAvailableDay = days.find(
      (day) => day.slots && day.slots.length > 0
    );

    if (firstAvailableDay) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          serviceid,
          provider,
          next_available_date: firstAvailableDay.date,
          available_slots: firstAvailableDay.slots,
          checked_dates: dates,
        }),
      };
    } else {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          serviceid,
          provider,
          next_available_date: null,
          message: "No available slots found in the next 30 days.",
          checked_dates: dates,
        }),
      };
    }
  } catch (err) {
    console.error("Error in getslot:", err.message);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
