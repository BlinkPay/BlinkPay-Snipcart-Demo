import type { Handler } from "@netlify/functions";
import fetch from "node-fetch";
import { BlinkDebitClient } from "blink-debit-api-client-node";
import axios from "axios";

// Configure BlinkPay client with credentials
const blinkPayConfig = {
  blinkpay: {
    debitUrl: process.env.BLINKPAY_DEBIT_URL,
    clientId: process.env.BLINKPAY_CLIENT_ID,
    clientSecret: process.env.BLINKPAY_CLIENT_SECRET,
    timeout: 10000,
    retryEnabled: true,
  },
};

const client = new BlinkDebitClient(axios, blinkPayConfig);

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
    const response = await client.awaitSuccessfulQuickPaymentOrThrowException(
      cid,
      300,
    );

    const reference = (response.consent as any).detail.pcr.reference;

    // At this point, the payment was successful
    console.log("Payment processed successfully");
    try {
      await updateSnipcart(publicToken, "processed");
    } catch (error) {
      console.error(
        "The payment was processed but we failed to send the update to Snipcart.",
        error,
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
  } catch (error) {
    console.error("Payment processing error:", error);

    try {
      await updateSnipcart(publicToken, "failed", {
        code: "payment_failed",
        message: "Payment processing failed",
      });
    } catch (error) {
      console.error("Failed to update Snipcart of a failed payment");
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
