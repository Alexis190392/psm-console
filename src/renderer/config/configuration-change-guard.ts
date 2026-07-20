export function hasConfigurationChangedExternally(originalContent: string, currentContent: string): boolean {
  return currentContent !== originalContent;
}

