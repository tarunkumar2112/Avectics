const axios = require("axios");

exports.handler = async function (event, context) {
  const companyLogin = process.env.SIMPLYBOOK_COMPANY_LOGIN;
  const apiKey = process.env.SIMPLYBOOK_API_KEY;

  try {
    const response = await axios.post("https://user-api.simplybook.me/login", {
      jsonrpc: "2.0",
      method: "getToken",
      params: {
        company: companyLogin,
        api_key: apiKey
      },
      id: 1
    });

    if (response.data && response.data.result) {
      return {
        statusCode: 200,
        body: JSON.stringify({ token: response.data.result }),
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No token received", raw: response.data }),
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
