import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { toast } from '@/hooks/use-toast';

interface WalletContextType {
  accountId: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Simple connection using HashPack or other Hedera wallets via window.ethereum
  const connect = useCallback(async () => {
    setIsConnecting(true);

    try {
      // Check if HashPack or other Hedera wallet is available
      if (typeof window !== 'undefined' && (window as any).ethereum) {
        const ethereum = (window as any).ethereum;

        // Check if it's HashPack
        if (ethereum.isHashPack || ethereum.isHedera) {
          try {
            // Request account access
            const accounts = await ethereum.request({
              method: 'eth_requestAccounts',
            });

            if (accounts && accounts.length > 0) {
              // For Hedera, we might get an EVM address, but we can also try to get Hedera account ID
              const account = accounts[0];

              // Try to get Hedera account info if available
              if (ethereum.request) {
                try {
                  const hederaAccount = await ethereum.request({
                    method: 'hedera_getAccount',
                  });

                  if (hederaAccount) {
                    setAccountId(hederaAccount);
                    setIsConnected(true);

                    toast({
                      title: 'Wallet Connected',
                      description: `Connected to account ${hederaAccount}`,
                    });
                    return;
                  }
                } catch (hederaError) {
                  console.log('Could not get Hedera account, using EVM address');
                }
              }

              // Fallback to EVM address
              setAccountId(account);
              setIsConnected(true);

              toast({
                title: 'Wallet Connected',
                description: `Connected to ${account.slice(0, 6)}...${account.slice(-4)}`,
              });
            }
          } catch (error) {
            console.error('Failed to connect to HashPack:', error);
            throw error;
          }
        } else {
          // For non-HashPack wallets, inform user to use HashPack
          toast({
            title: 'HashPack Required',
            description: 'Please install HashPack wallet extension to connect to Hedera',
            variant: 'destructive',
          });
        }
      } else {
        // No wallet detected
        toast({
          title: 'No Wallet Found',
          description: 'Please install HashPack wallet extension',
          variant: 'destructive',
        });

        // Open HashPack website
        window.open('https://www.hashpack.app/download', '_blank');
      }
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
  }, []);

  const disconnect = useCallback(() => {
    setAccountId(null);
    setIsConnected(false);

    toast({
      title: 'Wallet Disconnected',
      description: 'Your wallet has been disconnected',
    });
  }, []);

  // Check for existing connection on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).ethereum) {
      const ethereum = (window as any).ethereum;

      if (ethereum.isHashPack || ethereum.isHedera) {
        // Check if already connected
        ethereum
          .request({ method: 'eth_accounts' })
          .then((accounts: string[]) => {
            if (accounts && accounts.length > 0) {
              setAccountId(accounts[0]);
              setIsConnected(true);
            }
          })
          .catch(console.error);
      }
    }
  }, []);

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
