import type { HandlerContext, HandlerEvent } from "@netlify/functions";
import { vi } from "vitest";

export const PUBLIC_TOKEN = "snipcart-public-token-123";
export const CUSTOMER_EMAIL = "jane@example.com";
export const CUSTOMER_ADDRESS = "1 Queen Street";
export const SESSION_ID = "5e921d3b-8756-4fd0-87e9-c72f946535ed";
export const OTHER_SESSION_ID = "11111111-2222-4333-8444-555555555555";
export const QUICK_PAYMENT_ID = "3a3b7f7d-f8e6-4c3e-b2a1-5f9c8d7e6a5b";
export const GATEWAY_API_KEY = "snipcart-gateway-secret";
export const RETURN_URL = "https://shop.example/#/order/1";

type TestHandler = (
  event: HandlerEvent,
  context: HandlerContext,
) => Promise<unknown> | void;

/** Calls a function handler the way Netlify does and parses its JSON body. */
export async function invoke(
  handler: TestHandler,
  event: Partial<HandlerEvent> = {},
): Promise<{ statusCode: number; body: any }> {
  const response = (await handler(
    {
      headers: { host: "demo.example" },
      queryStringParameters: {},
      body: null,
      ...event,
    } as HandlerEvent,
    {} as HandlerContext,
  )) as { statusCode: number; body: string };
  return {
    statusCode: response.statusCode,
    body: JSON.parse(response.body),
  };
}

export function setFunctionEnvironment() {
  vi.stubEnv("BLINKPAY_DEBIT_URL", "https://sandbox.debit.blinkpay.co.nz");
  vi.stubEnv("BLINKPAY_CLIENT_ID", "client-id");
  vi.stubEnv("BLINKPAY_CLIENT_SECRET", "client-secret");
  vi.stubEnv("SNIPCART_GATEWAY_API_KEY", GATEWAY_API_KEY);
  vi.stubEnv("PUBLIC_BUSINESS_NAME", "My Cake Shop Ltd");
}

/** Captures everything the code under test writes to the console. */
export function captureLogs(): () => string {
  const spies = (["log", "info", "warn", "error", "debug"] as const).map(
    (level) => vi.spyOn(console, level).mockImplementation(() => {}),
  );
  return () => JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
