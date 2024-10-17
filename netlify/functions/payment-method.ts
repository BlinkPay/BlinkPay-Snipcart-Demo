import type { Handler } from "@netlify/functions";

export const handler: Handler = async (event) => {
  console.log("Received request:", JSON.stringify(event));

  var request;
  try {
    request = JSON.parse(event.body || "{}");
  } catch (error) {
    console.error("Error parsing request body:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid request body" }),
    };
  }

  if (!request.publicToken) {
    console.log("Missing PublicToken");
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing PublicToken" }),
    };
  }

  try {
    const response = await fetch(
      `https://payment.snipcart.com/api/public/custom-payment-gateway/validate?publicToken=${request.publicToken}`,
    );

    if (!response.ok) {
      console.error("Snipcart validation failed:", response.statusText);
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const hostname = event.headers.host;

    const paymentMethodList = [
      {
        id: "blinkpay",
        name: "BlinkPay",
        checkoutUrl: `https://${hostname}/payments/checkout`,
      },
    ];

    console.log("Sending response:", JSON.stringify(paymentMethodList));
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentMethodList),
    };
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
