import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureLogs,
  GATEWAY_API_KEY,
  invoke,
  jsonResponse,
  OTHER_SESSION_ID,
  PAYMENT_ID,
  QUICK_PAYMENT_ID,
  RETURN_URL,
  SESSION_ID,
  setFunctionEnvironment,
} from "./helpers";

const blinkpay = vi.hoisted(() => ({
  getQuickPayment: vi.fn(),
  revokeQuickPayment: vi.fn(),
  // The SDK's await helpers revoke a quick payment that is not paid within their wait
  awaitSuccessfulQuickPayment: vi.fn(),
  awaitSuccessfulQuickPaymentOrThrowException: vi.fn(),
  awaitSuccessfulQuickPaymentAsync: vi.fn(),
}));

vi.mock("blink-debit-api-client-node", async (importOriginal) => ({
  ...(await importOriginal<typeof import("blink-debit-api-client-node")>()),
  BlinkDebitClient: vi.fn(function () {
    return blinkpay;
  }),
}));

import { handler } from "../netlify/functions/payment-return";

const SNIPCART_CONFIRM_URL =
  "https://payment.snipcart.com/api/private/custom-payment-gateway/payment";

function quickPayment(consentStatus: string, paymentStatus?: string) {
  return {
    quickPaymentId: QUICK_PAYMENT_ID,
    consent: {
      consentId: QUICK_PAYMENT_ID,
      status: consentStatus,
      detail: {
        type: "single",
        flow: {
          detail: {
            type: "gateway",
            redirectUri: `https://demo.example/payments/payment-return?session=${SESSION_ID}`,
          },
        },
        pcr: {
          particulars: "My Cake Shop",
          code: "BlinkPay",
          reference: SESSION_ID.slice(0, 12),
        },
        amount: { total: "12.50", currency: "NZD" },
      },
      payments: paymentStatus
        ? [{ paymentId: PAYMENT_ID, status: paymentStatus }]
        : [],
    },
  };
}

describe("payment-return function", () => {
  const fetchMock = vi.fn();
  const query = {
    queryStringParameters: { session: SESSION_ID, cid: QUICK_PAYMENT_ID },
  };
  let logs: () => string;

  function confirmation() {
    const [url, init] = fetchMock.mock.calls[0];
    return { url, headers: init.headers, body: JSON.parse(init.body) };
  }

  beforeEach(() => {
    logs = captureLogs();
    setFunctionEnvironment();
    fetchMock
      .mockReset()
      .mockResolvedValue(jsonResponse({ returnUrl: RETURN_URL }));
    vi.stubGlobal("fetch", fetchMock);
    Object.values(blinkpay).forEach((method) => method.mockReset());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("request validation", () => {
    it.each([
      ["no session", { cid: QUICK_PAYMENT_ID }],
      ["no cid", { session: SESSION_ID }],
      ["a session that is not a UUID", { session: "x", cid: QUICK_PAYMENT_ID }],
      ["a cid that is not a UUID", { session: SESSION_ID, cid: "../x" }],
    ])("answers 400 with %s", async (_case, queryStringParameters) => {
      const response = await invoke(handler, { queryStringParameters });

      expect(response.statusCode).toBe(400);
      expect(blinkpay.getQuickPayment).not.toHaveBeenCalled();
    });
  });

  describe("session binding", () => {
    it("refuses a paid quick payment that was created for another session", async () => {
      blinkpay.getQuickPayment.mockResolvedValue(
        quickPayment("Consumed", "AcceptedSettlementCompleted"),
      );

      const response = await invoke(handler, {
        queryStringParameters: {
          session: OTHER_SESSION_ID,
          cid: QUICK_PAYMENT_ID,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a quick payment whose redirect URI names a session that only shares the reference", async () => {
      blinkpay.getQuickPayment.mockResolvedValue(
        quickPayment("Consumed", "AcceptedSettlementCompleted"),
      );

      const response = await invoke(handler, {
        queryStringParameters: {
          session: `${SESSION_ID.slice(0, 12)}3-4333-8444-555555555555`,
          cid: QUICK_PAYMENT_ID,
        },
      });

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
      ["no redirect URI", undefined],
      ["a redirect URI without a session", "https://demo.example/return"],
      ["a redirect URI that is not a URL", "not a url"],
    ])("refuses a quick payment that has %s", async (_case, redirectUri) => {
      const unbound = quickPayment("Consumed", "AcceptedSettlementCompleted");
      Object.assign(unbound.consent.detail.flow.detail, { redirectUri });
      blinkpay.getQuickPayment.mockResolvedValue(unbound);

      const response = await invoke(handler, query);

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses a quick payment that has no reference", async () => {
      const unreferenced = quickPayment(
        "Consumed",
        "AcceptedSettlementCompleted",
      );
      unreferenced.consent.detail.pcr.reference = "";
      blinkpay.getQuickPayment.mockResolvedValue(unreferenced);

      const response = await invoke(handler, query);

      expect(response.statusCode).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("pending payments", () => {
    it.each([
      ["GatewayAwaitingSubmission", undefined],
      ["AwaitingAuthorisation", undefined],
      ["Authorised", undefined],
      ["Authorised", "Pending"],
      ["Consumed", "AcceptedSettlementInProcess"],
    ])(
      "reports consent %s with payment %s as pending without telling Snipcart",
      async (consentStatus, paymentStatus) => {
        blinkpay.getQuickPayment.mockResolvedValue(
          quickPayment(consentStatus, paymentStatus),
        );

        const response = await invoke(handler, query);

        expect(response).toEqual({
          statusCode: 200,
          body: { status: "pending" },
        });
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  describe("paid payments", () => {
    beforeEach(() => {
      blinkpay.getQuickPayment.mockResolvedValue(
        quickPayment("Consumed", "AcceptedSettlementCompleted"),
      );
    });

    it("confirms the payment with Snipcart as processed", async () => {
      const response = await invoke(handler, query);

      expect(response).toEqual({
        statusCode: 200,
        body: { status: "paid", returnUrl: RETURN_URL },
      });
      expect(confirmation()).toEqual({
        url: SNIPCART_CONFIRM_URL,
        headers: {
          Authorization: `Bearer ${GATEWAY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: {
          paymentSessionId: SESSION_ID,
          state: "processed",
          transactionId: PAYMENT_ID,
        },
      });
    });

    it("answers 502 with the payment reference when Snipcart can't be updated", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 500 }));

      const response = await invoke(handler, query);

      expect(response.statusCode).toBe(502);
      expect(response.body.error).toContain(SESSION_ID.slice(0, 12));
    });

    it.each([
      ["no returnUrl", {}],
      ["JSON null", null],
      ["a returnUrl that is not a string", { returnUrl: 42 }],
      ["a returnUrl that is not HTTPS", { returnUrl: "javascript:alert(1)" }],
    ])("answers 502 when Snipcart returns %s", async (_case, body) => {
      fetchMock.mockResolvedValue(jsonResponse(body));

      const response = await invoke(handler, query);

      expect(response.statusCode).toBe(502);
      expect(logs()).toContain(
        "Snipcart payment confirmation returned no usable returnUrl",
      );
      expect(response.body.returnUrl).toBeUndefined();
    });

    it("answers 502 without logging the reply when Snipcart's confirmation is not valid JSON", async () => {
      // A parse error quotes the text around the fault
      fetchMock.mockResolvedValue(new Response("<html>Bad Gateway</html>"));

      const response = await invoke(handler, query);

      expect(response.statusCode).toBe(502);
      expect(logs()).toContain(
        "Snipcart payment confirmation response is not valid JSON",
      );
      expect(logs()).not.toContain("Bad Gateway");
    });
  });

  describe("failed payments", () => {
    it.each([
      ["Rejected", "Rejected"],
      ["Consumed", "Rejected"],
      ["Rejected", undefined],
      ["Revoked", undefined],
      ["GatewayTimeout", undefined],
    ])(
      "confirms consent %s with payment %s with Snipcart as failed, with a message",
      async (consentStatus, paymentStatus) => {
        blinkpay.getQuickPayment.mockResolvedValue(
          quickPayment(consentStatus, paymentStatus),
        );

        const response = await invoke(handler, query);

        expect(response).toEqual({
          statusCode: 200,
          body: { status: "failed", returnUrl: RETURN_URL },
        });
        expect(confirmation().body).toEqual({
          paymentSessionId: SESSION_ID,
          state: "failed",
          // The quick payment ID stands in only when BlinkPay holds no payment
          transactionId: paymentStatus ? PAYMENT_ID : QUICK_PAYMENT_ID,
          error: { code: "payment_failed", message: expect.any(String) },
        });
      },
    );
  });

  it("answers 502 without telling Snipcart when BlinkPay can't be read", async () => {
    blinkpay.getQuickPayment.mockRejectedValue(
      new Error("Service unavailable"),
    );

    const response = await invoke(handler, query);

    expect(response.statusCode).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only reads the quick payment, never revoking or awaiting it, whatever its state", async () => {
    for (const [consentStatus, paymentStatus] of [
      ["AwaitingAuthorisation", undefined],
      ["Consumed", "AcceptedSettlementCompleted"],
      ["Rejected", "Rejected"],
    ] as const) {
      blinkpay.getQuickPayment.mockResolvedValue(
        quickPayment(consentStatus, paymentStatus),
      );
      await invoke(handler, query);
    }

    const { getQuickPayment, ...otherMethods } = blinkpay;
    expect(getQuickPayment).toHaveBeenCalledTimes(3);
    for (const method of Object.values(otherMethods)) {
      expect(method).not.toHaveBeenCalled();
    }
  });

  it("never logs the gateway secret key", async () => {
    blinkpay.getQuickPayment.mockResolvedValue(
      quickPayment("Consumed", "AcceptedSettlementCompleted"),
    );
    await invoke(handler, query);
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));
    await invoke(handler, query);
    // HTTP client errors can carry the request, and with it the Authorization header
    fetchMock.mockRejectedValue(
      Object.assign(new Error("fetch failed"), {
        request: { headers: { Authorization: `Bearer ${GATEWAY_API_KEY}` } },
      }),
    );
    const response = await invoke(handler, query);

    expect(response.statusCode).toBe(502);
    expect(logs()).not.toContain(GATEWAY_API_KEY);
  });
});
