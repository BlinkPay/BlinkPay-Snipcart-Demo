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

export const handler = async function (event: any, context: any) {
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

    const paymentSessionId = session.id;
    const invoice = session.invoice;
    const returnUrl = `https://${event.headers.host}/payments/payment-return`;
    const amount = invoice.amount.toFixed(2);
    const particulars = (process.env.PUBLIC_BUSINESS_NAME ?? '').slice(0, 12); // Will be displayed on the bank statement, limit 12 chars
    const code = ""; // Will be displayed on the bank statement, limit 12 chars
    const reference = "Thank You"; // Will be displayed on the bank statement, limit 12 chars

    console.log("Creating quick payment with:", {
      returnUrl,
      amount,
      particulars,
      reference,
    });
    const redirectUri = await createQuickPayment(
      returnUrl,
      amount,
      particulars,
      reference,
    );

    if (!redirectUri) {
      throw new Error("No redirectUri returned from createQuickPayment");
    }

    console.log("Redirect URI:", redirectUri);

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

async function createQuickPayment(
  returnUrl: string,
  amount: string,
  particulars: string,
  reference: string,
): Promise<string> {
  try {
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
        reference: reference,
      } as Pcr,
    };

    console.log("QuickPayment request:", request);
    const qpCreateResponse: any =
      await blinkpayClient.createQuickPayment(request);
    const redirectUri =
      qpCreateResponse.redirect_uri || qpCreateResponse.redirectUri;
    console.log("QuickPayment response:", qpCreateResponse);

    if (!redirectUri) {
      throw new Error("No redirectUri in QuickPayment response");
    }

    return redirectUri;
  } catch (error: any) {
    console.error("Error in createQuickPayment:", error);
    throw error; // Re-throw to be caught in the main handler
  }
}
