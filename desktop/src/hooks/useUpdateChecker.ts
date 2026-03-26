/**
 * Update checker disabled — MemberBerries doesn't publish releases yet.
 * Returns static state with no network calls.
 */
export function useUpdateChecker() {
  return {
    currentVersion: '0.2.0',
    latestVersion: null as string | null,
    latestUrl: null as string | null,
    updateAvailable: false,
  }
}
