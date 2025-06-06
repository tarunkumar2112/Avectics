const axios = require('axios');

exports.handler = async function (event) {
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
    const headers = {
      "Content-Type": "application/json",
      "X-Company-Login": SIMPLYBOOK_COMPANY,
      "X-Token": token
    };

    // Calculate date range (next 2 weeks)
    const today = new Date();
    const dateFrom = formatDate(today);
    const dateTo = formatDate(new Date(today.setDate(today.getDate() + 30)));

    // Define services to check
    const services = [
      {
        id: 7,
        provider_id: 6,
        name: "UAPL Theory 1 day course",
        days: ['all']
      },
      {
        id: 5,
        provider_id: 2,
        name: "Course 2a: 4 Days Beginner Practical Lesson (Rotorcraft ≤ 7kg)",
        days: ['tuesday']
      },
      {
        id: 6,
        provider_id: 2,
        name: "Course 2b: 4 Days Beginner Practical Lesson (Rotorcraft ≤ 25kg)",
        days: ['tuesday']
      },
      {
        id: 3,
        provider_id: 7,
        name: "UAPL Assessment Class A 25kg / Proficiency Check",
        days: ['all']
      },
      {
        id: 2,
        provider_id: 7,
        name: "UAPL Assessment Class A 7kg / Proficiency Check",
        days: ['all']
      }
    ];

    // Fetch availability for each service
    const availabilityPromises = services.map(async service => {
      try {
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

        // 🔍 Log the full response from SimplyBook
        // console.log(`🔍 API response for service ID ${service.id} (${service.name}):`);
        // console.log(JSON.stringify(res.data, null, 2));

       const responseData = Array.isArray(res.data) ? res.data : res.data.data;

if (!responseData || !Array.isArray(responseData)) {
  return {
    serviceId: service.id,
    serviceName: service.name,
    nextAvailableDates: [],
    hasAvailability: false,
    error: "Unexpected API response structure"
  };
}

const availableDates = [];
responseData.forEach(day => {
  if (day.slots && Array.isArray(day.slots)) {
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
  serviceId: service.id,
  serviceName: service.name,
  nextAvailableDates: filteredDates.slice(0, 3),
  hasAvailability: filteredDates.length > 0
};

      } catch (error) {
        console.error(`❌ Error fetching availability for service ${service.id}:`, error.message);
        return {
          serviceId: service.id,
          serviceName: service.name,
          nextAvailableDates: [],
          hasAvailability: false,
          error: error.message
        };
      }
    });

    const availabilityResults = await Promise.all(availabilityPromises);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: availabilityResults,
        lastUpdated: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('❌ Error in availability function:', error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.response?.data || 'No additional error details'
      })
    };
  }
};

// Helper functions
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(date) {
  const options = { weekday: 'short', day: 'numeric', month: 'short' };
  return date.toLocaleDateString('en-US', options);
}
