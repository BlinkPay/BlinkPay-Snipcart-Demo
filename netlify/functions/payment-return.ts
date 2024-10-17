import type { Handler } from "@netlify/functions";
import fetch from "node-fetch";
import { BlinkDebitClient } from "blink-debit-api-client-node";

const client = new BlinkDebitClient();

async function updateSnipcart(
  paymentSessionId: string,
  state: "processed" | "failed",
  error?: { code: string; message: string },
) {
  try {
    const response = await fetch(
      "https://payment.snipcart.com/api/private/custom-payment-gateway/payment",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SNIPCART_GATEWAY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentSessionId,
          state,
          ...(error && { error }),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to update Snipcart payment status: ${response.statusText}`,
      );
    }

    return await response.json();
  } catch (error) {
    console.error("Error updating Snipcart:", error);
    throw error;
  }
}

export const handler: Handler = async function (event) {
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
  let paymentSuccessful = false;

  try {
    // Query the BlinkPay client
    await client.awaitSuccessfulQuickPaymentOrThrowException(cid, 300);
    paymentSuccessful = true;

    // At this point, the payment was successful
    console.log("Payment processed successfully");

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        message: "Payment processed successfully",
      }),
    };
  } catch (error) {
    console.error("Payment processing error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        status: "error",
        message: "Payment processing failed",
      }),
    };
  } finally {
    // Update Snipcart regardless of the outcome
    try {
      if (paymentSuccessful) {
        await updateSnipcart(publicToken, "processed");
      } else {
        await updateSnipcart(publicToken, "failed", {
          code: "payment_failed",
          message: "Payment processing failed",
        });
      }
    } catch (snipcartError) {
      console.error("Error updating Snipcart:", snipcartError);
    }
  }
};
