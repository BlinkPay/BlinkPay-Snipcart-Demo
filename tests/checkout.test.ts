import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureLogs,
  CUSTOMER_ADDRESS,
  CUSTOMER_EMAIL,
  invoke,
  jsonResponse,
  PUBLIC_TOKEN,
  QUICK_PAYMENT_ID,
  SESSION_ID,
  setFunctionEnvironment,
} from "./helpers";

const blinkpay = vi.hoisted(() => ({ createQuickPayment: vi.fn() }));

vi.mock("blink-debit-api-client-node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("blink-debit-api-client-node")>()),
  BlinkDebitClient: vi.fn(function () {
    return blinkpay;
  }),
}));

import { handler } from "../netlify/functions/checkout";

const GATEWAY_URL = `https://sandbox.debit.blinkpay.co.nz/gateway/pay?id=${QUICK_PAYMENT_ID}`;

function paymentSession(overrides: object = {}) {
  return {
    id: SESSION_ID,
    invoice: {
      amount: 12.5,
      currency: "nzd",
      email: CUSTOMER_EMAIL,
      shippingAddress: { address1: CUSTOMER_ADDRESS },
    },
    ...overrides,
  };
}

describe("checkout function", () => {
  const fetchMock = vi.fn();
  const request = { body: JSON.stringify({ publicToken: PUBLIC_TOKEN }) };
  let logs: () => string;

  beforeEach(() => {
    logs = captureLogs();
    setFunctionEnvironment();
    fetchMock.mockReset().mockResolvedValue(jsonResponse(paymentSession()));
    vi.stubGlobal("fetch", fetchMock);
    blinkpay.createQuickPayment.mockReset().mockResolvedValue({
      quickPaymentId: QUICK_PAYMENT_ID,
      redirectUri: GATEWAY_URL,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns the BlinkPay gateway URL", async () => {
    const response = await invoke(handler, request);

    expect(response).toEqual({
      statusCode: 200,
      body: { redirectUri: GATEWAY_URL },
    });
  });

  it("takes the amount from the Snipcart session", async () => {
    await invoke(handler, request);

    const [quickPayment] = blinkpay.createQuickPayment.mock.calls[0];
    expect(quickPayment.amount).toEqual({ currency: "NZD", total: "12.50" });
  });

  it("binds the quick payment to the Snipcart session", async () => {
    await invoke(handler, request);

    const [quickPayment, params] = blinkpay.createQuickPayment.mock.calls[0];
    expect(quickPayment.flow.detail.redirectUri).toBe(
      `https://demo.example/payments/payment-return?session=${SESSION_ID}`,
    );
    expect(quickPayment.pcr.reference).toBe(SESSION_ID.slice(0, 12));
    expect(params).toEqual({
      requestId: SESSION_ID,
      idempotencyKey: SESSION_ID,
    });
  });

  it("keeps every PCR field within 12 characters", async () => {
    await invoke(handler, request);

    const [quickPayment] = blinkpay.createQuickPayment.mock.calls[0];
    expect(quickPayment.pcr.particulars).toBe("My Cake Shop");
    for (const field of Object.values<string>(quickPayment.pcr)) {
      expect(field.length).toBeLessThanOrEqual(12);
    }
  });

  it("never sends the token to BlinkPay", async () => {
    await invoke(handler, request);

    expect(
      JSON.stringify(blinkpay.createQuickPayment.mock.calls),
    ).not.toContain(PUBLIC_TOKEN);
  });

  it("answers 400 when the token is missing or the body is not valid JSON", async () => {
    expect((await invoke(handler, { body: "{}" })).statusCode).toBe(400);
    expect(
      (await invoke(handler, { body: `{"publicToken":"${PUBLIC_TOKEN}"` }))
        .statusCode,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 500 with a generic message when Snipcart rejects the token", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe(
      "Unable to start the payment. Please try again.",
    );
    expect(blinkpay.createQuickPayment).not.toHaveBeenCalled();
  });

  it("answers 500 without logging the token when Snipcart can't be reached", async () => {
    fetchMock.mockRejectedValue(
      new Error(
        `request to payment-session?publicToken=${PUBLIC_TOKEN} failed`,
      ),
    );

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
    expect(logs()).not.toContain(PUBLIC_TOKEN);
  });

  it("answers 500 without logging the body when the Snipcart session is not valid JSON", async () => {
    // A parse error quotes the text around the fault, so customer details are put right there
    fetchMock.mockResolvedValue(new Response(CUSTOMER_EMAIL));

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
    expect(blinkpay.createQuickPayment).not.toHaveBeenCalled();
    expect(logs()).toContain(
      "Snipcart payment session response is not valid JSON",
    );
    expect(logs()).not.toContain(CUSTOMER_EMAIL.slice(0, 4));
  });

  it.each([
    ["no ID", { id: undefined }],
    ["an ID that is not a UUID", { id: "not-a-uuid" }],
    ["no invoice amount", { invoice: { currency: "nzd" } }],
    ["no currency", { invoice: { amount: 12.5 } }],
    [
      "a currency other than NZD",
      { invoice: { amount: 12.5, currency: "aud" } },
    ],
  ])("refuses a Snipcart session with %s", async (_case, overrides) => {
    fetchMock.mockResolvedValue(jsonResponse(paymentSession(overrides)));

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
    expect(blinkpay.createQuickPayment).not.toHaveBeenCalled();
  });

  it("refuses a Snipcart session that is JSON null", async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
    expect(logs()).toContain("Snipcart payment session has no valid ID");
    expect(blinkpay.createQuickPayment).not.toHaveBeenCalled();
  });

  it("answers 500 without exposing configuration when BlinkPay credentials are missing", async () => {
    vi.stubEnv("BLINKPAY_CLIENT_SECRET", "");

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
    expect(response.body.error).not.toContain("BLINKPAY");
    expect(logs()).toContain("BLINKPAY_CLIENT_SECRET");
  });

  it("answers 500 when BlinkPay fails to create the quick payment", async () => {
    blinkpay.createQuickPayment.mockRejectedValue(new Error("Unauthorised"));

    const response = await invoke(handler, request);

    expect(response.statusCode).toBe(500);
  });

  it("never logs the token or the customer's details", async () => {
    await invoke(handler, request);
    blinkpay.createQuickPayment.mockRejectedValue(new Error("Unauthorised"));
    await invoke(handler, request);

    const written = logs();
    expect(written).not.toContain(PUBLIC_TOKEN);
    expect(written).not.toContain(CUSTOMER_EMAIL);
    expect(written).not.toContain(CUSTOMER_ADDRESS);
  });
});
