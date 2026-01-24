import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import {
  DAppConnector,
  HederaJsonRpcMethod,
  HederaSessionEvent,
  HederaChainId,
  DAppSigner,
} from '@hashgraph/hedera-wallet-connect';
import { LedgerId, AccountId } from '@hashgraph/sdk';
import { toast } from '@/hooks/use-toast';

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  dAppConnector: DAppConnector | null;
  signer: DAppSigner | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// App metadata
const appMetadata = {
  name: 'Hgraph Fluent Chat',
  description: 'AI-powered blockchain analysis for Hedera',
  icons: [window.location.origin + '/favicon.ico'],
  url: window.location.origin,
};

// Get project ID from environment or use a default test ID
const projectId =
  import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || 'ce06497abf4102004138a10edd29c921';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dAppConnector, setDAppConnector] = useState<DAppConnector | null>(null);
  const [signer, setSigner] = useState<DAppSigner | null>(null);
  const [currentSessionTopic, setCurrentSessionTopic] = useState<string | null>(null);

  // Initialize DApp Connector
  const initializeDAppConnector = useCallback(async () => {
    try {
      // Use mainnet by default
      const network = import.meta.env.VITE_HEDERA_NETWORK || 'mainnet';
      const ledgerId = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET;
      const chainId = network === 'mainnet' ? HederaChainId.Mainnet : HederaChainId.Testnet;

      console.log('Initializing DAppConnector with:', {
        network,
        ledgerId: ledgerId.toString(),
        chainId,
        projectId: projectId ? 'configured' : 'missing',
      });

      const connector = new DAppConnector(
        appMetadata,
        ledgerId,
        projectId,
        Object.values(HederaJsonRpcMethod),
        [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
        [chainId],
      );

      await connector.init();
      console.log('DAppConnector initialized successfully');

      setDAppConnector(connector);

      // Check for existing sessions
      const sessions = connector.walletConnectClient?.session.getAll();
      console.log('Existing sessions:', sessions?.length || 0);

      if (sessions && sessions.length > 0) {
        const lastSession = sessions[sessions.length - 1];
        console.log('Restoring session:', lastSession);

        if (lastSession.namespaces?.hedera?.accounts?.[0]) {
          const accountString = lastSession.namespaces.hedera.accounts[0];
          // Format: hedera:mainnet:0.0.123456
          const parts = accountString.split(':');
          const hederaAccountId = parts[parts.length - 1];

          console.log('Restored account:', hederaAccountId);

          setAccountId(hederaAccountId);
          setIsConnected(true);
          setCurrentSessionTopic(lastSession.topic);

          // Create signer for the account
          const newSigner = connector.getSigner(AccountId.fromString(hederaAccountId));
          setSigner(newSigner);
        }
      }

      return connector;
    } catch (error) {
      console.error('Failed to initialize DAppConnector:', error);
      return null;
    }
  }, []);

  // Initialize on mount and set up event listeners
  useEffect(() => {
    const setup = async () => {
      const connector = await initializeDAppConnector();

      if (connector?.walletConnectClient) {
        // Listen for session updates
        connector.walletConnectClient.on('session_update', ({ params }) => {
          console.log('Session updated:', params);
          // Force state refresh if still showing as connecting
          if (isConnecting && params?.namespaces?.hedera?.accounts?.[0]) {
            const accountString = params.namespaces.hedera.accounts[0];
            const parts = accountString.split(':');
            const hederaAccountId = parts[parts.length - 1];

            setAccountId(hederaAccountId);
            setIsConnected(true);
            setIsConnecting(false);
          }
        });

        // Listen for session events
        connector.walletConnectClient.on('session_event', ({ params }) => {
          console.log('Session event:', params);
        });
      }
    };

    setup();
  }, [initializeDAppConnector]);

  const connect = useCallback(async () => {
    console.log('Connect button clicked');

    if (!projectId) {
      toast({
        title: 'Configuration Error',
        description:
          'WalletConnect Project ID is required. Please add VITE_WALLET_CONNECT_PROJECT_ID to your .env file.',
        variant: 'destructive',
      });
      return;
    }

    setIsConnecting(true);

    // Set a timeout to prevent infinite spinning
    const connectTimeout = setTimeout(() => {
      if (isConnecting) {
        console.warn('Connection timeout - resetting state');
        setIsConnecting(false);
      }
    }, 30000); // 30 second timeout

    try {
      let connector = dAppConnector;

      // Initialize if not already done
      if (!connector) {
        console.log('Connector not initialized, initializing now...');
        connector = await initializeDAppConnector();
      }

      if (!connector) {
        throw new Error('Failed to initialize DApp connector');
      }

      console.log('Starting connection process...');

      // Connect using the new v2 API
      let session;

      try {
        // Open the modal first
        const { uri, approval } = await connector.openModal();

        if (uri) {
          console.log('WalletConnect URI generated:', uri);

          // Wait for user to approve the connection in the wallet
          session = await approval();
          console.log('Connection session established:', session);

          // Close the modal after connection
          connector.closeModal();
        } else {
          // Fallback: try direct connection without modal
          session = await connector.connect((uri: string) => {
            console.log('WalletConnect URI generated (fallback):', uri);
          });
        }
      } catch (connectError) {
        console.error('Connection error:', connectError);
        // Make sure to close modal on error
        try {
          connector.closeModal();
        } catch {}
        throw connectError;
      }

      if (!session) {
        throw new Error('No session established');
      }

      // Extract account ID from session
      if (session.namespaces?.hedera?.accounts?.[0]) {
        const accountString = session.namespaces.hedera.accounts[0];
        // Format: hedera:mainnet:0.0.123456
        const parts = accountString.split(':');
        const hederaAccountId = parts[parts.length - 1];

        console.log('Connected with account:', hederaAccountId);

        // Create signer for the account
        const newSigner = connector.getSigner(AccountId.fromString(hederaAccountId));

        // Set all state updates together
        setAccountId(hederaAccountId);
        setIsConnected(true);
        setSigner(newSigner);
        setCurrentSessionTopic(session.topic); // Save the session topic
        setIsConnecting(false); // Explicitly set this to false on success

        // Clear the timeout on successful connection
        clearTimeout(connectTimeout);

        toast({
          title: 'Wallet Connected',
          description: `Connected to account ${hederaAccountId}`,
        });
      } else {
        throw new Error('No Hedera account found in session');
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);

      // Clear the timeout on error
      clearTimeout(connectTimeout);

      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to wallet';

      toast({
        title: 'Connection Failed',
        description: errorMessage,
        variant: 'destructive',
      });

      // Ensure state is reset on error
      setIsConnecting(false);
      setIsConnected(false);
      setAccountId(null);
      setCurrentSessionTopic(null);
    }
  }, [dAppConnector, initializeDAppConnector]);

  const disconnect = useCallback(async () => {
    console.log('Disconnect button clicked');

    if (dAppConnector) {
      try {
        // Get active sessions before disconnecting
        const sessions = dAppConnector.walletConnectClient?.session.getAll();
        console.log('Active sessions before disconnect:', sessions?.length || 0);

        if (sessions && sessions.length > 0) {
          // Disconnect each active session
          for (const session of sessions) {
            try {
              console.log('Disconnecting session:', session.topic);
              await dAppConnector.walletConnectClient?.disconnect({
                topic: session.topic,
                reason: {
                  code: 6000,
                  message: 'User disconnected',
                },
              });
            } catch (sessionError) {
              console.error('Error disconnecting session:', session.topic, sessionError);
            }
          }
        }

        console.log('Disconnected successfully');
      } catch (error) {
        console.error('Error during disconnect:', error);
        // Continue with cleanup even if disconnect fails
      }
    }

    // Always clean up state, even if disconnect fails
    setAccountId(null);
    setIsConnected(false);
    setSigner(null);
    setCurrentSessionTopic(null);

    toast({
      title: 'Wallet Disconnected',
      description: 'Your wallet has been disconnected',
    });
  }, [dAppConnector]);

  return (
    <WalletContext.Provider
      value={{
        accountId,
        isConnected,
        isConnecting,
        connect,
        disconnect,
        dAppConnector,
        signer,
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
