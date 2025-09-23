import React from 'react';
import { oauthClient } from '@/lib/oauth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User, LogOut } from 'lucide-react';

export const UserProfile: React.FC = () => {
  const isAuthenticated = oauthClient.isAuthenticated();

  if (!isAuthenticated) {
    return null;
  }

  const handleLogout = () => {
    oauthClient.logout();
  };

  // Parse JWT to get user info
  const getUserInfo = () => {
    const token = oauthClient.getAccessToken();
    if (!token) return { username: 'User' };

    try {
      const parts = token.split('.');
      if (parts.length !== 3) return { username: 'User' };

      const payload = JSON.parse(atob(parts[1]));
      return {
        username: payload.preferred_username || payload.sub || 'User',
        email: payload.email,
        name: payload.name
      };
    } catch {
      return { username: 'User' };
    }
  };

  const userInfo = getUserInfo();

  const getInitials = () => {
    if (userInfo.name) {
      const parts = userInfo.name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
      }
      return userInfo.name.substring(0, 2).toUpperCase();
    }
    if (userInfo.username) {
      return userInfo.username.substring(0, 2).toUpperCase();
    }
    return 'U';
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">
              {userInfo.name || userInfo.username}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {userInfo.email || userInfo.username}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer">
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer text-red-600" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};