import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { 
  HederaSessionEvent, 
  HederaJsonRpcMethod, 
  DAppConnector, 
  HederaChainId,
  ExtensionData,
  DAppSigner
} from '@hashgraph/hedera-wallet-connect';
import { LedgerId } from '@hashgraph/sdk';
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

const appMetadata = {
  name: 'Hgraph Fluent Chat',
  description: 'AI-powered blockchain analysis for Hedera',
  url: window.location.origin,
  icons: [`${window.location.origin}/favicon.ico`],
};

const projectId = import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || '';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [dAppConnector, setDAppConnector] = useState<DAppConnector | null>(null);
  const [signer, setSigner] = useState<DAppSigner | null>(null);

  const initializeDAppConnector = useCallback(async () => {
    const network = import.meta.env.VITE_HEDERA_NETWORK || 'mainnet';
    const ledgerId = network === 'mainnet' ? LedgerId.MAINNET : LedgerId.TESTNET;

    const connector = new DAppConnector(
      appMetadata,
      ledgerId,
      projectId,
      Object.values(HederaJsonRpcMethod),
      [HederaSessionEvent.ChainChanged, HederaSessionEvent.AccountsChanged],
      [network === 'mainnet' ? HederaChainId.Mainnet : HederaChainId.Testnet]
    );

    await connector.init();
    setDAppConnector(connector);

    const existingSessions = connector.walletConnectClient?.session.getAll();
    if (existingSessions && existingSessions.length > 0) {
      const session = existingSessions[0];
      if (session.namespaces?.hedera?.accounts?.[0]) {
        const accountIdFromSession = session.namespaces.hedera.accounts[0]
          .split(':')[2];
        
        console.log('Restored session with account ID:', accountIdFromSession);
        
        setAccountId(accountIdFromSession);
        setIsConnected(true);

        const newSigner = connector.getSigner(accountIdFromSession);
        setSigner(newSigner);
      }
    }

    return connector;
  }, []);

  useEffect(() => {
    initializeDAppConnector();
  }, [initializeDAppConnector]);

  const connect = useCallback(async () => {
    if (!projectId) {
      toast({
        title: 'Configuration Error',
        description: 'WalletConnect Project ID is not configured. Please add VITE_WALLET_CONNECT_PROJECT_ID to your .env file.',
        variant: 'destructive',
      });
      return;
    }

    setIsConnecting(true);
    
    try {
      let connector = dAppConnector;
      if (!connector) {
        connector = await initializeDAppConnector();
      }

      if (!connector) {
        throw new Error('Failed to initialize DApp connector');
      }

      const extensionData = connector.extensionsAvailable?.find(
        (ext: ExtensionData) => ext.available
      );

      let session;
      
      if (extensionData) {
        session = await connector.connectExtension(extensionData.id);
      } else {
        // Use connect method directly
        try {
          await connector.connect(
            (uri) => {
              // This callback is called with the WalletConnect URI
              console.log('WalletConnect URI:', uri);
              // The modal should open automatically if configured
            },
            (approval) => {
              // This is called when the user approves the connection
              console.log('Connection approved');
            }
          );
          
          // After connection attempt, check for active sessions
          const sessions = connector.walletConnectClient?.session.getAll();
          if (sessions && sessions.length > 0) {
            session = sessions[0];
          }
        } catch (connectError) {
          console.error('Connection error:', connectError);
          throw connectError;
        }
      }

      if (!session) {
        throw new Error('Failed to establish session');
      }

      const accountIdFromSession = session.namespaces.hedera.accounts[0]
        .split(':')[2];
      
      console.log('Connected with account ID:', accountIdFromSession);
      
      setAccountId(accountIdFromSession);
      setIsConnected(true);

      const newSigner = connector.getSigner(accountIdFromSession);
      setSigner(newSigner);

      toast({
        title: 'Wallet Connected',
        description: `Connected to account ${accountIdFromSession}`,
      });
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      toast({
        title: 'Connection Failed',
        description: error instanceof Error ? error.message : 'Failed to connect to wallet',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [dAppConnector, initializeDAppConnector]);

  const disconnect = useCallback(() => {
    if (dAppConnector) {
      dAppConnector.disconnectAll();
      setAccountId(null);
      setIsConnected(false);
      setSigner(null);
      
      toast({
        title: 'Wallet Disconnected',
        description: 'Your wallet has been disconnected',
      });
    }
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