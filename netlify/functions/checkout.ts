import type { Handler } from "@netlify/functions";
import {
  BlinkDebitClient,
  type QuickPaymentRequest,
  ConsentDetailTypeEnum,
  AuthFlowDetailTypeEnum,
  type GatewayFlow,
  type AuthFlow,
  AmountCurrencyEnum,
  type Amount,
  type Pcr,
} from "blink-debit-api-client-node";
import axios from "axios";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The part of Snipcart's payment session this function relies on. */
interface SnipcartPaymentSession {
  id: string;
  invoice: { amount: number; currency: string };
}

/**
 * Starts a BlinkPay quick payment for a Snipcart payment session and returns the URL to send
 * the customer to.
 *
 * The amount is always read from Snipcart on the server, never taken from the browser. The
 * quick payment is bound to the Snipcart session in three ways: the session ID travels on
 * BlinkPay's redirect URI, its first 12 characters are stamped into the PCR reference (both
 * are checked on return), and it is both the request ID and the idempotency key, so a
 * repeated request for one session can't create a second payment (BlinkPay de-duplicates
 * gateway flow requests on the request ID).
 *
 * Nothing from the request, the Snipcart session or the customer is logged.
 */
export const handler: Handler = async (event) => {
  const publicToken = readPublicToken(event.body);
  if (!publicToken) {
    return jsonResponse(400, { error: "Missing publicToken" });
  }

  const host = event.headers.host;
  if (!host) {
    return jsonResponse(400, { error: "Missing host header" });
  }

  try {
    const session = await fetchPaymentSession(publicToken);
    const redirectUri = await createQuickPayment(
      session,
      `https://${host}/payments/payment-return?session=${session.id}`,
    );
    return jsonResponse(200, { redirectUri });
  } catch (error: unknown) {
    // Only the message: error objects from HTTP clients can carry request URLs and headers.
    console.error(
      "Checkout failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return jsonResponse(500, {
      error: "Unable to start the payment. Please try again.",
    });
  }
};

function jsonResponse(statusCode: number, body: object) {
  return { statusCode, body: JSON.stringify(body) };
}

function readPublicToken(body: string | null): string | null {
  try {
    const publicToken = JSON.parse(body ?? "{}")?.publicToken;
    return typeof publicToken === "string" && publicToken ? publicToken : null;
  } catch {
    return null;
  }
}

/**
 * Reads the payment session from Snipcart. This is the only use of the public token.
 */
async function fetchPaymentSession(
  publicToken: string,
): Promise<SnipcartPaymentSession> {
  let response: Response;
  try {
    response = await fetch(
      `https://payment.snipcart.com/api/public/custom-payment-gateway/payment-session?publicToken=${encodeURIComponent(publicToken)}`,
    );
  } catch {
    // The original error is dropped: it comes from a request whose URL holds the token
    throw new Error("Snipcart payment session request could not be completed");
  }
  if (!response.ok) {
    throw new Error(
      `Snipcart payment session request failed with HTTP ${response.status}`,
    );
  }

  let session: Partial<SnipcartPaymentSession> | null;
  try {
    session = (await response.json()) as Partial<SnipcartPaymentSession> | null;
  } catch {
    // The parse error is dropped: its message quotes the body, which holds customer details
    throw new Error("Snipcart payment session response is not valid JSON");
  }
  if (typeof session?.id !== "string" || !UUID_PATTERN.test(session.id)) {
    throw new Error("Snipcart payment session has no valid ID");
  }
  if (typeof session.invoice?.amount !== "number") {
    throw new Error("Snipcart payment session has no invoice amount");
  }
  // BlinkPay takes NZD only, so an amount in any other currency must not be charged as NZD
  const currency = session.invoice.currency;
  if (typeof currency !== "string" || currency.toUpperCase() !== "NZD") {
    throw new Error("Snipcart payment session is not in NZD");
  }
  return {
    id: session.id,
    invoice: { amount: session.invoice.amount, currency },
  };
}

/**
 * Creates the BlinkPay quick payment and returns the gateway URL for the customer.
 */
async function createQuickPayment(
  session: SnipcartPaymentSession,
  returnUrl: string,
): Promise<string> {
  const request: QuickPaymentRequest = {
    type: ConsentDetailTypeEnum.Single,
    flow: {
      detail: {
        type: AuthFlowDetailTypeEnum.Gateway,
        redirectUri: returnUrl,
      } as GatewayFlow,
    } as AuthFlow,
    amount: {
      currency: AmountCurrencyEnum.NZD,
      total: session.invoice.amount.toFixed(2),
    } as Amount,
    // PCR fields appear on the bank statement and are limited to 12 characters each
    pcr: {
      particulars: (process.env.PUBLIC_BUSINESS_NAME || "Online order").slice(
        0,
        12,
      ),
      code: "BlinkPay",
      // Checked on return to prove the quick payment belongs to this Snipcart session
      reference: session.id.slice(0, 12),
    } as Pcr,
  };

  try {
    const response = await getBlinkPayClient().createQuickPayment(request, {
      requestId: session.id,
      idempotencyKey: session.id,
    });
    if (!response.redirectUri) {
      throw new Error("the response has no redirectUri");
    }
    console.log(`Created quick payment ${response.quickPaymentId}`);
    return response.redirectUri;
  } catch (error: any) {
    throw new Error(
      `BlinkPay quick payment creation failed: ${error.message}. Check the BlinkPay credentials and whitelisted redirect URL.`,
    );
  }
}

function getBlinkPayClient(): BlinkDebitClient {
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

  return new BlinkDebitClient(axios, {
    blinkpay: {
      debitUrl,
      clientId,
      clientSecret,
      timeout: 10000,
      retryEnabled: true,
    },
  });
}
