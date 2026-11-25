import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapPaymongoMethod, parsePaidEvent, verifyPaymongoSignature } from "./webhook";

const secret = "whsk_test_secret";
const now = 1_800_000_000_000;
const t = String(now / 1000);
const body = JSON.stringify({ hello: "world" });
const sign = (raw: string, ts = t, s = secret) =>
  createHmac("sha256", s).update(`${ts}.${raw}`).digest("hex");
const header = (sig: string, ts = t, field = "te") =>
  `t=${ts},${field}=${sig},${field === "te" ? "li" : "te"}=`;

describe("verifyPaymongoSignature", () => {
  it("accepts a correct test or live signature", () => {
    expect(
      verifyPaymongoSignature({ rawBody: body, header: header(sign(body)), secret, nowMs: now }),
    ).toBe(true);
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        header: header(sign(body), t, "li"),
        secret,
        nowMs: now,
      }),
    ).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(
      verifyPaymongoSignature({
        rawBody: body + " ",
        header: header(sign(body)),
        secret,
        nowMs: now,
      }),
    ).toBe(false);
  });
  it("rejects the wrong secret", () => {
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        header: header(sign(body, t, "other")),
        secret,
        nowMs: now,
      }),
    ).toBe(false);
  });
  it("rejects stale or future timestamps (replay protection)", () => {
    const old = String(now / 1000 - 3600);
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        header: header(sign(body, old), old),
        secret,
        nowMs: now,
      }),
    ).toBe(false);
    const future = String(now / 1000 + 3600);
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        header: header(sign(body, future), future),
        secret,
        nowMs: now,
      }),
    ).toBe(false);
  });
  it("rejects missing or malformed headers and empty secrets", () => {
    for (const h of [null, "", "garbage", "t=abc,te=x", `t=${t}`, `t=${t},te=,li=`]) {
      expect(
        verifyPaymongoSignature({ rawBody: body, header: h, secret, nowMs: now }),
        String(h),
      ).toBe(false);
    }
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        header: header(sign(body, t, "")),
        secret: "",
        nowMs: now,
      }),
    ).toBe(false);
  });
  it("does not accept an empty signature even if the expected value were empty", () => {
    expect(
      verifyPaymongoSignature({ rawBody: body, header: `t=${t},te=,li=`, secret, nowMs: now }),
    ).toBe(false);
  });
});

const paid = (overrides: Record<string, unknown> = {}) => ({
  data: {
    id: "evt_123",
    attributes: {
      type: "link.payment.paid",
      data: {
        id: "link_abc",
        attributes: {
          reference_number: "RV-1234",
          payments: [
            {
              data: {
                id: "pay_1",
                attributes: { amount: 245000, paid_at: 1_800_000_000, source: { type: "gcash" } },
              },
            },
          ],
        },
      },
      ...overrides,
    },
  },
});

describe("parsePaidEvent", () => {
  it("normalizes a paid-link event", () => {
    expect(parsePaidEvent(paid())).toEqual({
      eventId: "evt_123",
      eventType: "link.payment.paid",
      providerRef: "link_abc",
      method: "gcash",
      amountCentavos: 245000,
      reference: "RV-1234",
      paidAt: "2027-01-15T08:00:00.000Z",
    });
  });
  it("ignores other event types and malformed payloads", () => {
    const other = paid();
    other.data.attributes.type = "source.chargeable";
    expect(parsePaidEvent(other)).toBeNull();
    expect(parsePaidEvent({})).toBeNull();
    expect(parsePaidEvent(null)).toBeNull();
  });
  it("rejects non-positive or fractional amounts", () => {
    const bad = paid();
    bad.data.attributes.data.attributes.payments[0]!.data.attributes.amount = 0;
    expect(parsePaidEvent(bad)).toBeNull();
    bad.data.attributes.data.attributes.payments[0]!.data.attributes.amount = 10.5;
    expect(parsePaidEvent(bad)).toBeNull();
  });
});

describe("mapPaymongoMethod", () => {
  it("maps sources to our methods", () => {
    expect(mapPaymongoMethod("gcash")).toBe("gcash");
    expect(mapPaymongoMethod("paymaya")).toBe("maya");
    expect(mapPaymongoMethod("card")).toBe("card");
    expect(mapPaymongoMethod("dob")).toBe("bank");
  });
});
