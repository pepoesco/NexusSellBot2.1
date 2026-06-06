import { describe, expect, it } from "vitest";
import { createPixPayload } from "../src/utils/pix.js";

describe("Pix static payload", () => {
  it("generates a BR Code payload with crc", () => {
    const payload = createPixPayload({
      key: "pix@example.com",
      receiverName: "Nexus Sell Bot",
      receiverCity: "Sao Paulo",
      amount: "29.90",
      txid: "ORDER123",
      description: "Pedido NexusSellBot"
    });

    expect(payload).toContain("BR.GOV.BCB.PIX");
    expect(payload).toContain("pix@example.com");
    expect(payload).toContain("540529.90");
    expect(payload).toMatch(/6304[A-F0-9]{4}$/);
  });
});
