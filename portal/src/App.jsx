import { useState } from 'react';
import PIKOnboarding from './PIKOnboarding.jsx';
import PIKPortal from './PIKPortal.jsx';

/**
 * PIK App Root
 * Routes between onboarding (new users) and portal (authenticated).
 * In production, check for an existing auth token to skip onboarding.
 */
export default function App() {
  const [screen, setScreen] = useState('onboarding');
  const [userData, setUserData] = useState(null);

  if (screen === 'portal') {
    return <PIKPortal />;
  }

  return (
    <PIKOnboarding
      onComplete={(data) => {
        setUserData(data);
        setScreen('portal');
      }}
    />
  );
}
