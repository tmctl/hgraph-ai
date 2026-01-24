import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import keycloak from '@/lib/keycloak';

interface KeycloakContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: any;
  token: string | undefined;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateToken: (minValidity?: number) => Promise<boolean>;
}

const KeycloakContext = createContext<KeycloakContextType | undefined>(undefined);

export const useKeycloak = () => {
  const context = useContext(KeycloakContext);
  if (!context) {
    throw new Error('useKeycloak must be used within a KeycloakProvider');
  }
  return context;
};

interface KeycloakProviderProps {
  children: ReactNode;
}

export const KeycloakProvider: React.FC<KeycloakProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    const initKeycloak = async () => {
      try {
        const authenticated = await keycloak.init({
          onLoad: 'check-sso',
          checkLoginIframe: false,
          enableLogging: true,
        });

        setIsAuthenticated(authenticated);

        if (authenticated) {
          setToken(keycloak.token);
          // Load user profile
          const profile = await keycloak.loadUserProfile();
          setUser(profile);

          // Set up token refresh
          setInterval(() => {
            keycloak
              .updateToken(70)
              .then((refreshed) => {
                if (refreshed) {
                  setToken(keycloak.token);
                  console.log('Token refreshed');
                }
              })
              .catch(() => {
                console.error('Failed to refresh token');
                setIsAuthenticated(false);
                setUser(null);
                setToken(undefined);
              });
          }, 60000); // Check every minute
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize Keycloak', error);
        setIsLoading(false);
      }
    };

    initKeycloak();

    // Set up event listeners
    keycloak.onAuthSuccess = () => {
      setIsAuthenticated(true);
      setToken(keycloak.token);
      keycloak.loadUserProfile().then((profile) => {
        setUser(profile);
      });
    };

    keycloak.onAuthError = () => {
      setIsAuthenticated(false);
      setUser(null);
      setToken(undefined);
    };

    keycloak.onAuthLogout = () => {
      setIsAuthenticated(false);
      setUser(null);
      setToken(undefined);
    };

    keycloak.onTokenExpired = () => {
      console.log('Token expired');
      keycloak
        .updateToken(70)
        .then((refreshed) => {
          if (refreshed) {
            setToken(keycloak.token);
            console.log('Token refreshed');
          }
        })
        .catch(() => {
          console.error('Failed to refresh token');
          setIsAuthenticated(false);
          setUser(null);
          setToken(undefined);
        });
    };
  }, []);

  const login = async () => {
    await keycloak.login();
  };

  const logout = async () => {
    await keycloak.logout();
  };

  const updateToken = async (minValidity?: number): Promise<boolean> => {
    try {
      const refreshed = await keycloak.updateToken(minValidity || 5);
      if (refreshed) {
        setToken(keycloak.token);
      }
      return refreshed;
    } catch (error) {
      console.error('Failed to update token', error);
      return false;
    }
  };

  return (
    <KeycloakContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        user,
        token,
        login,
        logout,
        updateToken,
      }}
    >
      {children}
    </KeycloakContext.Provider>
  );
};
