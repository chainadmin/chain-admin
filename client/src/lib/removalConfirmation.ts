export function normalizedRemovalTargetName(value: string): string {
  return value.trim();
}

export function matchesRemovalTargetName(typedName: string, targetName: string): boolean {
  const normalizedTarget = normalizedRemovalTargetName(targetName);
  return normalizedTarget.length > 0 && typedName.trim() === normalizedTarget;
}