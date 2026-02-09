import { useState, useEffect } from 'hono/jsx/dom';

interface User {
  email: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth(): AuthState & { refresh: () => void } {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const fetchUser = async () => {
    try {
      const response = await fetch('/api/me');
      if (response.ok) {
        const user = await response.json();
        setState({ user, loading: false, error: null });
      } else if (response.status === 401) {
        setState({ user: null, loading: false, error: null });
      } else {
        setState({ user: null, loading: false, error: 'Failed to fetch user' });
      }
    } catch (e) {
      setState({ user: null, loading: false, error: 'Network error' });
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  return { ...state, refresh: fetchUser };
}
