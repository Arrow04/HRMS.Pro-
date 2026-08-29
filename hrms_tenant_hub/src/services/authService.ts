import api from './api';

export async function login(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password });
  return res.data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
