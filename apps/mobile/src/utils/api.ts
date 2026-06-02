import Constants from 'expo-constants'
import { configureClient } from '@nimi/contract/api/runtime'

/**
 * t3-turbo pattern: the app layer injects its base URL into the shared client.
 * Mobile uses EXPO_PUBLIC_NEEME_API_URL; falls back to the LAN dev address
 * (getBaseUrl) so Expo Go on device can reach a local `neeme serve`.
 *
 * Call this once, at app startup (before any API calls), from _layout.tsx.
 */

function getBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_NEEME_API_URL) {
    return process.env.EXPO_PUBLIC_NEEME_API_URL
  }
  if (!__DEV__) {
    throw new Error('EXPO_PUBLIC_NEEME_API_URL must be set for production mobile builds')
  }
  // In Expo Go on a physical device, localhost won't reach the dev machine.
  // Use the LAN IP from expo-constants when available (mirrors t3-turbo's getBaseUrl()).
  const debuggerHost = Constants.expoConfig?.hostUri
  if (debuggerHost) {
    const host = debuggerHost.split(':').shift() ?? 'localhost'
    return `http://${host}:8000`
  }
  return 'http://localhost:8000'
}

export function initApiClient(): void {
  configureClient({
    baseUrl: getBaseUrl()
  })
}
