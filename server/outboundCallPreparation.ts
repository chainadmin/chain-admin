import type { RequestHandler } from 'express';
import { parseDialString } from './phoneNumberUtils';
import { selectDialingNumber, type AreaCodeToStateResolver, type DialingNumber } from './localPresenceService';

export const PRIVATE_CALLER_ID_UNAVAILABLE_MESSAGE =
  'Withheld caller ID is not supported for outbound calls. Select a company phone number to continue only if you consent to display it.';
export const PRIVACY_LINE_UNAVAILABLE_MESSAGE =
  'The dedicated Privacy line is not configured or is no longer active.';

export class OutboundCallPreparationError extends Error {
  constructor(
    public readonly status: 400 | 409 | 422,
    public readonly code: 'INVALID_DIAL_STRING' | 'NO_ACTIVE_CALLER_ID' | 'PRIVATE_CALLER_ID_UNAVAILABLE' | 'PRIVACY_LINE_UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'OutboundCallPreparationError';
  }
}

export type OutboundCallUser = {
  id: string;
  tenantId: string;
  role?: string | null;
  voipAccess?: boolean | null;
  credentialId?: string | null;
};

export type OutboundCallPreparationDependencies = {
  getCurrentUser(req: Parameters<RequestHandler>[0]): Promise<OutboundCallUser | null | undefined>;
  getNumbers(tenantId: string): Promise<DialingNumber[]>;
  getPrivacyLine(tenantId: string): Promise<DialingNumber | null | undefined>;
  consumerBelongsToTenant(consumerId: string, tenantId: string): Promise<boolean>;
  accountBelongsToTenant(accountId: string, tenantId: string): Promise<boolean>;
  getAreaCodeToState(): Promise<AreaCodeToStateResolver>;
  createCallLog(values: {
    tenantId: string;
    consumerId: string | null;
    accountId: string | null;
    agentCredentialId: string | null;
    direction: 'outbound';
    fromNumber: string;
    toNumber: string;
    status: 'initiated';
    startedAt: Date;
  }): Promise<{ id: string }>;
  signSelectionToken(payload: {
    purpose: 'voice-call-selection';
    tenantId: string;
    callLogId: string;
    destination: string;
    callerId: string;
    callerIdMode: 'NUMBER' | 'PRIVACY';
    callerIdNumberId?: string;
  }): Promise<string>;
  logError?(message: string, error: unknown): void;
};

function privateModeRequested(value: unknown): boolean {
  return typeof value === 'string' && value.toUpperCase() === 'PRIVATE';
}

function preparationError(error: unknown): OutboundCallPreparationError {
  if (error instanceof OutboundCallPreparationError) return error;
  if (error instanceof Error && (
    error.message === 'Destination is required'
    || error.message === 'Destination must be a valid 10-digit North American phone number'
  )) {
    return new OutboundCallPreparationError(400, 'INVALID_DIAL_STRING', error.message);
  }
  if (error instanceof Error && error.message.startsWith('No active primary/default phone number')) {
    return new OutboundCallPreparationError(
      409,
      'NO_ACTIVE_CALLER_ID',
      'No active company caller ID is configured. Configure or select an active company phone number.',
    );
  }
  throw error;
}

/**
 * HTTP boundary for outbound call preparation. In particular, unsupported
 * private calls are stopped before a call log or signed selection is created.
 */
export function createOutboundCallPreparationHandler(
  dependencies: OutboundCallPreparationDependencies,
): RequestHandler {
  return async (req, res) => {
    try {
      const user = await dependencies.getCurrentUser(req);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });

      const isOwner = user.role === 'owner' || user.role === 'manager';
      if (!isOwner && !user.voipAccess) {
        return res.status(403).json({ message: 'VoIP access not enabled for this user' });
      }

      const {
        toNumber,
        consumerId,
        accountId,
        selectedNumberId: requestedNumberId,
        callerIdMode,
      } = req.body || {};
      if (typeof toNumber !== 'string' || !toNumber.trim()) {
        return res.status(400).json({
          code: 'INVALID_DIAL_STRING',
          message: 'Phone number to call is required',
        });
      }

      // Validate the destination without consulting inventory/provider state.
      // Validate before consulting inventory/provider state.
      try {
        parseDialString(toNumber);
      } catch (error) {
        throw preparationError(error);
      }
      const privacyRequested = privateModeRequested(callerIdMode);

      const allNumbers = await dependencies.getNumbers(user.tenantId);
      const privacyLine = privacyRequested ? await dependencies.getPrivacyLine(user.tenantId) : null;
      if (privacyRequested && (!privacyLine || privacyLine.tenantId !== user.tenantId
        || privacyLine.isActive !== true || String(privacyLine.status || '').toUpperCase() !== 'ACTIVE')) {
        throw new OutboundCallPreparationError(409, 'PRIVACY_LINE_UNAVAILABLE', PRIVACY_LINE_UNAVAILABLE_MESSAGE);
      }
      const selectedNumberId = privacyRequested ? privacyLine!.id
        : requestedNumberId
        || (callerIdMode === 'office'
          ? allNumbers.find(number => number.numberType === 'TOLL_FREE' && number.isActive)?.id
          : undefined);

      if (consumerId && !await dependencies.consumerBelongsToTenant(consumerId, user.tenantId)) {
        return res.status(400).json({ message: 'Consumer does not belong to this company' });
      }
      if (accountId && !await dependencies.accountBelongsToTenant(accountId, user.tenantId)) {
        return res.status(400).json({ message: 'Account does not belong to this company' });
      }

      const areaCodeToState = await dependencies.getAreaCodeToState();
      let decision;
      try {
        decision = selectDialingNumber({
          tenantId: user.tenantId,
          dialString: toNumber,
          numbers: allNumbers,
          selectedNumberId,
          // Only the dedicated Privacy workflow may supply this
          // server-authorized bypass. Never use a client requested number here.
          exactSelectedNumberId: privacyRequested ? privacyLine!.id : undefined,
          areaCodeToState,
        });
      } catch (error) {
        throw preparationError(error);
      }

      if (!privacyRequested && decision.selectionReason === 'PRIVATE_FALLBACK') {
        throw new OutboundCallPreparationError(
          422,
          'PRIVATE_CALLER_ID_UNAVAILABLE',
          PRIVATE_CALLER_ID_UNAVAILABLE_MESSAGE,
        );
      }

      const callLog = await dependencies.createCallLog({
        tenantId: user.tenantId,
        consumerId: consumerId || null,
        accountId: accountId || null,
        agentCredentialId: user.credentialId || null,
        direction: 'outbound',
        fromNumber: decision.selectedNumber.phoneNumber,
        toNumber: decision.destination,
        status: 'initiated',
        startedAt: new Date(),
      });
      const selectionToken = await dependencies.signSelectionToken({
        purpose: 'voice-call-selection',
        tenantId: user.tenantId,
        callLogId: callLog.id,
        destination: decision.destination,
        callerId: decision.selectedNumber.phoneNumber,
        callerIdMode: privacyRequested ? 'PRIVACY' : 'NUMBER',
        ...(privacyRequested ? { callerIdNumberId: decision.selectedNumber.id } : {}),
      });

      return res.json({
        callLogId: callLog.id,
        selectionToken,
        fromNumber: decision.selectedNumber.phoneNumber,
        actualFromNumber: decision.selectedNumber.phoneNumber,
        toNumber: decision.destination,
        status: 'initiated',
        localPresenceRequested: decision.localPresenceRequested,
        selectionReason: decision.selectionReason,
        isPrivate: privacyRequested,
        message: 'Call initiated. Use the Twilio Voice SDK to handle the call.',
      });
    } catch (error) {
      if (error instanceof OutboundCallPreparationError) {
        return res.status(error.status).json({ code: error.code, message: error.message });
      }
      dependencies.logError?.('Error initiating call', error);
      return res.status(500).json({ message: 'Failed to initiate call' });
    }
  };
}

export function isUnsupportedPrivateSelection(selection: {
  callerIdMode?: unknown;
  callerId?: unknown;
} | null | undefined): boolean {
  return (privateModeRequested(selection?.callerIdMode) && selection?.callerIdMode !== 'PRIVACY')
    || (typeof selection?.callerId === 'string' && selection.callerId.toLowerCase() === 'anonymous');
}

export function isValidPstnCallerId(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value);
}