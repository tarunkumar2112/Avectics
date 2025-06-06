const axios = require("axios");

const SIMPLYBOOK_COMPANY = process.env.SIMPLYBOOK_COMPANY;
const SIMPLYBOOK_LOGIN = process.env.SIMPLYBOOK_LOGIN;
const SIMPLYBOOK_PASSWORD = process.env.SIMPLYBOOK_PASSWORD;

function formatDate(date) {
  return date.toISOString().split("T")[0];
}

function formatDisplayDate(date) {
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  return date.toLocaleDateString('en-US', options);
}

exports.handler = async function (event, context) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      },
      body: "OK"
    };
  }

  try {
    const authRes = await axios.post("https://user-api-v2.simplybook.me/admin/auth", {
      company: SIMPLYBOOK_COMPANY,
      login: SIMPLYBOOK_LOGIN,
      password: SIMPLYBOOK_PASSWORD
    }, {
      headers: { "Content-Type": "application/json" }
    });

    const token = authRes.data.token;

    const headers = {
      "Content-Type": "application/json",
      "X-Company-Login": SIMPLYBOOK_COMPANY,
      "X-Token": token
    };

    const today = new Date();
    const dateFrom = formatDate(today);
    const dateTo = formatDate(new Date(today.setDate(today.getDate() + 30)));

   const service = {
  id: 3,
  provider_id: 7,
  name: "UAPL Assessment Class A 25kg / Proficiency Check",
  days: ['all']
};

    const res = await axios.get("https://user-api-v2.simplybook.me/admin/timeline/slots", {
      headers,
      params: {
        service_id: service.id,
        provider_id: service.provider_id,
        date_from: dateFrom,
        date_to: dateTo,
        with_available_slots: 1
      }
    });

    const responseData = Array.isArray(res.data) ? res.data : res.data.data;

    if (!Array.isArray(responseData)) {
      throw new Error("Unexpected API response structure");
    }

    const availableDates = [];

    responseData.forEach(day => {
      if (Array.isArray(day.slots)) {
        day.slots.forEach(slot => {
          if (slot.time || slot.is_available) {
            const date = new Date(day.date);
            availableDates.push({
              date: day.date,
              day: date.toLocaleDateString('en-US', { weekday: 'long' }),
              formatted: formatDisplayDate(date)
            });
          }
        });
      }
    });

    const filteredDates = service.days.includes('all')
      ? availableDates
      : availableDates.filter(d => d.day.toLowerCase() === 'tuesday');

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serviceId: service.id,
        serviceName: service.name,
        nextAvailableDates: filteredDates.slice(0, 3),
        hasAvailability: filteredDates.length > 0,
        lastUpdated: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error("❌ Error in service2.js:", error.message);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.response?.data || "Unknown error"
      })
    };
  }
};
