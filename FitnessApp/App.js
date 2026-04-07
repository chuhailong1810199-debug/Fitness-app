import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Text } from 'react-native';

import HomeScreen from './src/screens/HomeScreen';
import PlansScreen from './src/screens/PlansScreen';
import WorkoutScreen from './src/screens/WorkoutScreen';
import TimerScreen from './src/screens/TimerScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import { COLORS } from './src/theme/colors';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ name, focused }) {
  const icons = {
    Home: '🏠',
    Plans: '📋',
    Workout: '⚡',
    Timer: '⏱',
    Progress: '📈',
  };
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>
      {icons[name]}
    </Text>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarLabel: ({ focused }) => (
          <Text style={{
            fontSize: 10,
            color: focused ? COLORS.accent : COLORS.muted,
            marginBottom: 4,
          }}>
            {route.name === 'Home' ? 'Trang chủ'
              : route.name === 'Plans' ? 'Kế hoạch'
              : route.name === 'Workout' ? 'Tập luyện'
              : route.name === 'Timer' ? 'Hẹn giờ'
              : 'Tiến độ'}
          </Text>
        ),
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 0.5,
          height: 64,
          paddingTop: 8,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Plans" component={PlansScreen} />
      <Tab.Screen name="Workout" component={WorkoutScreen} />
      <Tab.Screen name="Timer" component={TimerScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="MainTabs" component={MainTabs} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
