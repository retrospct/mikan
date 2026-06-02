import { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { buildCodeAsync, generateRandom } from 'expo-auth-session/build/PKCE'
import Constants from 'expo-constants'
import { persistToken } from '../../src/utils/auth'

WebBrowser.maybeCompleteAuthSession()

const LOGTO_ENDPOINT = process.env.EXPO_PUBLIC_LOGTO_ENDPOINT ?? ''
const LOGTO_APP_ID = process.env.EXPO_PUBLIC_LOGTO_APP_ID ?? ''

/**
 * Logto PKCE login via system browser (RFC 8252 + RFC 7636).
 * expo-auth-session v56: PKCE via buildCodeAsync() (verifier + S256 challenge).
 * System browser via expo-web-browser: credentials never touch the in-app WebView.
 * Same Logto app as desktop (scheme: nimi://).
 */
export default function LoginScreen() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redirectUri = makeRedirectUri({ scheme: 'nimi', path: 'callback' })

  async function handleLogin() {
    if (!LOGTO_ENDPOINT || !LOGTO_APP_ID) {
      setError('Logto is not configured (EXPO_PUBLIC_LOGTO_* missing)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { codeVerifier, codeChallenge } = await buildCodeAsync()
      const state = generateRandom(16)

      const authUrl =
        `${LOGTO_ENDPOINT}/oidc/auth?` +
        new URLSearchParams({
          client_id: LOGTO_APP_ID,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'openid offline_access profile email',
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          state
        }).toString()

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri)
      if (result.type !== 'success') return

      const params = new URLSearchParams(new URL(result.url).search)
      const code = params.get('code')
      if (!code) throw new Error('No code in callback')

      const tokenRes = await fetch(`${LOGTO_ENDPOINT}/oidc/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: LOGTO_APP_ID,
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
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
      <Text style={styles.title}>Nimi</Text>
      <Text style={styles.subtitle}>Your personal memory</Text>
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
