export interface NativeCiGroup {
  id: string;
  platform: string;
  label: string;
  files: string[];
}
export const nativeCiGroups: NativeCiGroup[];
export function nativeCiGroup(env?: Record<string, string | undefined>): NativeCiGroup | undefined;
export function requireNativeProjectGroup(projectName: string, env?: Record<string, string | undefined>): NativeCiGroup | undefined;
export function nativeCiFiles(projectName: string, original: { include: string[] }, env?: Record<string, string | undefined>): { include: string[] };
