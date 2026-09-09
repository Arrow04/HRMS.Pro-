import React from 'react';
import { View } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import ChatScreen from '../screens/ChatScreen';

const mockView = View;

const mockUser = { fullName: 'Test User', email: 'test@example.com' };

jest.mock('../services/api', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const mockApi = require('../services/api');

jest.mock('../context/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    bg: '#ffffff',
    surface: '#ffffff',
    border: '#e5e7eb',
    borderLight: '#e5e7eb',
    text: '#111827',
    textSecondary: '#4b5563',
    textTertiary: '#6b7280',
  }, isDark: false }),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

jest.mock('../theme', () => ({
  radii: { full: 999, xl: 16, lg: 12 },
  spacing: { xxl: 32, lg: 24, md: 16, sm: 8 },
  shadows: { md: {}, sm: {}, colored: () => ({}) },
}));

jest.mock('../hooks/useThemedStyles', () => ({
  useThemedStyles: (factory) => factory({
    bg: '#ffffff',
    surface: '#ffffff',
    border: '#e5e7eb',
    borderLight: '#e5e7eb',
    text: '#111827',
    textSecondary: '#4b5563',
    textTertiary: '#6b7280',
  }, false),
}));

jest.mock('../hooks/useScrollTopBar', () => ({
  useScrollTopBar: () => ({ height: 0, scrollY: 0 }),
}));

jest.mock('../hooks/useKeyboardBottomInset', () => ({
  useKeyboardBottomInset: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children, style }) => require('react').createElement(mockView, { style }, children),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../components/AdminScreenKit', () => ({
  bannerShellStyle: () => ({}),
}));

jest.mock('../utils/timezone', () => ({
  getTimezone: () => 'UTC',
}));

const renderChatScreen = () => {
  return render(<ChatScreen />);
};

describe('ChatScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.get.mockResolvedValue({ data: { status: 'online' } });
    mockApi.post.mockResolvedValue({
      data: {
        response: 'Test response',
        conversation_id: 'conv-123',
        intent: 'leave_balance',
        confidence: 0.95,
        actionsTaken: ['leave_balance_check'],
        suggestions: ['Show leave history', 'Apply for leave'],
      },
    });
  });

  it('renders hero section with HR Assistant title', () => {
    renderChatScreen();
    expect(screen.getByText('HR Assistant')).toBeTruthy();
    expect(screen.getByText('Powered by HRMS.Pro AI')).toBeTruthy();
  });

  it('renders welcome card with user first name', () => {
    renderChatScreen();
    expect(screen.getByText('Hi Test!')).toBeTruthy();
  });

  it('renders quick suggestions grid', () => {
    renderChatScreen();
    expect(screen.getByText('Leave balance')).toBeTruthy();
    expect(screen.getByText('Next holiday')).toBeTruthy();
  });

  it('sends message and displays bot response with metadata', async () => {
    renderChatScreen();

    const input = screen.getByPlaceholderText('Ask about leave, payroll, holidays...');
    fireEvent.changeText(input, "What's my leave balance?");
    fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText("What's my leave balance?")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText('Test response')).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByText('Intent: leave_balance')).toBeTruthy();
      expect(screen.getByText('Confidence: 95%')).toBeTruthy();
      expect(screen.getByText('Actions: 1')).toBeTruthy();
    });
  });

  it('displays escalation badge when escalated', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: {
        response: 'Escalated to HR',
        conversation_id: 'conv-123',
        escalated: true,
        escalation_reason: 'Requires human approval',
      },
    });

    renderChatScreen();

    const input = screen.getByPlaceholderText('Ask about leave, payroll, holidays...');
    fireEvent.changeText(input, 'Escalate this');
    fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('Escalated: Requires human approval')).toBeTruthy();
    });
  });

  it('preserves conversation_id across messages', async () => {
    renderChatScreen();

    const input = screen.getByPlaceholderText('Ask about leave, payroll, holidays...');
    fireEvent.changeText(input, 'First message');
    fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({
        conversation_id: undefined,
      }));
    });

    mockApi.post.mockResolvedValueOnce({
      data: {
        response: 'Second response',
        conversation_id: 'conv-123',
      },
    });

    fireEvent.changeText(input, 'Second message');
    fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/ai/chat', expect.objectContaining({
        conversation_id: 'conv-123',
      }));
    });
  });

  it('loads health status on mount', () => {
    renderChatScreen();
    expect(mockApi.get).toHaveBeenCalledWith('/ai/health');
  });

  it('loads suggestions on mount', () => {
    mockApi.get.mockResolvedValueOnce({ data: { suggestions: [{ query: 'test', label: 'Test', icon: 'help', color: '#000' }] } });
    renderChatScreen();
    expect(mockApi.get).toHaveBeenCalledWith('/ai/suggestions');
  });

  it('shows error message when API fails', async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { data: { detail: 'Rate limited' } },
    });

    renderChatScreen();

    const input = screen.getByPlaceholderText('Ask about leave, payroll, holidays...');
    fireEvent.changeText(input, 'Test error');
    fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('Rate limited')).toBeTruthy();
    });
  });

  it('uses authenticated POST /ai/chat (not legacy /chatbot/message)', async () => {
    renderChatScreen();

    const input = screen.getByPlaceholderText('Ask about leave, payroll, holidays...');
    fireEvent.changeText(input, 'Test');
    fireEvent.press(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/ai/chat', expect.any(Object));
      expect(mockApi.post).not.toHaveBeenCalledWith('/chatbot/message', expect.any(Object));
    });
  });
});