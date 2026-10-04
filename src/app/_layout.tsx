import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { restoreAuthentication, isAuthenticated, subscribeAuthentication, getAuthenticatedRoleId } from '@/services/api';

export default function RootLayout() {
  const authenticated = useSyncExternalStore(subscribeAuthentication, isAuthenticated, () => false);
  const roleId = useSyncExternalStore(subscribeAuthentication, getAuthenticatedRoleId, () => 0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const restore = async () => {
    setError(false);
    try { await restoreAuthentication(); setReady(true); }
    catch { setError(true); }
  };
  useEffect(() => { void restore(); }, []);
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    {error ? <><Text>Could not restore your saved session.</Text><Pressable onPress={restore}><Text>Try again</Text></Pressable></> : <ActivityIndicator />}
  </View>;
  return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
    <Stack.Protected guard={!authenticated}>
      <Stack.Screen name="index" />
    </Stack.Protected>
    <Stack.Protected guard={authenticated}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="home" />
      <Stack.Screen name="products" />
      <Stack.Screen name="orders" />
      <Stack.Screen name="order-details" />
      <Stack.Screen name="merchant-inventory" />
      <Stack.Screen name="edit-product" />
      <Stack.Screen name="explore" />
      <Stack.Screen name="reconnect-products" />
      <Stack.Protected guard={roleId === 1}>
        <Stack.Screen name="add-product" />
      </Stack.Protected>
    </Stack.Protected>
  </Stack></>;
}
