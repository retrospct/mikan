import * as SecureStore from 'expo-secure-store'
import { setToken, clearToken } from '@nimi/contract/api/token-store'

const ACCESS_TOKEN_KEY = 'nimi_access_token'

/** Persist the access token to SecureStore and hydrate the API client. */
export async function persistToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token)
  setToken(token)
}

/** Load a previously persisted token (called at app startup). */
export async function restoreToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)
  if (token) setToken(token)
  return token
}

/** Clear the stored token (logout). */
export async function clearStoredToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY)
  clearToken()
}
