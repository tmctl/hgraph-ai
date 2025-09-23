import { Button } from '@/components/ui/button';
import { ArrowRight, MessageSquare, BarChart3 } from 'lucide-react';
import heroImage from '@/assets/hero-bg.jpg';
import hgraphLogo from '@/assets/hgraph-logo.png';

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-10"
        style={{ backgroundImage: `url(${heroImage})` }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-hero opacity-5" />

      <div className="container mx-auto px-4 py-32 relative z-10">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <h1 className="text-5xl md:text-7xl font-bold text-foreground mb-6 leading-tight">
            Ask Questions,
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Get Insights</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto leading-relaxed">
            Transform natural language questions about Hedera accounts, NFTs, and smart contracts
            into beautiful graphs and actionable insights.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button variant="hero" size="lg" className="group">
              Start Exploring
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
            <Button variant="outline" size="lg">
              View Examples
            </Button>
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto animate-slide-up">
            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 shadow-soft hover:shadow-medium transition-all duration-300">
              <MessageSquare className="w-8 h-8 text-primary mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Natural Language</h3>
              <p className="text-muted-foreground">
                Ask questions in plain English about blockchain data
              </p>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 shadow-soft hover:shadow-medium transition-all duration-300">
              <BarChart3 className="w-8 h-8 text-primary mb-4 mx-auto" />
              <h3 className="text-lg font-semibold text-foreground mb-2">Visual Insights</h3>
              <p className="text-muted-foreground">Get beautiful charts and graphs of your data</p>
            </div>

            <div className="bg-card/50 backdrop-blur-sm border border-border rounded-xl p-6 shadow-soft hover:shadow-medium transition-all duration-300">
              <img
                src={hgraphLogo}
                alt="Hgraph AI"
                className="w-8 h-8 object-contain mx-auto mb-4"
              />
              <h3 className="text-lg font-semibold text-foreground mb-2">Hedera Focused</h3>
              <p className="text-muted-foreground">Specialized for Hedera analytics</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
