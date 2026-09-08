export type ChiamoConfirmedNumberPurchase = Readonly<{
  phoneNumber: string;
  numberType: "local" | "toll_free";
  idempotencyKey: string;
  confirmed: true;
}>;

export function confirmedNumberPurchase(
  phoneNumber: string,
  numberType: "local" | "toll_free",
  idempotencyKey: string,
): ChiamoConfirmedNumberPurchase {
  return Object.freeze({ phoneNumber, numberType, idempotencyKey, confirmed: true as const });
}

/** A pending retry is always the immutable operation the owner confirmed. */
export function retryPendingNumberPurchase(operation: ChiamoConfirmedNumberPurchase) {
  return operation;
}