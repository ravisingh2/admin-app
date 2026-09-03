import { StyleSheet } from 'react-native';

export const loginStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fb',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  loginBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    padding: 25,
    borderRadius: 16,
    elevation: 5,
  },

  title: {
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 30,
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 15,
    backgroundColor: '#fafafa',
  },

  otpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },

  otpInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: '#dddddd',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },

  otpButton: {
    height: 52,
    marginLeft: 10,
    paddingHorizontal: 15,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },

  otpButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  button: {
    height: 52,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },

  forgot: {
    color: '#2563eb',
    textAlign: 'right',
    marginBottom: 15,
    fontSize: 14,
  },

  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
  },

  signupText: {
    color: '#666666',
  },

  signupLink: {
    color: '#2563eb',
    fontWeight: '600',
  },
});