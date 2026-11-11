import type { Handler } from "@netlify/functions";

/**
 * Called by Snipcart to list the payment methods for a checkout.
 *
 * Snipcart sends its public token in the request body. The token is validated with Snipcart to
 * prove the request came from Snipcart, and is never logged.
 *
 * Possible HTTP response statuses:
 * - 200: Successfully validated and returned the payment method list.
 * - 400: Invalid request body, missing `publicToken` or missing host header.
 * - 401: Unauthorised, Snipcart validation failed.
 * - 500: Internal server error.
 */
export const handler: Handler = async (event) => {
  let publicToken: unknown;
  try {
    publicToken = JSON.parse(event.body || "{}")?.publicToken;
  } catch {
    // The parse error is not logged: its message quotes the body, which holds the token
    return jsonResponse(400, { error: "Invalid request body" });
  }

  if (typeof publicToken !== "string" || !publicToken) {
    return jsonResponse(400, { error: "Missing PublicToken" });
  }

  const hostname = event.headers.host;
  if (!hostname) {
    return jsonResponse(400, { error: "Missing host header" });
  }

  try {
    const response = await fetch(
      `https://payment.snipcart.com/api/public/custom-payment-gateway/validate?publicToken=${encodeURIComponent(publicToken)}`,
    );

    if (!response.ok) {
      console.warn(
        `Snipcart token validation failed with HTTP ${response.status}`,
      );
      return jsonResponse(401, { error: "Unauthorized" });
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        {
          id: "blinkpay",
          name: "BlinkPay",
          checkoutUrl: `https://${hostname}/payments/checkout`,
        },
      ]),
    };
  } catch {
    // The error is not logged: it comes from a request whose URL holds the token
    console.error("Snipcart token validation could not be completed");
    return jsonResponse(500, { error: "Internal Server Error" });
  }
};

function jsonResponse(statusCode: number, body: object) {
  return { statusCode, body: JSON.stringify(body) };
}
