import ChatHero from '@/components/ChatHero';
import { UserProfile } from '@/components/UserProfile';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="absolute top-4 right-4 z-50">
        <UserProfile />
      </div>
      <ChatHero />
    </div>
  );
};

export default Index;
