import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import md5 from 'crypto-js/md5';

import { loginApi } from '../services/api';
import { loginStyles } from '../styles/LoginStyles';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter username');
      return;
    }

    if (!password) {
      Alert.alert('Error', 'Please enter password');
      return;
    }

    try {
      setLoading(true);
      const md5Password = md5(password).toString();

      console.log('Username:', username.trim());
      console.log('MD5 Password:', md5Password);
      const response = await loginApi(
        username.trim(),
        md5Password
      );

      console.log('LOGIN RESPONSE:', response);

      if (response?.status === 'success') {
        Alert.alert('Success', 'Login successful', [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/home');
            },
          },
        ]);
      } else {
        Alert.alert(
          'Login Failed',
          response?.message ||
            response?.msg ||
            'Invalid credentials'
        );
      }
    } catch (error: any) {
      console.log('LOGIN ERROR:', error);

      Alert.alert(
        'Error',
        error?.message || 'Unable to connect to server'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={loginStyles.container}>
      <View style={loginStyles.loginBox}>

        <Text style={loginStyles.title}>
          AccraBasket
        </Text>

        <Text style={loginStyles.subtitle}>
          Sign in to start your session
        </Text>

        <TextInput
          style={loginStyles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={loginStyles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={loginStyles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          <Text style={loginStyles.buttonText}>
            {loading ? 'Please wait...' : 'Sign In'}
          </Text>
        </TouchableOpacity>

      </View>
    </View>
  );
}