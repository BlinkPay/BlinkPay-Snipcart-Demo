import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "../netlify/functions/payment-method";
import { captureLogs, invoke, PUBLIC_TOKEN } from "./helpers";

describe("payment-method function", () => {
  const fetchMock = vi.fn();
  let logs: () => string;

  beforeEach(() => {
    logs = captureLogs();
    fetchMock.mockReset().mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns BlinkPay as a payment method once Snipcart validates the token", async () => {
    const response = await invoke(handler, {
      body: JSON.stringify({ publicToken: PUBLIC_TOKEN }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([
      {
        id: "blinkpay",
        name: "BlinkPay",
        checkoutUrl: "https://demo.example/payments/checkout",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://payment.snipcart.com/api/public/custom-payment-gateway/validate?publicToken=${PUBLIC_TOKEN}`,
    );
  });

  it("answers 401 when Snipcart rejects the token", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));

    const response = await invoke(handler, {
      body: JSON.stringify({ publicToken: PUBLIC_TOKEN }),
    });

    expect(response.statusCode).toBe(401);
  });

  it("answers 400 when the token is missing", async () => {
    const response = await invoke(handler, { body: "{}" });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers 400 without logging anything when the body is not valid JSON", async () => {
    // A parse error quotes the text around the fault, so the token is put right there
    const response = await invoke(handler, { body: PUBLIC_TOKEN });

    expect(response.statusCode).toBe(400);
    expect(logs()).toBe("[]");
  });

  it("answers 500 without logging the token when Snipcart can't be reached", async () => {
    fetchMock.mockRejectedValue(
      new Error(`request to validate?publicToken=${PUBLIC_TOKEN} failed`),
    );

    const response = await invoke(handler, {
      body: JSON.stringify({ publicToken: PUBLIC_TOKEN }),
    });

    expect(response.statusCode).toBe(500);
    expect(response.body.error).toBe("Internal Server Error");
    expect(logs()).not.toContain(PUBLIC_TOKEN);
  });

  it("never logs the token", async () => {
    await invoke(handler, {
      body: JSON.stringify({ publicToken: PUBLIC_TOKEN }),
    });
    fetchMock.mockResolvedValue(new Response("", { status: 401 }));
    await invoke(handler, {
      body: JSON.stringify({ publicToken: PUBLIC_TOKEN }),
    });

    expect(logs()).not.toContain(PUBLIC_TOKEN);
  });
});
