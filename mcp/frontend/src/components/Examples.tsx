import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart3, PieChart, TrendingUp, Wallet, Code, Activity } from 'lucide-react';

const Examples = () => {
  const examples = [
    {
      icon: Wallet,
      question: 'How many NFTs do I have?',
      description:
        'Get a complete overview of your NFT collection with visual breakdowns by collection and rarity.',
      response:
        'You own 47 NFTs across 8 different collections. Your most valuable collection is CyberPunks with 12 items.',
    },
    {
      icon: Code,
      question: 'What is the current state of this smart contract?',
      description:
        'Analyze smart contract state, recent transactions, and function calls with detailed insights.',
      response:
        'The contract has processed 1,247 transactions this month with a 99.2% success rate. Current state shows 450 active users.',
    },
    {
      icon: TrendingUp,
      question: 'Show me my account balance history',
      description:
        'Visualize your HBAR balance changes over time with interactive charts and transaction details.',
      response:
        'Your balance increased 23% this month. Peak balance was 15,432 HBAR on March 15th.',
    },
    {
      icon: Activity,
      question: 'What tokens have I traded recently?',
      description: 'Track your trading activity with profit/loss analysis and market insights.',
      response:
        "You've traded 6 different tokens this week with a net profit of 342 HBAR across 18 transactions.",
    },
    {
      icon: PieChart,
      question: 'Analyze network activity for my dApp',
      description:
        "Monitor your decentralized application's usage patterns and user engagement metrics.",
      response:
        'Your dApp has 2,341 active users this month with an average session time of 8.5 minutes.',
    },
    {
      icon: BarChart3,
      question: 'Compare gas costs across transactions',
      description:
        'Optimize your transaction costs by analyzing gas usage patterns and identifying savings opportunities.',
      response:
        'Average gas cost decreased by 15% this month. Recommended optimal transaction times: 2-4 AM UTC.',
    },
  ];

  return (
    <section id="examples" className="py-20 bg-gradient-secondary/20">
      <div className="container mx-auto px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">
              See What's{' '}
              <span className="bg-gradient-primary bg-clip-text text-transparent">Possible</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              From simple account queries to complex smart contract analysis, discover how natural
              language unlocks blockchain insights.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {examples.map((example, index) => (
              <Card
                key={index}
                className="group hover:shadow-glow transition-all duration-300 hover:-translate-y-1 border-border/50 bg-card/80 backdrop-blur-sm hover:bg-card/90"
              >
                <CardHeader className="pb-4">
                  <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 group-hover:shadow-glow transition-all duration-300">
                    <example.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-lg text-foreground group-hover:text-primary transition-colors">
                    "{example.question}"
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">
                    {example.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-gradient-secondary/30 rounded-lg p-4 border border-border/30 backdrop-blur-sm">
                    <p className="text-sm text-secondary-foreground italic">"{example.response}"</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default Examples;
