export type PrivacyLineNumber = {
  id: string;
  phoneNumber: string;
  friendlyName?: string | null;
};

export type PrivacyGreeting = {
  enabled?: boolean;
  type?: "TEXT" | "AUDIO" | null;
  text?: string | null;
  audioUrl?: string | null;
};

export type PrivacyLineResponse = {
  phoneNumberId?: string | null;
  selectedPhoneNumber?: PrivacyLineNumber | null;
  selectedNumber?: PrivacyLineNumber | null;
  privacyLine?: PrivacyLineNumber | null;
  phoneNumber?: PrivacyLineNumber | null;
  activeOwnedPhoneNumbers?: PrivacyLineNumber[];
  availablePhoneNumbers?: PrivacyLineNumber[];
  availableNumbers?: PrivacyLineNumber[];
  choices?: PrivacyLineNumber[];
  greeting?: PrivacyGreeting | null;
  privacyGreeting?: PrivacyGreeting | null;
  greetingEnabled?: boolean;
  greetingType?: "TEXT" | "AUDIO" | null;
  greetingText?: string | null;
};

export function privacyLineNumber(value?: PrivacyLineResponse | null): PrivacyLineNumber | null {
  return value?.selectedPhoneNumber || value?.selectedNumber || value?.privacyLine || value?.phoneNumber || null;
}

export function privacyLineChoices(value?: PrivacyLineResponse | null): PrivacyLineNumber[] {
  return value?.activeOwnedPhoneNumbers || value?.availablePhoneNumbers || value?.availableNumbers || value?.choices || [];
}

export function privacyGreeting(value?: PrivacyLineResponse | null): PrivacyGreeting {
  return value?.privacyGreeting || value?.greeting || {
    enabled: value?.greetingEnabled,
    type: value?.greetingType,
    text: value?.greetingText,
  };
}

export function privacyLinePayload(
  phoneNumberId: string | null,
  greeting: PrivacyGreeting,
): Record<string, unknown> {
  return {
    phoneNumberId,
    greetingType: greeting.enabled ? (greeting.type || "TEXT") : null,
    greetingText: greeting.enabled && greeting.type !== "AUDIO" ? (greeting.text || null) : null,
    greetingAudioUrl: greeting.enabled && greeting.type === "AUDIO" ? (greeting.audioUrl || null) : null,
  };
}