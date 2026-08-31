const SIGN_DOCUMENT_PATH = /^\/sign\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getSafeConsumerReturnPath(value: string | null | undefined): string | null {
  if (!value || !SIGN_DOCUMENT_PATH.test(value)) {
    return null;
  }

  return value;
}