import { render } from '@testing-library/react-native';
import React from 'react';
import { View, Text } from 'react-native';

const DummyComponent = () => (
  <View><Text>Test</Text></View>
);

describe('Component Tests', () => {
  it('renders DummyComponent', () => {
    render(<DummyComponent />);
    expect(require('@testing-library/react-native').screen.getByText('Test')).toBeTruthy();
  });
});
