const axios = require("axios")

exports.handler = async (event) => {
  const SIMPLYBOOK_COMPANY = process.env.SIMPLYBOOK_COMPANY
  const SIMPLYBOOK_LOGIN = process.env.SIMPLYBOOK_LOGIN
  const SIMPLYBOOK_PASSWORD = process.env.SIMPLYBOOK_PASSWORD

  // Enhanced delay function with jitter
  const delay = (ms) => {
    const jitter = Math.random() * 200 // Add randomness to prevent thundering herd
    return new Promise((resolve) => setTimeout(resolve, ms + jitter))
  }

  // Improved retry logic with exponential backoff
  const axiosWithRetry = async (url, config, retries = 5, baseDelay = 1000) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await axios.get(url, config)
      } catch (err) {
        const status = err.response?.status
        const isRateLimit = status === 403 || status === 429
        const isServerError = status >= 500

        if (attempt < retries && (isRateLimit || isServerError)) {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          const waitTime = baseDelay * Math.pow(2, attempt)
          console.warn(`⚠️ ${status} error. Retrying in ${waitTime}ms... (attempt ${attempt + 1}/${retries + 1})`)
          await delay(waitTime)
        } else {
          console.error(`❌ Request failed after ${attempt + 1} attempts:`, {
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            url: url,
          })
          throw err
        }
      }
    }
  }

  try {
    // Step 1: Authenticate with enhanced error handling
    console.log("🔐 Authenticating with SimplyBook...")
    const authRes = await axios.post(
      "https://user-api-v2.simplybook.me/admin/auth",
      {
        company: SIMPLYBOOK_COMPANY,
        login: SIMPLYBOOK_LOGIN,
        password: SIMPLYBOOK_PASSWORD,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Netlify-Function/1.0",
        },
        timeout: 10000, // 10 second timeout
      },
    )

    if (!authRes.data?.token) {
      throw new Error("Authentication failed: No token received")
    }

    const token = authRes.data.token
    console.log("✅ Authentication successful")

    // Step 2: Setup headers with proper authentication
    const headers = {
      "Content-Type": "application/json",
      "X-Company-Login": SIMPLYBOOK_COMPANY,
      "X-Token": token,
      "User-Agent": "Netlify-Function/1.0",
      Accept: "application/json",
    }

    // Step 3: Calculate date range
    const today = new Date()
    const dateFrom = formatDate(today)
    const dateTo = formatDate(new Date(today.getTime() + 30 * 86400000))

    console.log(`📅 Fetching availability from ${dateFrom} to ${dateTo}`)

    const services = [
      { id: 7, provider_id: 6, name: "UAPL Theory 1 day course", days: ["all"] },
      {
        id: 5,
        provider_id: 2,
        name: "Course 2a: 4 Days Beginner Practical Lesson (Rotorcraft ≤ 7kg)",
        days: ["tuesday"],
      },
      {
        id: 6,
        provider_id: 2,
        name: "Course 2b: 4 Days Beginner Practical Lesson (Rotorcraft ≤ 25kg)",
        days: ["tuesday"],
      },
      { id: 3, provider_id: 7, name: "UAPL Assessment Class A 25kg / Proficiency Check", days: ["all"] },
      { id: 2, provider_id: 7, name: "UAPL Assessment Class A 7kg / Proficiency Check", days: ["all"] },
    ]

    // Step 4: Process services sequentially with longer delays
    const availabilityResults = []

    for (let i = 0; i < services.length; i++) {
      const service = services[i]

      // Wait longer between requests to avoid rate limiting
      if (i > 0) {
        await delay(2000) // 2 second delay between requests
      }

      try {
        console.log(`🔍 Fetching availability for service: ${service.name}`)

        const res = await axiosWithRetry("https://user-api-v2.simplybook.me/admin/timeline/slots", {
          headers,
          params: {
            service_id: service.id,
            provider_id: service.provider_id,
            date_from: dateFrom,
            date_to: dateTo,
            with_available_slots: 1,
          },
          timeout: 15000, // 15 second timeout
        })

        const responseData = Array.isArray(res.data) ? res.data : res.data.data

        if (!Array.isArray(responseData)) {
          console.warn(`⚠️ Unexpected response structure for service ${service.id}`)
          availabilityResults.push({
            serviceId: service.id,
            serviceName: service.name,
            nextAvailableDates: [],
            hasAvailability: false,
            error: "Unexpected response structure",
          })
          continue
        }

        const availableDates = []

        responseData.forEach((day) => {
          if (Array.isArray(day.slots)) {
            day.slots.forEach((slot) => {
              if (slot.time || slot.is_available) {
                const date = new Date(day.date)
                availableDates.push({
                  date: day.date,
                  day: date.toLocaleDateString("en-US", { weekday: "long" }),
                  formatted: formatDisplayDate(date),
                })
              }
            })
          }
        })

        const filteredDates = service.days.includes("all")
          ? availableDates
          : availableDates.filter((d) => d.day.toLowerCase() === "tuesday")

        availabilityResults.push({
          serviceId: service.id,
          serviceName: service.name,
          nextAvailableDates: filteredDates.slice(0, 3),
          hasAvailability: filteredDates.length > 0,
        })

        console.log(`✅ Successfully fetched availability for service ${service.id}`)
      } catch (error) {
        console.error(`❌ Error fetching availability for service ${service.id}:`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
        })

        availabilityResults.push({
          serviceId: service.id,
          serviceName: service.name,
          nextAvailableDates: [],
          hasAvailability: false,
          error: error.message,
        })
      }
    }

    console.log("✅ All services processed successfully")

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300", // Cache for 5 minutes
      },
      body: JSON.stringify({
        success: true,
        data: availabilityResults,
        lastUpdated: new Date().toISOString(),
        totalServices: services.length,
        successfulServices: availabilityResults.filter((r) => !r.error).length,
      }),
    }
  } catch (error) {
    console.error("❌ Fatal Error:", {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      stack: error.stack,
    })

    return {
      statusCode: error.response?.status || 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        details: error.response?.data || "No additional error info",
        timestamp: new Date().toISOString(),
      }),
    }
  }
}

// Helper functions
function formatDate(date) {
  return date.toISOString().split("T")[0]
}

function formatDisplayDate(date) {
  const options = { weekday: "short", day: "numeric", month: "short" }
  return date.toLocaleDateString("en-US", options)
}
