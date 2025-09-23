import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletProvider } from '@/contexts/WalletContextHedera';
import { KeycloakProvider } from '@/contexts/KeycloakContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Index from './pages/Index';
import { Login } from './pages/Login';
import { MCPDashboard } from './pages/MCPDashboard';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <KeycloakProvider>
        <WalletProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mcp-dashboard"
                element={
                  <ProtectedRoute>
                    <MCPDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="*"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </TooltipProvider>
        </WalletProvider>
      </KeycloakProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
