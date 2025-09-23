import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { oauthClient } from '@/lib/oauth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const isAuthenticated = oauthClient.isAuthenticated();

  if (!isAuthenticated) {
    // Store the attempted location
    sessionStorage.setItem('auth_return_url', location.pathname);
    // Redirect to OAuth login
    oauthClient.login();
    return null;
  }

  return <>{children}</>;
};