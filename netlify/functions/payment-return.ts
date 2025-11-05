import type { Handler } from "@netlify/functions";
import fetch from "node-fetch";
import { BlinkDebitClient } from "blink-debit-api-client-node";
import axios from "axios";

/**
 * Initialize BlinkPay client with validation
 */
function initializeBlinkPayClient(): BlinkDebitClient {
  const debitUrl = process.env.BLINKPAY_DEBIT_URL;
  const clientId = process.env.BLINKPAY_CLIENT_ID;
  const clientSecret = process.env.BLINKPAY_CLIENT_SECRET;

  if (!debitUrl || !clientId || !clientSecret) {
    const missing = [];
    if (!debitUrl) missing.push("BLINKPAY_DEBIT_URL");
    if (!clientId) missing.push("BLINKPAY_CLIENT_ID");
    if (!clientSecret) missing.push("BLINKPAY_CLIENT_SECRET");
    throw new Error(
      `Missing required BlinkPay environment variables: ${missing.join(", ")}`,
    );
  }

  console.log("Initializing BlinkPay client with:", {
    debitUrl,
    clientId: clientId.substring(0, 8) + "...",
    clientSecretSet: !!clientSecret,
  });

  const blinkPayConfig = {
    blinkpay: {
      debitUrl,
      clientId,
      clientSecret,
      timeout: 10000,
      retryEnabled: true,
    },
  };

  return new BlinkDebitClient(axios, blinkPayConfig);
}

const client = initializeBlinkPayClient();

/**
 * Updates the payment status in Snipcart for a given payment session.
 *
 * @param publicToken - The public token associated with the payment session.
 * @param state - The state of the payment, either "processed" or "failed".
 * @param error - Optional error object containing a code and message, used when the payment state is "failed".
 * @returns A promise that resolves to the response from Snipcart's API.
 * @throws Will throw an error if fetching the payment session or updating the payment status fails.
 */
async function updateSnipcart(
  publicToken: string,
  state: "processed" | "failed",
  error?: { code: string; message: string },
) {
  const sessionResponse = await fetch(
    `https://payment.snipcart.com/api/public/custom-payment-gateway/payment-session?publicToken=${publicToken}`,
    { method: "GET" },
  );

  if (!sessionResponse.ok) {
    throw new Error(
      `Failed to fetch payment session: ${sessionResponse.statusText}`,
    );
  }

  const session: any = await sessionResponse.json();

  const response = await fetch(
    "https://payment.snipcart.com/api/private/custom-payment-gateway/payment",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SNIPCART_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentSessionId: session.id,
        state,
        ...(error && { error }),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to update Snipcart payment status: ${response.statusText}`,
    );
  } else {
    console.log(
      `Snipcart payment status updated successfully for a ${state} payment`,
    );
  }
  return await response.json();
}

/**
 * Handles the payment return process by verifying required query parameters,
 * querying the BlinkPay client for payment status, and updating Snipcart accordingly.
 *
 * @param {object} event - The event object containing query parameters.
 * @param {object} event.queryStringParameters - The query parameters from the request.
 * @param {string} event.queryStringParameters.publicToken - The public token for Snipcart.
 * @param {string} event.queryStringParameters.cid - The quick payment ID.
 *
 * @returns {Promise<object>} - The response object with status code and body.
 *
 * @throws {Error} - Throws an error if payment processing or Snipcart update fails.
 */
export const handler: Handler = async function (event) {
  console.log("Received request:", JSON.stringify(event));

  if (
    !event.queryStringParameters ||
    !event.queryStringParameters.publicToken ||
    !event.queryStringParameters.cid
  ) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameters" }),
    };
  }

  const { publicToken, cid } = event.queryStringParameters;

  console.log("Querying payment response for quick payment ID:", cid);

  try {
    // Query the BlinkPay client
    console.log("Awaiting payment confirmation from BlinkPay...");
    const response = await client.awaitSuccessfulQuickPaymentOrThrowException(
      cid,
      300,
    );

    console.log(
      "Payment response received:",
      JSON.stringify(response, null, 2),
    );

    const reference = (response.consent as any).detail.pcr.reference;

    // At this point, the payment was successful
    console.log("Payment processed successfully with reference:", reference);
    try {
      await updateSnipcart(publicToken, "processed");
    } catch (error: any) {
      console.error(
        "The payment was processed but we failed to send the update to Snipcart.",
        {
          message: error.message,
          stack: error.stack,
        },
      );
      return {
        statusCode: 400,
        body: JSON.stringify({
          status: "error",
          message: `The payment was processed but we failed to send the update to our system. Please contact our staff with the payment reference ${reference} to complete your order.`,
        }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        message: "Payment processed successfully",
        reference: reference,
      }),
    };
  } catch (error: any) {
    console.error("Payment processing error:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    try {
      await updateSnipcart(publicToken, "failed", {
        code: "payment_failed",
        message: "Payment processing failed",
      });
    } catch (updateError: any) {
      console.error("Failed to update Snipcart of a failed payment", {
        message: updateError.message,
        stack: updateError.stack,
      });
    }

    return {
      statusCode: 400,
      body: JSON.stringify({
        status: "error",
        error: "Payment processing failed",
      }),
    };
  }
};
