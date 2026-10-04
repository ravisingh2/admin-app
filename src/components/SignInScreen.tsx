import md5 from 'crypto-js/md5';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAdminSession, getAuthenticatedUserId, isAuthenticated, loginApi, setAuthenticated, setAuthenticatedRoleId, setAuthenticatedUserId, setAuthenticatedUserName } from '@/services/api';
import { loginStyles as styles } from '@/styles/LoginStyles';

export default function SignInScreen({ reconnect = false }: { reconnect?: boolean }) {
  const [username, setUsername] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const handleLogin = async () => {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      Alert.alert('Missing details', 'Enter both your username and password.');
      return;
    }
    if (Platform.OS !== 'web' && !/^[a-f0-9]{64}$/.test(securityKey.trim())) {
      setLoginError('Enter the security key provided by your administrator.');
      return;
    }
    try {
      setLoading(true);
      setLoginError('');
      const response = await loginApi(cleanUsername, md5(password).toString());
      const isSuccessful = response.status === true ||
        (typeof response.status === 'string' && response.status.toLowerCase() === 'success');

      if (isSuccessful) {
        const user = response.data?.[0];
        const roleId = Number(
          user?.role_id ?? user?.roleid ?? user?.roleId ?? user?.user_role_id ?? user?.role ??
          (user?.id != null ? response.userRoleList?.[String(user.id)]?.[0] : undefined) ?? 0
        );
        if (reconnect && isAuthenticated() && Number(user?.id) !== getAuthenticatedUserId()) {
          throw new Error('Please use your signed-in account to reconnect products, or tap Logout to switch accounts.');
        }
        // Product access requires the portal session as well as API login.
        const portalUsernames = [...new Set([cleanUsername, user?.email, user?.username].filter((value): value is string => Boolean(value)))];
        let sessionReady = false;
        for (const portalUsername of portalUsernames) {
          try {
            await createAdminSession(portalUsername, password, roleId, securityKey);
            sessionReady = true;
            break;
          } catch { /* Try the account's alternate login identifier. */ }
        }
        if (!sessionReady) {
          throw new Error('Could not start your product session. Please try signing in again.');
        }
        setAuthenticatedRoleId(roleId);
        setAuthenticatedUserId(Number(user?.id || 0));
        const displayName = user?.first_name?.trim() || cleanUsername;
        setAuthenticatedUserName(displayName);
        await setAuthenticated(true);
        router.replace('/dashboard');
        return;
      }
      Alert.alert('Sign in failed', response.message || response.msg || 'Please check your details and try again.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Please check your connection.';
      setLoginError(message);
      if (Platform.OS !== 'web') Alert.alert('Could not sign in', message);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthenticated() && !reconnect) return <Redirect href="/dashboard" />;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
          <View style={styles.decorOne} /><View style={styles.decorTwo} />
          <View style={styles.brandBlock}>
            <View style={styles.logo}><Text style={styles.logoLeaf}>✦</Text><Text style={styles.logoBasket}>▰</Text></View>
            <Text style={styles.brand}>CRTUP</Text>
            <Text style={styles.tagline}>Fresh choices. Simple shopping.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>{reconnect ? 'Reconnect products' : 'Welcome back'}</Text>
            <Text style={styles.subtitle}>{reconnect ? 'Confirm your account to restore product access.' : 'Sign in to continue to your basket'}</Text>
            {!!loginError && <Text accessibilityRole="alert" style={{ color: '#B91C1C', marginBottom: 12 }}>{loginError}</Text>}
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} placeholder="Enter your username" placeholderTextColor="#94A3B8" value={username} onChangeText={setUsername} editable={!loading} autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput style={styles.passwordInput} placeholder="Enter your password" placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword} editable={!loading} secureTextEntry={!showPassword} onSubmitEditing={handleLogin} returnKeyType="go" />
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}><Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable>
            </View>
            {Platform.OS !== 'web' && <><Text style={styles.label}>Portal security key</Text><TextInput style={styles.input} value={securityKey} onChangeText={setSecurityKey} placeholder="Enter your portal security key" secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!loading} /></>}
            <Pressable onPress={handleLogin} disabled={loading} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, loading && styles.buttonDisabled]}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sign in</Text>}
            </Pressable>
            <View style={styles.secureRow}><Text style={styles.lock}>●</Text><Text style={styles.secureText}>Your account is securely protected</Text></View>
          </View>
          <Text style={styles.footer}>Quality products, delivered with care.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
