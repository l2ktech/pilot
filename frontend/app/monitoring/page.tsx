'use client';

import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { useMonitoringStore } from '../lib/stores/monitoringStore';
import { useHardwareStore } from '../lib/stores/hardwareStore';
import { getApiBaseUrl } from '../lib/apiConfig';
import { RefreshCw, AlertTriangle, CheckCircle, XCircle, Cpu, HardDrive, MemoryStick, Thermometer, Activity } from 'lucide-react';

export default function MonitoringPage() {
  const currentMetrics = useMonitoringStore((state) => state.currentMetrics);
  const history = useMonitoringStore((state) => state.history);
  const isLoading = useMonitoringStore((state) => state.isLoading);
  const error = useMonitoringStore((state) => state.error);
  const restartProcess = useMonitoringStore((state) => state.restartProcess);
  const ioStatus = useHardwareStore((state) => state.ioStatus);
  const gripperStatus = useHardwareStore((state) => state.gripperStatus);

  // State for restart loading
  const [restartingProcess, setRestartingProcess] = useState<string | null>(null);

  // Local state for output switches
  const [output1, setOutput1] = useState(false);
  const [output2, setOutput2] = useState(false);

  // Handler for setting digital output
  const handleSetIO = async (output: 1 | 2, state: boolean) => {
    // Update local state immediately
    if (output === 1) setOutput1(state);
    if (output === 2) setOutput2(state);

    try {
      await fetch(`${getApiBaseUrl()}/api/robot/io/set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ output, state })
      });
    } catch (error) {
      console.error('Failed to set IO:', error);
    }
  };

  // Format uptime to human-readable
  const formatUptime = (seconds: number): string => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Format memory in MB or GB
  const formatMemory = (mb: number): string => {
    if (mb > 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(0)} MB`;
  };

  // Get status color based on percent
  const getPercentColor = (percent: number, warningThreshold: number, criticalThreshold: number): string => {
    if (percent >= criticalThreshold) return 'text-red-500';
    if (percent >= warningThreshold) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Get temperature color
  const getTempColor = (temp: number | null): string => {
    if (!temp) return 'text-muted-foreground';
    if (temp >= 80) return 'text-red-500';
    if (temp >= 65) return 'text-yellow-500';
    return 'text-green-500';
  };

  // Get process status badge
  const getProcessStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Online</Badge>;
      case 'stopped':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Stopped</Badge>;
      case 'errored':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Handle process restart
  const handleRestartProcess = async (processName: string) => {
    if (!confirm(`Restart process "${processName}"? This may cause brief service interruption.`)) {
      return;
    }

    setRestartingProcess(processName);
    try {
      await restartProcess(processName);
      // Success!
    } catch (error) {
      // Error is already logged in store
    } finally {
      setRestartingProcess(null);
    }
  };

  // Prepare chart data for CPU and Memory over time
  const chartData = history.timestamps.map((timestamp, idx) => ({
    time: new Date(timestamp).toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }).split(' ')[0],
    cpu: history.cpuPercent[idx],
    memory: history.memoryPercent[idx],
  })).slice(-60); // Last 60 data points

  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">System Monitoring</h2>
          {error && (
            <div className="text-sm text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* CPU Card */}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Cpu className="w-4 h-4" />
              CPU Usage
            </div>
            <div className={`text-3xl font-bold tabular-nums ${getPercentColor(currentMetrics?.cpu.percent || 0, 70, 90)}`}>
              {currentMetrics?.cpu.percent.toFixed(1) || '0.0'}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {currentMetrics?.cpu.count || 0} cores
            </div>
          </Card>

          {/* Memory Card */}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <MemoryStick className="w-4 h-4" />
              Memory Usage
            </div>
            <div className={`text-3xl font-bold tabular-nums ${getPercentColor(currentMetrics?.memory.percent || 0, 75, 90)}`}>
              {currentMetrics?.memory.percent.toFixed(1) || '0.0'}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {formatMemory(currentMetrics?.memory.used_mb || 0)} / {formatMemory(currentMetrics?.memory.total_mb || 0)}
            </div>
          </Card>

          {/* Disk Card */}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <HardDrive className="w-4 h-4" />
              Disk Usage
            </div>
            <div className={`text-3xl font-bold tabular-nums ${getPercentColor(currentMetrics?.disk.percent || 0, 80, 95)}`}>
              {currentMetrics?.disk.percent.toFixed(1) || '0.0'}%
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {currentMetrics?.disk.free_gb.toFixed(1) || '0.0'} GB free
            </div>
          </Card>

          {/* Temperature Card */}
          <Card className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Thermometer className="w-4 h-4" />
              CPU Temperature
            </div>
            <div className={`text-3xl font-bold tabular-nums ${getTempColor(currentMetrics?.cpu.temperature || null)}`}>
              {currentMetrics?.cpu.temperature?.toFixed(1) || 'N/A'}
              {currentMetrics?.cpu.temperature && '°C'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Uptime: {formatUptime(currentMetrics?.uptime_seconds || 0)}
            </div>
          </Card>

          {/* I/O Status Card */}
          <Card className="p-4 md:col-span-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Activity className="w-4 h-4" />
              I/O Status
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className={ioStatus?.input_1 ? 'text-green-500' : 'text-gray-400'}>
                  {ioStatus?.input_1 ? '●' : '○'}
                </span>
                <span className="text-muted-foreground">IN1:</span>
                <span className="font-mono">{!ioStatus ? 'N/A' : ioStatus.input_1 ? '1' : '0'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={ioStatus?.output_1 ? 'text-green-500' : 'text-gray-400'}>
                  {ioStatus?.output_1 ? '●' : '○'}
                </span>
                <span className="text-muted-foreground">OUT1:</span>
                <span className="font-mono">{!ioStatus ? 'N/A' : ioStatus.output_1 ? '1' : '0'}</span>
                <Switch
                  checked={output1}
                  onCheckedChange={(checked) => handleSetIO(1, checked)}
                  className="ml-auto scale-75"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className={ioStatus?.input_2 ? 'text-green-500' : 'text-gray-400'}>
                  {ioStatus?.input_2 ? '●' : '○'}
                </span>
                <span className="text-muted-foreground">IN2:</span>
                <span className="font-mono">{!ioStatus ? 'N/A' : ioStatus.input_2 ? '1' : '0'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={ioStatus?.output_2 ? 'text-green-500' : 'text-gray-400'}>
                  {ioStatus?.output_2 ? '●' : '○'}
                </span>
                <span className="text-muted-foreground">OUT2:</span>
                <span className="font-mono">{!ioStatus ? 'N/A' : ioStatus.output_2 ? '1' : '0'}</span>
                <Switch
                  checked={output2}
                  onCheckedChange={(checked) => handleSetIO(2, checked)}
                  className="ml-auto scale-75"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 mt-3 pt-2 border-t text-sm">
              <div className="flex items-center gap-2">
                <span className={!ioStatus ? 'text-gray-500' :
                               !ioStatus.estop_pressed ? 'text-green-500' : 'text-red-500'}>
                  {!ioStatus ? '-' : !ioStatus.estop_pressed ? '✓' : '✗'}
                </span>
                <span className="text-muted-foreground">E-STOP:</span>
                <span className="font-medium">
                  {!ioStatus ? 'N/A' : !ioStatus.estop_pressed ? 'OK' : 'PRESSED'}
                </span>
              </div>
              {gripperStatus && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>Gripper:</span>
                  <span className="font-mono">{gripperStatus.position ?? 'N/A'}</span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* CPU & Memory History Chart */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">CPU & Memory History (Last 60s)</h3>
          {chartData.length > 0 ? (
            <ChartContainer
              config={{
                cpu: {
                  label: 'CPU',
                  color: 'hsl(var(--chart-1))',
                },
                memory: {
                  label: 'Memory',
                  color: 'hsl(var(--chart-2))',
                },
              }}
              className="h-[250px] w-full"
            >
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} label={{ value: '%', position: 'insideLeft' }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine y={70} stroke="orange" strokeDasharray="3 3" opacity={0.3} />
                <ReferenceLine y={90} stroke="red" strokeDasharray="3 3" opacity={0.3} />
                <Line type="monotone" dataKey="cpu" stroke="var(--color-cpu)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="memory" stroke="var(--color-memory)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-muted-foreground">
              Waiting for data...
            </div>
          )}
        </Card>

        {/* PM2 Processes Table */}
        <Card className="p-4">
          <h3 className="text-lg font-semibold mb-4">PM2 Processes</h3>
          {currentMetrics?.pm2_processes && currentMetrics.pm2_processes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left">
                    <th className="pb-2 font-semibold">Process</th>
                    <th className="pb-2 font-semibold">Status</th>
                    <th className="pb-2 font-semibold">PID</th>
                    <th className="pb-2 font-semibold">CPU</th>
                    <th className="pb-2 font-semibold">Memory</th>
                    <th className="pb-2 font-semibold">Restarts</th>
                    <th className="pb-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentMetrics.pm2_processes.map((process) => (
                    <tr key={process.name} className="border-b last:border-0">
                      <td className="py-3 font-medium">{process.name}</td>
                      <td className="py-3">{getProcessStatusBadge(process.status)}</td>
                      <td className="py-3 font-mono text-xs">{process.pid || 'N/A'}</td>
                      <td className="py-3">{process.cpu.toFixed(1)}%</td>
                      <td className="py-3">{formatMemory(process.memory / (1024 * 1024))}</td>
                      <td className="py-3">{process.restarts}</td>
                      <td className="py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestartProcess(process.name)}
                          disabled={isLoading || restartingProcess === process.name}
                        >
                          <RefreshCw className={`w-3 h-3 mr-1 ${restartingProcess === process.name ? 'animate-spin' : ''}`} />
                          Restart
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No PM2 processes found
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
