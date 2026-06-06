import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyMercadoPagoSignature } from "../src/payments/providers/mercadopago.js";

describe("Mercado Pago signature verification", () => {
  it("accepts a valid x-signature header", () => {
    const secret = "secret";
    const template = "id:123;request-id:req-1;ts:1700000000;";
    const v1 = crypto.createHmac("sha256", secret).update(template).digest("hex");

    expect(
      verifyMercadoPagoSignature({
        secret,
        signatureHeader: `ts=1700000000,v1=${v1}`,
        requestId: "req-1",
        dataId: "123"
      })
    ).toBe(true);
  });
});
