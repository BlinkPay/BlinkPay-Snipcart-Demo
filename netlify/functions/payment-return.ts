import type { Handler } from "@netlify/functions";
import {
  BlinkDebitClient,
  ConsentStatusEnum,
  type GatewayFlow,
  PaymentStatusEnum,
  type QuickPaymentResponse,
  type SingleConsentRequest,
} from "blink-debit-api-client-node";
import axios from "axios";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Outcome = "paid" | "failed" | "pending";

let clientInstance: BlinkDebitClient | null = null;

function getBlinkPayClient(): BlinkDebitClient {
  if (clientInstance) {
    return clientInstance;
  }

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

  clientInstance = new BlinkDebitClient(axios, {
    blinkpay: {
      debitUrl,
      clientId,
      clientSecret,
      timeout: 10000,
      retryEnabled: true,
    },
  });
  return clientInstance;
}

/**
 * Works out where a quick payment has got to.
 *
 * Only AcceptedSettlementCompleted means the customer has paid. A consent that is still
 * awaiting authorisation is pending, however long the customer takes: this function never
 * revokes a quick payment.
 */
function resolveOutcome(quickPayment: QuickPaymentResponse): Outcome {
  const consentStatus = quickPayment.consent.status;
  const paymentStatus = quickPayment.consent.payments?.[0]?.status;

  if (paymentStatus === PaymentStatusEnum.AcceptedSettlementCompleted) {
    return "paid";
  }
  if (
    paymentStatus === PaymentStatusEnum.Rejected ||
    consentStatus === ConsentStatusEnum.Rejected ||
    consentStatus === ConsentStatusEnum.Revoked ||
    consentStatus === ConsentStatusEnum.GatewayTimeout
  ) {
    return "failed";
  }
  return "pending";
}

/**
 * Checks the quick payment was created for the Snipcart session, using both marks checkout
 * left on it: the full session ID on the stored redirect URI, and its first 12 characters in
 * the PCR reference. Without this, a paid quick payment from one Snipcart session could be
 * used to confirm another.
 */
function isBoundToSession(
  quickPayment: QuickPaymentResponse,
  sessionId: string,
): boolean {
  const detail = quickPayment.consent.detail as SingleConsentRequest;
  const redirectUri = (detail.flow?.detail as GatewayFlow | undefined)
    ?.redirectUri;

  let redirectSessionId: string | null;
  try {
    redirectSessionId = new URL(redirectUri ?? "").searchParams.get("session");
  } catch {
    return false;
  }
  return (
    redirectSessionId === sessionId &&
    detail.pcr?.reference === sessionId.slice(0, 12)
  );
}

/**
 * Confirms the outcome with Snipcart, using the payment session ID and the gateway secret key.
 *
 * @param transactionId the BlinkPay payment ID, or the quick payment ID when no payment exists
 * @returns the URL Snipcart wants the customer sent to
 */
async function confirmWithSnipcart(
  sessionId: string,
  transactionId: string,
  outcome: "paid" | "failed",
): Promise<string> {
  if (!process.env.SNIPCART_GATEWAY_API_KEY) {
    throw new Error("SNIPCART_GATEWAY_API_KEY environment variable is not set");
  }

  const response = await fetch(
    "https://payment.snipcart.com/api/private/custom-payment-gateway/payment",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SNIPCART_GATEWAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentSessionId: sessionId,
        state: outcome === "paid" ? "processed" : "failed",
        transactionId,
        ...(outcome === "failed" && {
          error: {
            code: "payment_failed",
            message:
              "The payment was not completed. It was declined, cancelled or timed out at the bank.",
          },
        }),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Snipcart payment confirmation failed with HTTP ${response.status}`,
    );
  }

  const { returnUrl } = (await response.json()) as { returnUrl?: string };
  if (!returnUrl || !returnUrl.startsWith("https://")) {
    throw new Error(
      "Snipcart payment confirmation returned no usable returnUrl",
    );
  }
  return returnUrl;
}

function jsonResponse(statusCode: number, body: object) {
  return { statusCode, body: JSON.stringify(body) };
}

/**
 * Called by the return page, repeatedly, once BlinkPay has sent the customer back.
 *
 * Each call reads the quick payment once (which is also what completes it at BlinkPay), checks
 * it was created for the supplied Snipcart session, and confirms the result with Snipcart once
 * it is final, quoting the BlinkPay payment ID as the transaction ID. The return page polls until then, so this function stays well inside Netlify's
 * function timeout.
 *
 * Responses:
 * - 200 `{ status: "pending" }`: not final yet, ask again
 * - 200 `{ status: "paid" | "failed", returnUrl }`: final and confirmed with Snipcart
 * - 400: `session` or `cid` is missing or malformed
 * - 403: the quick payment was not created for this session
 * - 502: BlinkPay or Snipcart could not be reached, ask again
 */
export const handler: Handler = async (event) => {
  const sessionId = event.queryStringParameters?.session ?? "";
  const quickPaymentId = event.queryStringParameters?.cid ?? "";

  if (!UUID_PATTERN.test(sessionId) || !UUID_PATTERN.test(quickPaymentId)) {
    return jsonResponse(400, { error: "Missing or invalid parameters" });
  }

  let quickPayment: QuickPaymentResponse;
  try {
    quickPayment = await getBlinkPayClient().getQuickPayment(quickPaymentId);
  } catch (error: any) {
    console.error(
      `Reading quick payment ${quickPaymentId} failed: ${error.message}`,
    );
    return jsonResponse(502, {
      error: "We couldn't check your payment. Please try again.",
    });
  }

  if (!isBoundToSession(quickPayment, sessionId)) {
    console.warn(
      `Refused quick payment ${quickPaymentId}: it was not created for the supplied Snipcart session`,
    );
    return jsonResponse(403, {
      error: "This payment does not belong to this order.",
    });
  }

  const outcome = resolveOutcome(quickPayment);
  if (outcome === "pending") {
    return jsonResponse(200, { status: outcome });
  }

  try {
    const returnUrl = await confirmWithSnipcart(
      sessionId,
      quickPayment.consent.payments?.[0]?.paymentId ?? quickPaymentId,
      outcome,
    );
    console.log(
      `Quick payment ${quickPaymentId} confirmed with Snipcart as ${outcome}`,
    );
    return jsonResponse(200, { status: outcome, returnUrl });
  } catch (error: unknown) {
    console.error(
      `Quick payment ${quickPaymentId} is ${outcome} but confirming it with Snipcart failed:`,
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonResponse(502, {
      error:
        outcome === "paid"
          ? `Your payment was received but we couldn't update your order. Please contact us with the payment reference ${sessionId.slice(0, 12)}.`
          : "We couldn't update your order. Please try again.",
    });
  }
};
