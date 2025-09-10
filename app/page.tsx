"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Copy,
  Server,
  Network,
  TestTube,
  Settings,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Activity,
  Search,
  History,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface DNSConfig {
  dns_ip: string
  dns_interface: string
  dns_username: string
  dns_password: string
  host_ip: string
  host_interface: string
  host_username: string
  host_password: string
  domain: string
  host1_prefix: string
  host2_prefix: string
}

interface ConfigResponse {
  configurations: {
    forward_zone: string
    named_conf_zones: string
    options_config: string
    reverse_zone: string
  }
  connection_info: {
    dns_server: { interface: string; ip: string; username: string }
    host_server: { interface: string; ip: string; username: string }
  }
  file_names: {
    forward_zone_file: string
    reverse_zone_file: string
  }
  permission_commands: string[]
  success: boolean
}

interface TestResponse {
  success: boolean
  test_results: {
    [key: string]: {
      command: string
      returncode: number
      stderr: string
      stdout: string
      success: boolean
    }
  }
}

interface NetworkResponse {
  firewall_commands: string[]
  network_commands: string[]
  success: boolean
}

interface EnhancedTestResponse {
  success: boolean
  session_id: number
  timestamp: string
  test_results: {
    dig_host1: TestResult
    dig_host2: TestResult
    ping_host1: PingResult
    ping_host2: PingResult
    reverse_lookup: TestResult
  }
  input_parameters: {
    dns_ip: string
    host_ip: string
    domain: string
    host1_prefix: string
    host2_prefix: string
  }
}

interface TestResult {
  command: string
  success: boolean
  return_code: number
  rich_summary: string
  parsed_data: {
    query_time: number
    server: { ip: string; port: string }
    answer_section: Array<{
      name: string
      ttl: number | null
      class: string
      type: string
      value: string
    }>
    status: string
    flags: string
    message_size: number
  }
  raw_stdout: string
  stderr: string
}

interface PingResult {
  command: string
  success: boolean
  return_code: number
  rich_summary: string
  parsed_data: {
    target_ip: string
    packets_transmitted: number
    packets_received: number
    packet_loss: number
    rtt_stats: {
      min: number
      avg: number
      max: number
      mdev: number
    }
    individual_pings: number[]
  }
  raw_stdout: string
  stderr: string
}

interface HistoricalTestResult {
  session_info: {
    session_id: number
    dns_ip: string
    host_ip: string
    domain: string
    host1_prefix: string
    host2_prefix: string
    timestamp: string
    overall_success: boolean
  }
  test_results: {
    [key: string]: {
      command: string
      return_code: number
      raw_stdout: string
      stderr: string | null
      success: boolean
      rich_summary: string
    }
  }
}

interface StoredConfig {
  config_id: number
  dns_ip: string
  dns_interface: string
  host_ip: string
  host_interface: string
  domain: string
  forward_zone: string
  reverse_zone: string
  named_conf_zones: string
  options_config: string
  created_at: string
}

export default function DNSDashboard() {
  const [config, setConfig] = useState<DNSConfig>({
    dns_ip: "10.42.0.1",
    dns_interface: "eno1",
    dns_username: "labrigui",
    dns_password: "rootroot",
    host_ip: "10.42.0.243",
    host_interface: "enp0s25",
    host_username: "labrigui",
    host_password: "rootroot",
    domain: "lab.local",
    host1_prefix: "hp",
    host2_prefix: "dell",
  })

  const [configResponse, setConfigResponse] = useState<ConfigResponse | null>(null)
  const [testResponse, setTestResponse] = useState<TestResponse | null>(null)
  const [networkResponse, setNetworkResponse] = useState<NetworkResponse | null>(null)
  const [loading, setLoading] = useState({ config: false, test: false, network: false })
  const [enhancedTestResponse, setEnhancedTestResponse] = useState<EnhancedTestResponse | null>(null)
  const [historicalResults, setHistoricalResults] = useState<HistoricalTestResult | null>(null)
  const [storedConfigs, setStoredConfigs] = useState<StoredConfig[]>([])
  const [sessionId, setSessionId] = useState<string>("")
  const [searchInterface, setSearchInterface] = useState<string>("eno1")

  const { toast } = useToast()

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({
        title: "Copied to clipboard",
        description: `${label} has been copied to your clipboard.`,
      })
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Failed to copy to clipboard. Please try again.",
        variant: "destructive",
      })
    }
  }

  const generateConfig = async () => {
    setLoading((prev) => ({ ...prev, config: true }))
    try {
      const response = await fetch("http://10.42.0.1:5000/generate-dns-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      })
      const data = await response.json()
      setConfigResponse(data)
      toast({
        title: "Configuration Generated",
        description: "DNS configuration has been successfully generated.",
      })
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate DNS configuration. Please check your connection.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, config: false }))
    }
  }

  const testDNS = async () => {
    setLoading((prev) => ({ ...prev, test: true }))
    try {
      const testConfig = {
        dns_ip: config.dns_ip,
        host_ip: config.host_ip,
        domain: config.domain,
        host1_prefix: config.host1_prefix,
        host2_prefix: config.host2_prefix,
      }
      const response = await fetch("http://10.42.0.1:8000/test-dns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testConfig),
      })
      const data = await response.json()
      setEnhancedTestResponse(data)
      setTestResponse(data) // Keep backward compatibility
      toast({
        title: "DNS Test Complete",
        description: `DNS test completed ${data.success ? "successfully" : "with errors"}. Session ID: ${data.session_id}`,
        variant: data.success ? "default" : "destructive",
      })
    } catch (error) {
      toast({
        title: "Test Failed",
        description: "Failed to run DNS tests. Please check your connection.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, test: false }))
    }
  }

  const configureNetwork = async () => {
    setLoading((prev) => ({ ...prev, network: true }))
    try {
      const networkConfig = {
        dns_ip: config.dns_ip,
        domain: config.domain,
        interface: config.dns_interface,
      }
      const response = await fetch("http://10.42.0.1:5000/network-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(networkConfig),
      })
      const data = await response.json()
      setNetworkResponse(data)
      toast({
        title: "Network Configuration Generated",
        description: "Network and firewall commands have been generated.",
      })
    } catch (error) {
      toast({
        title: "Configuration Failed",
        description: "Failed to generate network configuration. Please check your connection.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, network: false }))
    }
  }

  const fetchHistoricalResults = async () => {
    if (!sessionId) {
      toast({
        title: "Session ID Required",
        description: "Please enter a session ID to fetch historical results.",
        variant: "destructive",
      })
      return
    }

    setLoading((prev) => ({ ...prev, test: true }))
    try {
      const response = await fetch(`http://10.42.0.1:8000/test-results/${sessionId}`)
      const data = await response.json()
      setHistoricalResults(data)
      toast({
        title: "Historical Results Loaded",
        description: `Loaded test results for session ${sessionId}.`,
      })
    } catch (error) {
      toast({
        title: "Fetch Failed",
        description: "Failed to fetch historical results. Please check the session ID.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, test: false }))
    }
  }

  const searchConfigurations = async () => {
    setLoading((prev) => ({ ...prev, config: true }))
    try {
      const response = await fetch(`http://10.42.0.1:8000/search-dns-server-config/${searchInterface}`)
      const data = await response.json()
      setStoredConfigs(data)
      toast({
        title: "Configurations Loaded",
        description: `Found ${data.length} stored configuration(s) for interface ${searchInterface}.`,
      })
    } catch (error) {
      toast({
        title: "Search Failed",
        description: "Failed to search configurations. Please check your connection.",
        variant: "destructive",
      })
    } finally {
      setLoading((prev) => ({ ...prev, config: false }))
    }
  }

  const CodeBlock = ({ title, content, language = "bash" }: { title: string; content: string; language?: string }) => (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(content, title)} className="h-8 px-2">
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-32 w-full rounded-md border bg-muted p-3">
          <pre className="text-xs font-mono whitespace-pre-wrap">{content}</pre>
        </ScrollArea>
      </CardContent>
    </Card>
  )

  const MetricCard = ({
    title,
    value,
    unit,
    status,
    icon: Icon,
  }: {
    title: string
    value: string | number
    unit?: string
    status?: "success" | "warning" | "error"
    icon?: any
  }) => (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold">{value}</p>
            {unit && <p className="text-sm text-muted-foreground">{unit}</p>}
          </div>
        </div>
        {Icon && (
          <Icon
            className={`h-8 w-8 ${
              status === "success"
                ? "text-green-600"
                : status === "warning"
                  ? "text-yellow-600"
                  : status === "error"
                    ? "text-red-600"
                    : "text-muted-foreground"
            }`}
          />
        )}
      </div>
    </Card>
  )

  const PingVisualization = ({ pingData, title }: { pingData: PingResult; title: string }) => (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          {title}
        </CardTitle>
        <CardDescription>{pingData.rich_summary}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Packet Loss"
            value={pingData.parsed_data.packet_loss}
            unit="%"
            status={pingData.parsed_data.packet_loss === 0 ? "success" : "error"}
          />
          <MetricCard
            title="Avg RTT"
            value={pingData.parsed_data.rtt_stats.avg.toFixed(3)}
            unit="ms"
            status="success"
          />
          <MetricCard title="Min RTT" value={pingData.parsed_data.rtt_stats.min.toFixed(3)} unit="ms" />
          <MetricCard title="Max RTT" value={pingData.parsed_data.rtt_stats.max.toFixed(3)} unit="ms" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Individual Ping Times</h4>
          <div className="flex gap-2 flex-wrap">
            {pingData.parsed_data.individual_pings.map((time, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                Ping {index + 1}: {time.toFixed(3)}ms
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground font-mono">{pingData.command}</span>
          <Button variant="outline" size="sm" onClick={() => copyToClipboard(pingData.raw_stdout, `${title} output`)}>
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">DNS Server Configuration Dashboard</h1>
          <p className="text-muted-foreground">
            Configure, test, and manage your DNS server settings with advanced analytics
          </p>
        </div>

        <Tabs defaultValue="configure" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="configure" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configure
            </TabsTrigger>
            <TabsTrigger value="generate" className="flex items-center gap-2">
              <Server className="h-4 w-4" />
              Generate
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <TestTube className="h-4 w-4" />
              Test
            </TabsTrigger>
            <TabsTrigger value="network" className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              Network
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              History
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search
            </TabsTrigger>
          </TabsList>

          <TabsContent value="configure" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>DNS Server Configuration</CardTitle>
                <CardDescription>Enter your DNS server and host configuration details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">DNS Server Settings</h3>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="dns_ip">DNS Server IP</Label>
                        <Input
                          id="dns_ip"
                          value={config.dns_ip}
                          onChange={(e) => setConfig((prev) => ({ ...prev, dns_ip: e.target.value }))}
                          placeholder="10.42.0.1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dns_interface">DNS Interface</Label>
                        <Input
                          id="dns_interface"
                          value={config.dns_interface}
                          onChange={(e) => setConfig((prev) => ({ ...prev, dns_interface: e.target.value }))}
                          placeholder="eno1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dns_username">DNS Username</Label>
                        <Input
                          id="dns_username"
                          value={config.dns_username}
                          onChange={(e) => setConfig((prev) => ({ ...prev, dns_username: e.target.value }))}
                          placeholder="labrigui"
                        />
                      </div>
                      <div>
                        <Label htmlFor="dns_password">DNS Password</Label>
                        <Input
                          id="dns_password"
                          type="password"
                          value={config.dns_password}
                          onChange={(e) => setConfig((prev) => ({ ...prev, dns_password: e.target.value }))}
                          placeholder="rootroot"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Host Server Settings</h3>
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="host_ip">Host Server IP</Label>
                        <Input
                          id="host_ip"
                          value={config.host_ip}
                          onChange={(e) => setConfig((prev) => ({ ...prev, host_ip: e.target.value }))}
                          placeholder="10.42.0.243"
                        />
                      </div>
                      <div>
                        <Label htmlFor="host_interface">Host Interface</Label>
                        <Input
                          id="host_interface"
                          value={config.host_interface}
                          onChange={(e) => setConfig((prev) => ({ ...prev, host_interface: e.target.value }))}
                          placeholder="enp0s25"
                        />
                      </div>
                      <div>
                        <Label htmlFor="host_username">Host Username</Label>
                        <Input
                          id="host_username"
                          value={config.host_username}
                          onChange={(e) => setConfig((prev) => ({ ...prev, host_username: e.target.value }))}
                          placeholder="labrigui"
                        />
                      </div>
                      <div>
                        <Label htmlFor="host_password">Host Password</Label>
                        <Input
                          id="host_password"
                          type="password"
                          value={config.host_password}
                          onChange={(e) => setConfig((prev) => ({ ...prev, host_password: e.target.value }))}
                          placeholder="rootroot"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="domain">Domain</Label>
                    <Input
                      id="domain"
                      value={config.domain}
                      onChange={(e) => setConfig((prev) => ({ ...prev, domain: e.target.value }))}
                      placeholder="lab.local"
                    />
                  </div>
                  <div>
                    <Label htmlFor="host1_prefix">Host 1 Prefix</Label>
                    <Input
                      id="host1_prefix"
                      value={config.host1_prefix}
                      onChange={(e) => setConfig((prev) => ({ ...prev, host1_prefix: e.target.value }))}
                      placeholder="hp"
                    />
                  </div>
                  <div>
                    <Label htmlFor="host2_prefix">Host 2 Prefix</Label>
                    <Input
                      id="host2_prefix"
                      value={config.host2_prefix}
                      onChange={(e) => setConfig((prev) => ({ ...prev, host2_prefix: e.target.value }))}
                      placeholder="dell"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="generate" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Generate DNS Configuration</CardTitle>
                <CardDescription>Generate DNS zone files and configuration based on your settings</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={generateConfig} disabled={loading.config} className="mb-6">
                  {loading.config ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Server className="mr-2 h-4 w-4" />
                      Generate Configuration
                    </>
                  )}
                </Button>

                {configResponse && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      {configResponse.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <Badge variant={configResponse.success ? "default" : "destructive"}>
                        {configResponse.success ? "Success" : "Failed"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <CodeBlock
                        title="Forward Zone Configuration"
                        content={configResponse.configurations.forward_zone}
                        language="dns"
                      />
                      <CodeBlock
                        title="Reverse Zone Configuration"
                        content={configResponse.configurations.reverse_zone}
                        language="dns"
                      />
                      <CodeBlock
                        title="Named.conf Zones"
                        content={configResponse.configurations.named_conf_zones}
                        language="conf"
                      />
                      <CodeBlock
                        title="Options Configuration"
                        content={configResponse.configurations.options_config}
                        language="conf"
                      />
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Permission Commands</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {configResponse.permission_commands.map((command, index) => (
                            <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                              <code className="text-sm font-mono">{command}</code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(command, `Command ${index + 1}`)}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="network" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Network Configuration</CardTitle>
                <CardDescription>Generate network and firewall configuration commands</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={configureNetwork} disabled={loading.network} className="mb-6">
                  {loading.network ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Network className="mr-2 h-4 w-4" />
                      Generate Network Config
                    </>
                  )}
                </Button>

                {networkResponse && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                      {networkResponse.success ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <Badge variant={networkResponse.success ? "default" : "destructive"}>
                        {networkResponse.success ? "Success" : "Failed"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Firewall Commands</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {networkResponse.firewall_commands.map((command, index) => (
                              <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                                <code className="text-sm font-mono flex-1 mr-2">{command}</code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(command, `Firewall command ${index + 1}`)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Network Commands</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {networkResponse.network_commands.map((command, index) => (
                              <div key={index} className="flex items-center justify-between bg-muted p-2 rounded">
                                <code className="text-sm font-mono flex-1 mr-2">{command}</code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyToClipboard(command, `Network command ${index + 1}`)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Enhanced DNS Testing</CardTitle>
                <CardDescription>
                  Test your DNS configuration with detailed analytics and visualizations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={testDNS} disabled={loading.test} className="mb-6">
                  {loading.test ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube className="mr-2 h-4 w-4" />
                      Run Enhanced DNS Tests
                    </>
                  )}
                </Button>

                {enhancedTestResponse && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-4">
                        {enhancedTestResponse.success ? (
                          <CheckCircle className="h-6 w-6 text-green-600" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-600" />
                        )}
                        <div>
                          <Badge variant={enhancedTestResponse.success ? "default" : "destructive"} className="mb-1">
                            {enhancedTestResponse.success ? "All Tests Passed" : "Some Tests Failed"}
                          </Badge>
                          <p className="text-sm text-muted-foreground">Session ID: {enhancedTestResponse.session_id}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {new Date(enhancedTestResponse.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Server className="h-5 w-5" />
                            DNS Query Performance
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <MetricCard
                              title="Host1 Query Time"
                              value={enhancedTestResponse.test_results.dig_host1.parsed_data.query_time}
                              unit="ms"
                              status="success"
                            />
                            <MetricCard
                              title="Host2 Query Time"
                              value={enhancedTestResponse.test_results.dig_host2.parsed_data.query_time}
                              unit="ms"
                              status="success"
                            />
                          </div>

                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">DNS Server Info</h4>
                            <div className="bg-muted p-3 rounded text-sm">
                              <p>
                                <strong>Server:</strong>{" "}
                                {enhancedTestResponse.test_results.dig_host1.parsed_data.server.ip}:
                                {enhancedTestResponse.test_results.dig_host1.parsed_data.server.port}
                              </p>
                              <p>
                                <strong>Status:</strong>{" "}
                                {enhancedTestResponse.test_results.dig_host1.parsed_data.status}
                              </p>
                              <p>
                                <strong>Flags:</strong> {enhancedTestResponse.test_results.dig_host1.parsed_data.flags}
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">DNS Records Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {enhancedTestResponse.test_results.dig_host1.parsed_data.answer_section.map(
                            (record, index) => (
                              <div key={index} className="bg-muted p-3 rounded text-sm">
                                <p>
                                  <strong>Name:</strong> {record.name}
                                </p>
                                <p>
                                  <strong>Type:</strong> {record.type} {record.class}
                                </p>
                                <p>
                                  <strong>Value:</strong> {record.value}
                                </p>
                                {record.ttl && (
                                  <p>
                                    <strong>TTL:</strong> {record.ttl}s
                                  </p>
                                )}
                              </div>
                            ),
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-6">
                      <PingVisualization
                        pingData={enhancedTestResponse.test_results.ping_host1}
                        title={`Ping Test - ${enhancedTestResponse.input_parameters.host1_prefix}.${enhancedTestResponse.input_parameters.domain}`}
                      />
                      <PingVisualization
                        pingData={enhancedTestResponse.test_results.ping_host2}
                        title={`Ping Test - ${enhancedTestResponse.input_parameters.host2_prefix}.${enhancedTestResponse.input_parameters.domain}`}
                      />
                    </div>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Reverse DNS Lookup</CardTitle>
                        <CardDescription>
                          {enhancedTestResponse.test_results.reverse_lookup.rich_summary}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center justify-between">
                          <code className="text-sm bg-muted p-2 rounded">
                            {enhancedTestResponse.test_results.reverse_lookup.command}
                          </code>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              copyToClipboard(
                                enhancedTestResponse.test_results.reverse_lookup.raw_stdout,
                                "Reverse lookup output",
                              )
                            }
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Historical Test Results</CardTitle>
                <CardDescription>Retrieve and analyze previous DNS test sessions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-6">
                  <div className="flex-1">
                    <Label htmlFor="session_id">Session ID</Label>
                    <Input
                      id="session_id"
                      value={sessionId}
                      onChange={(e) => setSessionId(e.target.value)}
                      placeholder="Enter session ID (e.g., 7)"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={fetchHistoricalResults} disabled={loading.test}>
                      {loading.test ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <History className="mr-2 h-4 w-4" />
                          Fetch Results
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {historicalResults && (
                  <div className="space-y-6">
                    <div className="bg-muted p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">Session Information</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <strong>Session ID:</strong> {historicalResults.session_info.session_id}
                        </div>
                        <div>
                          <strong>DNS IP:</strong> {historicalResults.session_info.dns_ip}
                        </div>
                        <div>
                          <strong>Domain:</strong> {historicalResults.session_info.domain}
                        </div>
                        <div>
                          <strong>Success:</strong>
                          <Badge
                            variant={historicalResults.session_info.overall_success ? "default" : "destructive"}
                            className="ml-2"
                          >
                            {historicalResults.session_info.overall_success ? "Yes" : "No"}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        <Clock className="h-4 w-4 inline mr-1" />
                        {new Date(historicalResults.session_info.timestamp).toLocaleString()}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {Object.entries(historicalResults.test_results).map(([testName, result]) => (
                        <Card key={testName}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-medium capitalize">
                                {testName.replace(/_/g, " ")}
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                {result.success ? (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                ) : (
                                  <XCircle className="h-4 w-4 text-red-600" />
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copyToClipboard(result.raw_stdout, `${testName} output`)}
                                  className="h-8 px-2"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{result.command}</p>
                            {result.rich_summary && <p className="text-xs text-blue-600">{result.rich_summary}</p>}
                          </CardHeader>
                          <CardContent className="pt-0">
                            <ScrollArea className="h-32 w-full rounded-md border bg-muted p-3">
                              <pre className="text-xs font-mono whitespace-pre-wrap">
                                {result.raw_stdout || result.stderr || "No output"}
                              </pre>
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Search Stored Configurations</CardTitle>
                <CardDescription>Find and review previously stored DNS configurations by interface</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-4 mb-6">
                  <div className="flex-1">
                    <Label htmlFor="search_interface">DNS Interface</Label>
                    <Input
                      id="search_interface"
                      value={searchInterface}
                      onChange={(e) => setSearchInterface(e.target.value)}
                      placeholder="Enter interface name (e.g., eno1)"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={searchConfigurations} disabled={loading.config}>
                      {loading.config ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search className="mr-2 h-4 w-4" />
                          Search Configs
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {storedConfigs.length > 0 && (
                  <div className="space-y-6">
                    <p className="text-sm text-muted-foreground">
                      Found {storedConfigs.length} configuration(s) for interface "{searchInterface}"
                    </p>

                    {storedConfigs.map((config) => (
                      <Card key={config.config_id} className="border-l-4 border-l-blue-500">
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Configuration #{config.config_id}</CardTitle>
                            <Badge variant="outline">{new Date(config.created_at).toLocaleDateString()}</Badge>
                          </div>
                          <CardDescription>
                            DNS: {config.dns_ip} ({config.dns_interface}) | Host: {config.host_ip} (
                            {config.host_interface}) | Domain: {config.domain}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <CodeBlock title="Forward Zone" content={config.forward_zone} language="dns" />
                            <CodeBlock title="Reverse Zone" content={config.reverse_zone} language="dns" />
                            <CodeBlock title="Named.conf Zones" content={config.named_conf_zones} language="conf" />
                            <CodeBlock title="Options Config" content={config.options_config} language="conf" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {storedConfigs.length === 0 && searchInterface && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No configurations found for interface "{searchInterface}"</p>
                    <p className="text-sm">Try searching with a different interface name</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
