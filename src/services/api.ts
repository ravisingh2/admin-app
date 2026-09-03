const API_URL = 'https://crtup.in/api';

export async function loginApi(
  username: string,
  password: string
) {
  const url =
    `${API_URL}/usercontroller/loginuser` +
    `?username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}`;

  console.log('LOGIN API:', url);

  const response = await fetch(url, {
    method: 'GET',
  });

  const text = await response.text();

  console.log('LOGIN RESPONSE:', text);

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid API response');
  }
}