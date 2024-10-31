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

/**
 * Handles the checkout process by validating the request, fetching the payment session,
 * and creating a quick payment. Returns a redirect URI for the payment.
 *
 * @param {any} event - The event object containing the request data.
 * @returns {Promise<{statusCode: number, body: string}>} - The response object containing the status code and body.
 *
 * @throws {Error} - Throws an error if the SNIPCART_GATEWAY_API_KEY is not set, the request is invalid,
 *                   fetching the payment session fails, or creating the quick payment fails.
 */
export const handler = async function (event: any) {
  console.log("Received request:", JSON.stringify(event));

  try {
    if (!process.env.SNIPCART_GATEWAY_API_KEY) {
      throw new Error("SNIPCART_GATEWAY_API_KEY is not set");
    }

    const request = event.body ? JSON.parse(event.body) : null;
    if (!request || !request.publicToken) {
      throw new Error("Invalid request or missing publicToken");
    }

    // Get the payment session
    const sessionResponse = await fetch(
      `https://payment.snipcart.com/api/public/custom-payment-gateway/payment-session?publicToken=${request.publicToken}`,
      { method: "GET" },
    );

    if (!sessionResponse.ok) {
      throw new Error(
        `Failed to fetch payment session: ${sessionResponse.status}`,
      );
    }

    const session: any = await sessionResponse.json();
    console.log("Session data:", session);

    const invoice = session.invoice;
    const returnUrl = `https://${event.headers.host}/payments/payment-return`;
    const amount = invoice.amount.toFixed(2);
    const particulars = (process.env.PUBLIC_BUSINESS_NAME ?? "").slice(0, 12); // Will be displayed on the bank statement, limit 12 chars
    const code = "BlinkPay"; // Will be displayed on the bank statement, limit 12 chars
    const randomOrderNo = Math.floor(Math.random() * 900000) + 100000;
    const reference = `PAY-${randomOrderNo}`; // Will be displayed on the bank statement, limit 12 chars

    console.log("Creating quick payment with:", {
      returnUrl,
      amount,
      particulars,
      code,
      reference,
    });
    const redirectUri = await createQuickPayment(
      returnUrl,
      amount,
      particulars,
      code,
      reference,
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ redirectUri: redirectUri }),
    };
  } catch (error: any) {
    console.error("Error in handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || "An unknown error occurred",
      }),
    };
  }
};

/**
 * Creates a quick payment request with BlinkPay and returns the redirect URI.
 *
 * @param returnUrl - The URL to which the user will be redirected after payment.
 * @param amount - The total amount for the payment in string format.
 * @param particulars - The payment particulars.
 * @param code - The payment code.
 * @param reference - The payment reference.
 * @returns A promise that resolves to the redirect URI for the quick payment.
 * @throws Will throw an error if the quick payment request fails or if no redirect URI is found in the response.
 */
async function createQuickPayment(
  returnUrl: string,
  amount: string,
  particulars: string,
  code: string,
  reference: string,
): Promise<string> {
  const blinkpayClient = new BlinkDebitClient();
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
      total: amount,
    } as Amount,
    pcr: {
      particulars: particulars,
      code: code,
      reference: reference,
    } as Pcr,
  };

  console.log("QuickPayment request:", request);
  const qpCreateResponse = await blinkpayClient.createQuickPayment(request);
  const redirectUri = qpCreateResponse.redirectUri;
  console.log("QuickPayment response:", qpCreateResponse);

  if (!redirectUri) {
    throw new Error("No redirectUri in QuickPayment response");
  }

  return redirectUri;
}
