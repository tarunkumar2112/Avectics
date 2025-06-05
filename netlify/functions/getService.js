const axios = require("axios");

exports.handler = async function (event, context) {
  const companyLogin = process.env.SIMPLYBOOK_COMPANY_LOGIN;

  try {
    // Step 1: Get token
    const loginResponse = await axios.post("https://user-api.simplybook.me/login", {
      jsonrpc: "2.0",
      method: "getToken",
      params: {
        company: companyLogin,
        api_key: process.env.SIMPLYBOOK_API_KEY
      },
      id: 1
    });

    const token = loginResponse.data?.result;
    if (!token) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Login failed, no token received." }),
      };
    }

    // Step 2: Call getServiceList
    const serviceResponse = await axios.post("https://user-api.simplybook.me/", {
      jsonrpc: "2.0",
      method: "getServiceList",
      params: {},
      id: 1
    }, {
      headers: {
        "X-Company-Login": companyLogin,
        "X-Token": token,
        "Content-Type": "application/json"
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify(serviceResponse.data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
