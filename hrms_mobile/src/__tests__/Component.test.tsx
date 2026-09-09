import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text, View } from 'react-native';

const DummyComponent = () => (
  <View><Text>Test</Text></View>
);

describe('Component Tests', () => {
  it('renders DummyComponent', () => {
    render(<DummyComponent />);
    expect(screen.getByText('Test')).toBeTruthy();
  });
});
