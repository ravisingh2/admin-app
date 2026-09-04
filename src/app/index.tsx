import md5 from 'crypto-js/md5';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createAdminSession, loginApi } from '@/services/api';
import { loginStyles as styles } from '@/styles/LoginStyles';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      Alert.alert('Missing details', 'Enter both your username and password.');
      return;
    }
    try {
      setLoading(true);
      const response = await loginApi(cleanUsername, md5(password).toString());
      const isSuccessful = response.status === true ||
        (typeof response.status === 'string' && response.status.toLowerCase() === 'success');

      if (isSuccessful) {
        const user = response.data?.[0];
        await createAdminSession(user?.email || user?.username || cleanUsername, password);
        const displayName = user?.first_name || cleanUsername;
        router.replace({ pathname: '/dashboard', params: { name: displayName } });
        return;
      }
      Alert.alert('Sign in failed', response.message || response.msg || 'Please check your details and try again.');
    } catch (error) {
      Alert.alert('Could not sign in', error instanceof Error ? error.message : 'Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.decorOne} /><View style={styles.decorTwo} />
          <View style={styles.brandBlock}>
            <View style={styles.logo}><Text style={styles.logoLeaf}>✦</Text><Text style={styles.logoBasket}>▰</Text></View>
            <Text style={styles.brand}>AccraBasket</Text>
            <Text style={styles.tagline}>Fresh choices. Simple shopping.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to continue to your basket</Text>
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} placeholder="Enter your username" placeholderTextColor="#94A3B8" value={username} onChangeText={setUsername} editable={!loading} autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput style={styles.passwordInput} placeholder="Enter your password" placeholderTextColor="#94A3B8" value={password} onChangeText={setPassword} editable={!loading} secureTextEntry={!showPassword} onSubmitEditing={handleLogin} returnKeyType="go" />
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={10}><Text style={styles.showText}>{showPassword ? 'Hide' : 'Show'}</Text></Pressable>
            </View>
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
