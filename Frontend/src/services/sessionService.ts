import { getBackendUrl } from './nodeAuthService';

export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  ip: string;
  lastActive: string;
  lastActiveAt?: string;
  createdAt?: string;
  isCurrent: boolean;
}

export interface SessionsResponse {
  success: boolean;
  count?: number;
  sessions?: ActiveSession[];
  message?: string;
  error?: string;
}

/**
 * Fetch authenticated user's real tracked login sessions from the backend
 */
export const fetchUserSessionsApi = async (): Promise<SessionsResponse> => {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jivexa_node_jwt_token') : null;
    if (!token) {
      return { success: false, error: 'Not authenticated', sessions: [] };
    }

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/auth/sessions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to fetch sessions',
        sessions: []
      };
    }

    return {
      success: true,
      count: data.count || (data.sessions ? data.sessions.length : 0),
      sessions: data.sessions || []
    };
  } catch (err: any) {
    console.warn('[Session Service] Fetch sessions error:', err.message);
    return {
      success: false,
      error: 'Unable to connect to authentication server. Please check your network connection.',
      sessions: []
    };
  }
};

/**
 * Revoke a specific login session server-side
 */
export const revokeSessionApi = async (sessionId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jivexa_node_jwt_token') : null;
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to revoke session'
      };
    }

    return {
      success: true,
      message: data.message || 'Session revoked successfully'
    };
  } catch (err: any) {
    console.warn('[Session Service] Revoke session error:', err.message);
    return {
      success: false,
      error: 'Unable to connect to authentication server.'
    };
  }
};

/**
 * Revoke all other active login sessions (Logout all other devices) server-side
 */
export const revokeAllOtherSessionsApi = async (): Promise<{ success: boolean; message?: string; revokedCount?: number; error?: string }> => {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('jivexa_node_jwt_token') : null;
    if (!token) {
      return { success: false, error: 'Not authenticated' };
    }

    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/auth/sessions/revoke-others`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        error: data.message || data.error || 'Failed to revoke other sessions'
      };
    }

    return {
      success: true,
      message: data.message || 'Logged out of all other remote device sessions',
      revokedCount: data.revokedCount
    };
  } catch (err: any) {
    console.warn('[Session Service] Revoke all other sessions error:', err.message);
    return {
      success: false,
      error: 'Unable to connect to authentication server.'
    };
  }
};
