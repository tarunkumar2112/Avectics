const axios = require("axios");

const SERVICE_IDS = {
  theory: 6,           // UAPL Theory 1 day course id
  course2a: 5,
  course2b: 5,         // Both 2a & 2b under same unit 5
  assessment25kg: 7,   // Unit 7 has services 3 and 2 (assessment classes)
  assessment7kg: 7     // Same unit for both assessments
};

// Helper: Get token from SimplyBook
async function getToken(companyLogin, apiKey) {
  const response = await axios.post("https://user-api.simplybook.me/login", {
    jsonrpc: "2.0",
    method: "getToken",
    params: { company: companyLogin, api_key: apiKey },
    id: 1,
  });
  if (response.data && response.data.result) return response.data.result;
  throw new Error("Failed to get token");
}

// Helper: Get available time intervals for a service/unit
async function getAvailableIntervals(token, companyLogin, serviceId, unitId, dateFrom, dateTo) {
  const response = await axios.post(
    "https://user-api.simplybook.me/",
    {
      jsonrpc: "2.0",
      method: "getServiceAvailableTimeIntervals",
      params: {
        dateFrom,
        dateTo,
        eventId: serviceId,
        unitId,
        count: 1,
      },
      id: 2,
    },
    {
      headers: {
        "X-Token": token,
        "X-Company-Login": companyLogin,
        "Content-Type": "application/json",
      },
    }
  );
  if (response.data && response.data.result) return response.data.result;
  return null;
}

// Helper: Get units (providers) for a service
async function getUnits(token, companyLogin) {
  const response = await axios.post(
    "https://user-api.simplybook.me/",
    {
      jsonrpc: "2.0",
      method: "getUnitList",
      params: {},
      id: 3,
    },
    {
      headers: {
        "X-Token": token,
        "X-Company-Login": companyLogin,
        "Content-Type": "application/json",
      },
    }
  );
  if (response.data && response.data.result) return response.data.result;
  throw new Error("Failed to get units");
}

// Find earliest available date from the intervals object
function findEarliestDate(intervals) {
  if (!intervals) return null;
  const dates = Object.keys(intervals).sort();
  return dates.length > 0 ? dates[0] : null;
}

// Find earliest Tuesday date from intervals
function findEarliestTuesday(intervals) {
  if (!intervals) return null;
  const tuesdayDates = Object.keys(intervals).filter(date => {
    const day = new Date(date).getDay();
    return day === 2; // Tuesday
  }).sort();
  return tuesdayDates.length > 0 ? tuesdayDates[0] : null;
}

exports.handler = async function (event, context) {
  const companyLogin = process.env.SIMPLYBOOK_COMPANY_LOGIN;
  const apiKey = process.env.SIMPLYBOOK_API_KEY;

  // Handle CORS preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  try {
    const token = await getToken(companyLogin, apiKey);
    console.log("Token acquired:", token);

    const unitsObj = await getUnits(token, companyLogin);
    console.log("Units fetched:", unitsObj);

    // Convert units object to array for iteration
    const units = Object.values(unitsObj);

    if (!units || units.length === 0) {
      return {
        statusCode: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "No units found" }),
      };
    }

    // Define date range: today to 2 weeks later
    const today = new Date();
    const dateFrom = today.toISOString().slice(0, 10);
    const dateTo = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Function to get earliest availability for a single service checking all units
    async function getNextAvailableForService(serviceId) {
      for (const unit of units) {
        // Check if the unit offers this service
        if (!unit.services || !unit.services.includes(serviceId)) continue;

        try {
          const intervals = await getAvailableIntervals(
            token,
            companyLogin,
            serviceId,
            unit.id,
            dateFrom,
            dateTo
          );
          const nextDate = findEarliestDate(intervals);
          if (nextDate) return nextDate;
        } catch (e) {
          console.warn(`Error fetching intervals for service ${serviceId} unit ${unit.id}:`, e.message);
        }
      }
      return null;
    }

    // For Course 2a & 2b combined
    async function getNextAvailableForCourse2() {
      const availableDates = [];

      for (const unit of units) {
        if (!unit.services) continue;
        const has2a = unit.services.includes(SERVICE_IDS.course2a);
        const has2b = unit.services.includes(SERVICE_IDS.course2b);
        if (!has2a && !has2b) continue;

        for (const serviceId of [SERVICE_IDS.course2a, SERVICE_IDS.course2b]) {
          if (!unit.services.includes(serviceId)) continue;

          try {
            const intervals = await getAvailableIntervals(
              token,
              companyLogin,
              serviceId,
              unit.id,
              dateFrom,
              dateTo
            );
            const earliestTuesday = findEarliestTuesday(intervals);
            if (earliestTuesday) availableDates.push(earliestTuesday);
          } catch (e) {
            console.warn(`Error fetching intervals for course 2 service ${serviceId} unit ${unit.id}:`, e.message);
          }
        }
      }
      if (availableDates.length === 0) return null;
      return availableDates.sort()[0];
    }

    // Collect results
    const results = {};

    results["UAPL Theory 1 day course"] = await getNextAvailableForService(SERVICE_IDS.theory);
    results["Course 2a & 2b"] = await getNextAvailableForCourse2();
    results["UAPL Assessment Class A 25kg / Proficiency Check"] = await getNextAvailableForService(3); // service 3 for 25kg
    results["UAPL Assessment Class A 7kg / Proficiency Check"] = await getNextAvailableForService(2);  // service 2 for 7kg

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",   // CORS header here
        "Content-Type": "application/json",
      },
      body: JSON.stringify(results),
    };
  } catch (error) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",   // CORS header here on error
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
