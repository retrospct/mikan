import { brand } from '@nimi/brand'
import { useState, type ReactElement } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { AuthRequest, makeRedirectUri, ResponseType } from 'expo-auth-session'
import Constants from 'expo-constants'
import { persistToken } from '../../src/utils/auth'

WebBrowser.maybeCompleteAuthSession()

const LOGTO_ENDPOINT = (process.env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? '').replace(/\/+$/, '')
const LOGTO_APP_ID = process.env.EXPO_PUBLIC_LOGTO_APP_ID ?? ''

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
        usePKCE: true
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

      const tokenRes = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: LOGTO_APP_ID,
          code,
          redirect_uri: redirectUri,
          code_verifier: request.codeVerifier
        }).toString()
      })
      const tokens = (await tokenRes.json()) as {
        access_token?: string
        error_description?: string
      }
      if (!tokenRes.ok) throw new Error(tokens.error_description ?? 'Token exchange failed')
      if (!tokens.access_token) throw new Error('No access_token in response')

      await persistToken(tokens.access_token)
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
