import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { oauthClient } from '@/lib/oauth';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const AuthCallback = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const success = await oauthClient.handleCallback(window.location.href);

        if (success) {
          // Redirect to dashboard or previous page
          const returnUrl = sessionStorage.getItem('auth_return_url') || '/mcp-dashboard';
          sessionStorage.removeItem('auth_return_url');
          navigate(returnUrl);
        } else {
          setError('Authentication failed. Please try again.');
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('An error occurred during authentication. Please try again.');
      }
    };

    handleCallback();
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="max-w-md w-full p-8">
          <Alert className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <button
            onClick={() => navigate('/')}
            className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <h2 className="text-xl font-semibold">Completing authentication...</h2>
        <p className="text-gray-600 mt-2">Please wait while we log you in.</p>
      </div>
    </div>
  );
};