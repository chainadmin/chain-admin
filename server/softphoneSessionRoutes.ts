import type { Express, RequestHandler } from "express";
import { authenticateUser } from "./authMiddleware";
import { storage } from "./storage";
import { canUseSoftphone } from "./voiceCallAccess";

type Dependencies = {
  authenticate?: RequestHandler;
  getCredential?: typeof storage.getAgencyCredentialsById;
};

/** Validate a browser session without provisioning resources or registering a phone.
 * Register before the provider-entitlement gate. This endpoint cannot issue Voice
 * tokens; /api/voip/token still checks account, billing and provider readiness.
 */
export function registerSoftphoneSessionRoutes(app: Express, dependencies: Dependencies = {}) {
  app.get("/api/voip/session", dependencies.authenticate || authenticateUser, async (req: any, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const actor = req.user;
      if (!actor?.id || !actor.tenantId || !["chiamo", "chain"].includes(actor.product)) {
        return res.status(401).json({ message: "Please sign in again." });
      }
      if (actor.passwordChangeOnly === true) {
        return res.status(403).json({ code: "PASSWORD_CHANGE_REQUIRED", message: "Change your temporary password to continue." });
      }
      const member = await (dependencies.getCredential || storage.getAgencyCredentialsById.bind(storage))(actor.id);
      if (!member || member.tenantId !== actor.tenantId || member.isActive !== true) {
        return res.status(401).json({ message: "Your phone session is no longer active. Please sign in again." });
      }
      if (member.mustChangePassword) {
        return res.status(403).json({ code: "PASSWORD_CHANGE_REQUIRED", message: "Change your temporary password to continue." });
      }
      if (!actor.isImpersonation && member.credentialVersion !== actor.credentialVersion) {
        return res.status(401).json({ message: "Your phone session has changed. Please sign in again." });
      }
      // Persisted identity, not a browser's cached user or token role, is authoritative.
      const user = {
        id: member.id,
        username: member.username,
        firstName: member.firstName,
        lastName: member.lastName,
        name: [member.firstName, member.lastName].filter(Boolean).join(" ") || member.username,
        role: member.role,
        tenantId: member.tenantId,
        voipAccess: member.voipAccess === true,
        product: actor.product,
        restrictedServices: member.restrictedServices || [],
      };
      return res.json({ user, product: actor.product, callingAllowed: canUseSoftphone(member) });
    } catch {
      return res.status(503).json({ message: "Unable to verify your phone session. Please try again." });
    }
  });
}