import crypto from "node:crypto";
export type PasswordResetTenantProducts = {
  chainCoreEnabled: boolean | null | undefined;
  chiamoConnectEnabled: boolean | null | undefined;
};

export function passwordResetProduct(tenant: PasswordResetTenantProducts): "chiamo" | "chain" {
  return tenant.chiamoConnectEnabled === true && tenant.chainCoreEnabled !== true ? "chiamo" : "chain";
}

/**
 * Only the explicit Chain handoff token minted by Chain registration may alter
 * product entitlements. Ordinary Chiamo invitations and password-reset tokens
 * are opaque random values and can only update the credential password.
 */
export function isChainActivationReset(token: string): boolean {
  return /^chain-activation-[a-f0-9]{64}$/.test(token);
}

export function hashPasswordResetToken(token: string): string {
  return `sha256:${crypto.createHash("sha256").update(token, "utf8").digest("hex")}`;
}