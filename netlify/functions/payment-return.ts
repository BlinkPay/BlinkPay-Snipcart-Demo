import type { Handler } from "@netlify/functions";
import fetch from "node-fetch";
import { BlinkDebitClient } from "blink-debit-api-client-node";

const client = new BlinkDebitClient();

async function updateSnipcart(
  publicToken: string,
  state: "processed" | "failed",
  error?: { code: string; message: string },
) {
  try {
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
      console.log(`Snipcart payment status updated successfully for a ${state} payment`);
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

  console.log("Querying payment response for quick payment ID:", cid);

  try {
    // Query the BlinkPay client
    const response = await client.awaitSuccessfulQuickPaymentOrThrowException(cid, 300);
    paymentSuccessful = true;

    const reference = (response.consent as any).detail.pcr.reference;

    // At this point, the payment was successful
    console.log("Payment processed successfully");

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "success",
        message: "Payment processed successfully",
        reference: reference
      }),
    };
  } catch (error) {
    console.error("Payment processing error:", error);

    return {
      statusCode: 400,
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
