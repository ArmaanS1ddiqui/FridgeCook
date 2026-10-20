import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetwork() {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected ?? false);
      setIsChecking(false);
    });
    return () => unsubscribe();
  }, []);

  return { isConnected, isChecking };
}

export async function checkNetwork(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected ?? false;
}
