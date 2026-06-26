import { brand } from '@mikan/brand'
import { useState, type ReactElement } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { AuthRequest, makeRedirectUri, ResponseType } from 'expo-auth-session'
import Constants from 'expo-constants'
import { persistToken } from '../../src/utils/auth'
import { bootstrapDb } from '../../src/db/bootstrap'

WebBrowser.maybeCompleteAuthSession()

const LOGTO_ENDPOINT = (process.env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? '').replace(/\/+$/, '')
const LOGTO_APP_ID = process.env.EXPO_PUBLIC_LOGTO_APP_ID ?? ''
// API resource indicator (RFC 8707). Without it Logto issues an opaque token;
// the broker JWKS-verifies a JWT with aud=<resource>, so it must be requested.
// Mirrors the desktop's MAIN_VITE_LOGTO_RESOURCE (e.g. https://api.getmikan.com).
const LOGTO_RESOURCE = process.env.EXPO_PUBLIC_LOGTO_RESOURCE || undefined

/**
 * Logto PKCE login via system browser (RFC 8252 + RFC 7636).
 * expo-auth-session generates the verifier/challenge and state for us.
 * System browser via expo-web-browser: credentials never touch the in-app WebView.
 * Redirect scheme is the Mikan brand: mikan://callback (registered in Logto).
 */
export default function LoginScreen(): ReactElement {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectUri = makeRedirectUri({ scheme: 'mikan', path: 'callback' })

  async function handleLogin(): Promise<void> {
    if (!LOGTO_ENDPOINT || !LOGTO_APP_ID) {
      setError('Logto is not configured (EXPO_PUBLIC_LOGTO_* missing)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const request = new AuthRequest({
        clientId: LOGTO_APP_ID,
        redirectUri,
        responseType: ResponseType.Code,
        scopes: ['openid', 'profile', 'email'],
        usePKCE: true,
        extraParams: LOGTO_RESOURCE ? { resource: LOGTO_RESOURCE } : undefined
      })
      const authUrl = await request.makeAuthUrlAsync({
        authorizationEndpoint: `${LOGTO_ENDPOINT}/oidc/auth`
      })

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri)
      if (result.type !== 'success') return

      const params = new URLSearchParams(new URL(result.url).search)
      if (params.get('state') !== request.state) throw new Error('Invalid auth state')
      const code = params.get('code')
      if (!code) throw new Error('No code in callback')
      if (!request.codeVerifier) throw new Error('Missing PKCE code verifier')

      const tokenBody = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: LOGTO_APP_ID,
        code,
        redirect_uri: redirectUri,
        code_verifier: request.codeVerifier
      })
      // Scope the access token to the broker's API resource so it's a verifiable JWT.
      if (LOGTO_RESOURCE) tokenBody.set('resource', LOGTO_RESOURCE)

      const tokenRes = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenBody.toString()
      })
      const tokens = (await tokenRes.json()) as {
        access_token?: string
        error_description?: string
      }
      if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'Token exchange failed')
      if (!tokens.access_token) throw new Error('No access_token in response')

      await persistToken(tokens.access_token)
      // Open the per-user Turso replica before navigating so the feed has data
      // immediately (no app restart). Non-fatal: feed degrades to empty on error.
      try {
        await bootstrapDb(tokens.access_token)
      } catch (e) {
        console.warn('[nimi/db] post-login bootstrap failed:', e)
        setError(e instanceof Error ? `Signed in, but sync failed: ${e.message}` : 'Sync failed')
      }
      router.replace('/(tabs)/feed')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const configured = !!(LOGTO_ENDPOINT && LOGTO_APP_ID)

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{brand.productName}</Text>
      <Text style={styles.subtitle}>{brand.tagline}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (!configured || loading) && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={!configured || loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{configured ? 'Sign in' : 'Auth not configured'}</Text>
        )}
      </Pressable>
      {Constants.expoConfig?.version ? (
        <Text style={styles.version}>v{Constants.expoConfig.version}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { fontSize: 36, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 8 },
  error: { color: '#c0392b', fontSize: 14, textAlign: 'center' },
  button: {
    backgroundColor: '#18181b',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    minWidth: 200,
    alignItems: 'center'
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  version: { position: 'absolute', bottom: 24, color: '#aaa', fontSize: 12 }
})
