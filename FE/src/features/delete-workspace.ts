/** True once the typed text is the workspace's name (spaces around it and letter case do not matter). */
export function deleteConfirmed(typed: string, name: string): boolean {
  return name.trim() !== '' && typed.trim().toLowerCase() === name.trim().toLowerCase();
}
