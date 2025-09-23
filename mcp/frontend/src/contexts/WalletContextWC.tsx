import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { WalletConnectModal } from '@walletconnect/modal';
import { SignClient } from '@walletconnect/sign-client';
import { toast } from '@/hooks/use-toast';

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Get project ID from environment or use a public demo ID
const projectId =
  import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'aca2e65174da1ef84dd332e0e60a0f8a';

// Initialize WalletConnect Modal
const walletConnectModal = new WalletConnectModal({
  projectId,
  chains: ['hedera:295', 'hedera:296', 'hedera:297'], // mainnet, testnet, previewnet
  themeMode: 'dark',
  themeVariables: {
    '--wcm-z-index': '1000',
  },
});

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [signClient, setSignClient] = useState<SignClient | null>(null);
  const [session, setSession] = useState<any>(null);

  // Initialize SignClient
  useEffect(() => {
    const initSignClient = async () => {
      try {
        const client = await SignClient.init({
          projectId,
          metadata: {
            name: 'Hgraph Fluent Chat',
            description: 'AI-powered blockchain analysis for Hedera',
            url: window.location.origin,
            icons: [`${window.location.origin}/favicon.ico`],
          },
        });

        setSignClient(client);

        // Check if there's an existing session
        const existingSessions = client.session.getAll();
        if (existingSessions.length > 0) {
          const lastSession = existingSessions[existingSessions.length - 1];
          setSession(lastSession);

          // Extract Hedera account from session
          const hederaAccounts = lastSession.namespaces.hedera?.accounts;
          if (hederaAccounts && hederaAccounts.length > 0) {
            // Format: hedera:mainnet:0.0.123456
            const accountParts = hederaAccounts[0].split(':');
            const hederaAccountId = accountParts[accountParts.length - 1];

            setAccountId(hederaAccountId);
            setIsConnected(true);

            console.log('Restored session with account:', hederaAccountId);
          }
        }

        // Subscribe to session events
        client.on('session_event', (event) => {
          console.log('Session event:', event);
        });

        client.on('session_update', ({ topic, params }) => {
          console.log('Session update:', { topic, params });
          const updatedSession = client.session.get(topic);
          setSession(updatedSession);
        });

        client.on('session_delete', () => {
          console.log('Session deleted');
          setSession(null);
          setAccountId(null);
          setIsConnected(false);
        });
      } catch (error) {
        console.error('Failed to initialize SignClient:', error);
      }
    };

    initSignClient();
  }, []);

  const connect = useCallback(async () => {
    if (!signClient) {
      toast({
        title: 'Initialization Error',
        description: 'Wallet client is still initializing. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    setIsConnecting(true);

    try {
      // Prepare connection parameters
      const requiredNamespaces = {
        hedera: {
          chains: ['hedera:295'], // mainnet
          methods: [
            'hedera_getNodeAddresses',
            'hedera_executeTransaction',
            'hedera_signMessage',
            'hedera_signAndExecuteTransaction',
            'hedera_signAndExecuteQuery',
            'hedera_signTransaction',
          ],
          events: ['chainChanged', 'accountsChanged'],
        },
      };

      // Create connection proposal
      const { uri, approval } = await signClient.connect({
        requiredNamespaces,
      });

      // Open WalletConnect Modal with the URI
      if (uri) {
        walletConnectModal.openModal({ uri });

        // Wait for user approval
        const sessionResult = await approval();

        // Close modal
        walletConnectModal.closeModal();

        // Save session
        setSession(sessionResult);

        // Extract Hedera account from session
        const hederaAccounts = sessionResult.namespaces.hedera?.accounts;
        if (hederaAccounts && hederaAccounts.length > 0) {
          // Format: hedera:mainnet:0.0.123456
          const accountParts = hederaAccounts[0].split(':');
          const hederaAccountId = accountParts[accountParts.length - 1];

          setAccountId(hederaAccountId);
          setIsConnected(true);

          toast({
            title: 'Wallet Connected',
            description: `Connected to account ${hederaAccountId}`,
          });
        }
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      walletConnectModal.closeModal();

      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect to wallet',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [signClient]);

  const disconnect = useCallback(async () => {
    if (signClient && session) {
      try {
        await signClient.disconnect({
          topic: session.topic,
          reason: {
            code: 6000,
            message: 'User disconnected',
          },
        });
      } catch (error) {
        console.error('Error disconnecting:', error);
      }
    }

    setSession(null);
    setAccountId(null);
    setIsConnected(false);

    toast({
      title: 'Wallet Disconnected',
      description: 'Your wallet has been disconnected',
    });
  }, [signClient, session]);

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected,
        isConnecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
