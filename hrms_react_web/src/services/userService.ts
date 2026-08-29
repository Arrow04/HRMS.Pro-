import type { User } from '../types';
import api from './api';

export interface UserPayload {
  fullName: string;
  email: string;
  password?: string;
  role: string;
}

export const getUsers = async (): Promise<User[]> => {
  const response = await api.get<User[]>('/settings/users');
  return response.data;
};

export const createUser = async (payload: UserPayload): Promise<User> => {
  const response = await api.post<User>('/settings/users', payload);
  return response.data;
};

export const updateUser = async (id: number, payload: Partial<UserPayload>): Promise<User> => {
  const response = await api.put<User>(`/settings/users/${id}`, payload);
  return response.data;
};

export const deleteUser = async (id: number): Promise<void> => {
  const response = await api.delete<void>(`/settings/users/${id}`);
  return response.data;
};
