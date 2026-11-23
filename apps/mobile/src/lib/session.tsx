import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setApiUser, type StoredResume } from './api';

const USER_KEY = 'jobapp.userId';
const ONBOARDED_KEY = 'jobapp.onboarded';

interface Session {
  ready: boolean;
  userId: string | null;
  onboarded: boolean;
  error: string | null;
  markOnboarded: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Anonymous identity for the MVP: create a user on first launch and keep its id on the device.
 * (Swap for Supabase Auth later; the rest of the app only reads `userId`.)
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        let id = await AsyncStorage.getItem(USER_KEY);
        if (id) {
          setApiUser(id);
          try {
            await api.me();
          } catch (e) {
            // The server was reset: start over with a new user.
            if (e instanceof ApiError && e.status === 401) {
              id = null;
              await AsyncStorage.multiRemove([USER_KEY, ONBOARDED_KEY]);
            } else throw e;
          }
        }
        if (!id) {
          const user = await api.createUser();
          id = user.id;
          await AsyncStorage.setItem(USER_KEY, id);
        }
        setApiUser(id);
        const done = (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
        if (!cancelled) {
          setUserId(id);
          setOnboarded(done);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const value: Session = {
    ready,
    userId,
    onboarded,
    error,
    markOnboarded: async () => {
      await AsyncStorage.setItem(ONBOARDED_KEY, '1');
      setOnboarded(true);
    },
    retry: () => setAttempt((n) => n + 1),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export function useProfile() {
  const { userId } = useSession();
  return useQuery({ queryKey: ['me', userId], queryFn: api.me, enabled: !!userId });
}

/** The user's newest resume (the base for editing and tailoring), or null. */
export function useBaseResume() {
  const { userId } = useSession();
  return useQuery({
    queryKey: ['resume', userId],
    enabled: !!userId,
    queryFn: async (): Promise<StoredResume | null> => (await api.resumes())[0] ?? null,
  });
}

export function useInvalidateUserData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['me'] });
    void qc.invalidateQueries({ queryKey: ['resume'] });
    void qc.invalidateQueries({ queryKey: ['jobs'] });
    void qc.invalidateQueries({ queryKey: ['job'] });
    void qc.invalidateQueries({ queryKey: ['audit'] });
  };
}
