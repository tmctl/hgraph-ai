import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Server, Wrench, FileText, Sparkles } from 'lucide-react';
import { useMCPData } from '@/hooks/useMCPData';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const MCPDashboard = () => {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useMCPData();
  const [activeTab, setActiveTab] = useState('tools');

  // Parse tool parameters safely
  const parseParameters = (tool: any) => {
    try {
      if (typeof tool.inputSchema === 'string') {
        return JSON.parse(tool.inputSchema);
      }
      return tool.inputSchema || {};
    } catch {
      return {};
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="max-w-7xl mx-auto">
          <Alert className="mb-8">
            <AlertDescription>
              Failed to load MCP server data: {error}
            </AlertDescription>
          </Alert>
          <Button onClick={() => navigate('/')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Chat
          </Button>

          <div className="flex items-center gap-3 mb-4">
            <Server className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">MCP Server Dashboard</h1>
          </div>

          <p className="text-gray-600">
            Explore the available tools, resources, and prompts from Hgraph's MCP Server
          </p>
        </div>

        {/* Status Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse" />
              Server Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600">Tools Available</p>
                <p className="text-2xl font-bold">{data?.tools?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Resources</p>
                <p className="text-2xl font-bold">{data?.resources?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Prompts</p>
                <p className="text-2xl font-bold">{data?.prompts?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tools">
              <Wrench className="mr-2 h-4 w-4" />
              Tools ({data?.tools?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="resources">
              <FileText className="mr-2 h-4 w-4" />
              Resources ({data?.resources?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <Sparkles className="mr-2 h-4 w-4" />
              Prompts ({data?.prompts?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tools" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.tools?.map((tool: any, index: number) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Wrench className="h-4 w-4" />
                      {tool.name}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {tool.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {tool.inputSchema && (
                        <div>
                          <p className="text-sm font-medium text-gray-600 mb-1">Parameters:</p>
                          <div className="flex flex-wrap gap-1">
                            {Object.keys(parseParameters(tool).properties || {}).map((param) => (
                              <Badge key={param} variant="secondary" className="text-xs">
                                {param}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="resources" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.resources?.map((resource: any, index: number) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {resource.name}
                    </CardTitle>
                    {resource.description && (
                      <CardDescription className="mt-2">
                        {resource.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">URI:</span> {resource.uri}
                      </p>
                      {resource.mimeType && (
                        <Badge variant="outline" className="text-xs">
                          {resource.mimeType}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="prompts" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data?.prompts?.map((prompt: any, index: number) => (
                <Card key={index} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      {prompt.name}
                    </CardTitle>
                    {prompt.description && (
                      <CardDescription className="mt-2">
                        {prompt.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    {prompt.arguments && prompt.arguments.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Arguments:</p>
                        <div className="flex flex-wrap gap-1">
                          {prompt.arguments.map((arg: any, i: number) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {arg.name} {arg.required && '*'}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Refresh Button */}
        <div className="mt-8 flex justify-center">
          <Button onClick={refetch} variant="outline">
            Refresh Data
          </Button>
        </div>
      </div>
    </div>
  );
};