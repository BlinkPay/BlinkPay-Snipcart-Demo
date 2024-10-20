import type { Handler } from "@netlify/functions";

/**
 * Handles incoming HTTP requests from Snipcart. This will a public Snipcart token and return a list of available payment methods.
 *
 * @param event - The event object containing the HTTP request details.
 * @returns A promise that resolves to an HTTP response object.
 *
 * The function performs the following steps:
 * 1. Logs the received request.
 * 2. Attempts to parse the request body as JSON.
 * 3. Validates the presence of the `publicToken` in the request body.
 * 4. Sends a validation request to the Snipcart API using the `publicToken`.
 * 5. If the validation is successful, constructs a list of payment methods and returns it.
 * 6. Handles and logs any errors that occur during the process.
 *
 * Possible HTTP response statuses:
 * - 200: Successfully validated and returned the payment method list.
 * - 400: Invalid request body or missing `publicToken`.
 * - 401: Unauthorized, Snipcart validation failed.
 * - 500: Internal server error.
 */
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
