type PixPayloadInput = {
  key: string;
  receiverName: string;
  receiverCity: string;
  amount?: string;
  txid: string;
  description?: string;
};

function field(id: string, value: string): string {
  const length = value.length.toString().padStart(2, "0");
  return `${id}${length}${value}`;
}

function normalizeText(value: string, maxLength: number): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase()
    .slice(0, maxLength);
}

function crc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let index = 0; index < payload.length; index += 1) {
    crc ^= payload.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function createPixPayload(input: PixPayloadInput): string {
  const merchantAccountInfo = [
    field("00", "BR.GOV.BCB.PIX"),
    field("01", input.key),
    input.description ? field("02", normalizeText(input.description, 72)) : ""
  ].join("");

  const txid = normalizeText(input.txid, 25) || "***";
  const payloadWithoutCrc = [
    field("00", "01"),
    field("01", "12"),
    field("26", merchantAccountInfo),
    field("52", "0000"),
    field("53", "986"),
    input.amount ? field("54", input.amount) : "",
    field("58", "BR"),
    field("59", normalizeText(input.receiverName, 25)),
    field("60", normalizeText(input.receiverCity, 15)),
    field("62", field("05", txid)),
    "6304"
  ].join("");

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}
