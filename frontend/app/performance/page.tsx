'use client';

import { useEffect, useState } from 'react';
import Header from '../components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend, ChartLegendContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';
import { useHardwareStore, usePerformanceStore, useMotionRecordingStore } from '../lib/stores';
import { Download, Trash2, RefreshCw } from 'lucide-react';

// Joint names for display
const JOINT_NAMES = ['J1 (Base)', 'J2 (Shoulder)', 'J3 (Elbow)', 'J4 (Wrist 1)', 'J5 (Wrist 2)', 'J6 (Wrist 3)'];

export default function PerformancePage() {
  // Live Hz monitoring state
  const robotStatus = useHardwareStore((state) => state.robotStatus);
  const [hzData, setHzData] = useState<Array<{ timestamp: number; hz: number; time: string }>>([]);

  // Performance recording state
  const recordings = usePerformanceStore((state) => state.recordings);
  const selectedRecording = usePerformanceStore((state) => state.selectedRecording);
  const selectedFilename = usePerformanceStore((state) => state.selectedFilename);
  const isLoadingRecordings = usePerformanceStore((state) => state.isLoadingRecordings);
  const isLoadingRecording = usePerformanceStore((state) => state.isLoadingRecording);
  const fetchRecordings = usePerformanceStore((state) => state.fetchRecordings);
  const selectRecording = usePerformanceStore((state) => state.selectRecording);
  const deleteRecording = usePerformanceStore((state) => state.deleteRecording);

  // Motion recording store
  const motionRecordings = useMotionRecordingStore((state) => state.recordings);
  const selectedMotionRecording = useMotionRecordingStore((state) => state.selectedRecording);
  const selectedMotionFilename = useMotionRecordingStore((state) => state.selectedFilename);
  const isLoadingMotionRecordings = useMotionRecordingStore((state) => state.isLoadingRecordings);
  const isLoadingMotionRecording = useMotionRecordingStore((state) => state.isLoadingRecording);
  const fetchMotionRecordings = useMotionRecordingStore((state) => state.fetchRecordings);
  const selectMotionRecording = useMotionRecordingStore((state) => state.selectRecording);
  const deleteMotionRecording = useMotionRecordingStore((state) => state.deleteRecording);

  // Load recordings on mount
  useEffect(() => {
    fetchRecordings();
    fetchMotionRecordings();
  }, [fetchRecordings, fetchMotionRecordings]);

  // Update live Hz data
  useEffect(() => {
    const hz = robotStatus?.commander_hz;
    if (hz !== null && hz !== undefined) {
      const now = Date.now();
      const timeStr = new Date(now).toLocaleTimeString('en-US', { hour12: false });

      setHzData(prev => {
        const newPoint = { timestamp: now, hz, time: timeStr };
        const updated = [...prev, newPoint];

        // Keep only last 60 seconds of data
        const cutoff = now - 60000;
        return updated.filter(d => d.timestamp >= cutoff);
      });
    }
  }, [robotStatus?.commander_hz]);

  // Calculate live statistics
  const currentHz = robotStatus?.commander_hz ?? 0;
  const avgHz = hzData.length > 0
    ? hzData.reduce((sum, d) => sum + d.hz, 0) / hzData.length
    : 0;
  const minHz = hzData.length > 0 ? Math.min(...hzData.map(d => d.hz)) : 0;
  const maxHz = hzData.length > 0 ? Math.max(...hzData.map(d => d.hz)) : 0;

  // Process recording data for charts
  const processRecordingForCharts = () => {
    if (!selectedRecording) return { barData: [], hzData: [] };

    // Aggregate all samples from all commands
    const allSamples = selectedRecording.commands.flatMap(cmd => cmd.samples);

    // Group into max 100 bars
    const maxBars = 100;
    const samplesPerBar = Math.ceil(allSamples.length / maxBars);
    const barData = [];

    for (let i = 0; i < allSamples.length; i += samplesPerBar) {
      const group = allSamples.slice(i, i + samplesPerBar);

      // Average the phase times
      const avgNetwork = group.reduce((sum, s) => sum + s.network, 0) / group.length;
      const avgProcessing = group.reduce((sum, s) => sum + s.processing, 0) / group.length;
      const avgExecution = group.reduce((sum, s) => sum + s.execution, 0) / group.length;
      const avgSerial = group.reduce((sum, s) => sum + s.serial, 0) / group.length;
      const avgIkManip = group.reduce((sum, s) => sum + (s.ik_manipulability || 0), 0) / group.length;
      const avgIkSolve = group.reduce((sum, s) => sum + (s.ik_solve || 0), 0) / group.length;

      // Use timestamp from first sample in group (convert ms to s)
      const firstSample = group[0];
      const time = firstSample.timestamp_ms !== undefined
        ? firstSample.timestamp_ms / 1000
        : (i / allSamples.length) * (selectedRecording.commands.reduce((sum, cmd) => sum + cmd.duration_s, 0));

      barData.push({
        time: Number(time.toFixed(2)),
        network: Number(avgNetwork.toFixed(2)),
        processing: Number(avgProcessing.toFixed(2)),
        execution: Number(avgExecution.toFixed(2)),
        serial: Number(avgSerial.toFixed(2)),
        ik_manipulability: Number(avgIkManip.toFixed(2)),
        ik_solve: Number(avgIkSolve.toFixed(2)),
      });
    }

    // Hz data - use numeric timestamp for proper time axis
    const totalDuration = selectedRecording.commands.reduce((sum, cmd) => sum + cmd.duration_s, 0);
    const hzData = allSamples.map((sample, idx) => ({
      index: idx,
      time: sample.timestamp_ms !== undefined
        ? Number((sample.timestamp_ms / 1000).toFixed(2))
        : Number(((idx / allSamples.length) * totalDuration).toFixed(2)),
      hz: sample.hz ?? 0,
    }));

    return { barData, hzData };
  };

  const { barData, hzData: recordingHzData } = processRecordingForCharts();

  // Process motion recording data for joint comparison charts
  const processMotionRecordingForCharts = () => {
    if (!selectedMotionRecording) return { jointData: [] as Array<Array<{ time: number; commanded?: number; position_out: number; position_in: number }>> };

    // Create data for each joint (6 arrays, one per joint)
    const jointData: Array<Array<{ time: number; commanded?: number; position_out: number; position_in: number }>> = [[], [], [], [], [], []];

    // Process commander state samples (Position_out and Position_in)
    const commanderSamples = selectedMotionRecording.commander_state || [];

    // Downsample if too many points (keep ~500 points max for chart performance)
    const maxPoints = 500;
    const step = Math.max(1, Math.floor(commanderSamples.length / maxPoints));

    for (let i = 0; i < commanderSamples.length; i += step) {
      const sample = commanderSamples[i];
      const time = sample.timestamp_ms / 1000; // Convert to seconds

      for (let j = 0; j < 6; j++) {
        jointData[j].push({
          time: Number(time.toFixed(3)),
          position_out: sample.position_out[j],
          position_in: sample.position_in[j],
        });
      }
    }

    // Add commanded samples as discrete points (they're sparse - only at keyframe crossings)
    const commandedSamples = selectedMotionRecording.commanded || [];
    commandedSamples.forEach(cmd => {
      const time = cmd.t;
      for (let j = 0; j < 6; j++) {
        // Find the nearest commander sample and add commanded value to it
        const nearestIdx = jointData[j].findIndex(pt => pt.time >= time);
        if (nearestIdx !== -1 && jointData[j][nearestIdx]) {
          jointData[j][nearestIdx].commanded = cmd.joints[j];
        } else if (jointData[j].length > 0) {
          // If beyond the end, add to last point
          jointData[j][jointData[j].length - 1].commanded = cmd.joints[j];
        }
      }
    });

    return { jointData };
  };

  const { jointData: motionJointData } = processMotionRecordingForCharts();

  // Build unified session list from both performance and motion recordings
  // Sessions now share the same name (e.g., session_20251130_171500.json)
  const unifiedSessions = (() => {
    const sessionMap = new Map<string, { name: string; timestamp: string; hasPerf: boolean; hasMotion: boolean; perfFile: string | null; motionFile: string | null }>();

    // Add performance recordings
    recordings.forEach(rec => {
      const baseName = rec.filename.replace('.json', '');
      sessionMap.set(baseName, {
        name: rec.name,
        timestamp: rec.timestamp,
        hasPerf: true,
        hasMotion: false,
        perfFile: rec.filename,
        motionFile: null,
      });
    });

    // Add/merge motion recordings
    motionRecordings.forEach(rec => {
      const baseName = rec.filename.replace('.json', '');
      const existing = sessionMap.get(baseName);
      if (existing) {
        existing.hasMotion = true;
        existing.motionFile = rec.filename;
      } else {
        sessionMap.set(baseName, {
          name: rec.name,
          timestamp: rec.timestamp,
          hasPerf: false,
          hasMotion: true,
          perfFile: null,
          motionFile: rec.filename,
        });
      }
    });

    // Sort by timestamp descending (newest first)
    return Array.from(sessionMap.entries())
      .sort((a, b) => new Date(b[1].timestamp).getTime() - new Date(a[1].timestamp).getTime());
  })();

  // Get currently selected session name
  const selectedSessionName = selectedFilename?.replace('.json', '') || selectedMotionFilename?.replace('.json', '') || null;

  // Handle unified session selection - load both performance and motion data
  const handleSessionSelect = (sessionName: string) => {
    if (sessionName === 'none') {
      selectRecording(null);
      selectMotionRecording(null);
    } else {
      const session = unifiedSessions.find(([name]) => name === sessionName);
      if (session) {
        const [, data] = session;
        if (data.perfFile) selectRecording(data.perfFile);
        else selectRecording(null);
        if (data.motionFile) selectMotionRecording(data.motionFile);
        else selectMotionRecording(null);
      }
    }
  };

  // Handle delete - delete both files for the session
  const handleDelete = async () => {
    const session = unifiedSessions.find(([name]) => name === selectedSessionName);
    if (!session) return;

    const [, data] = session;
    if (confirm(`Delete session "${data.name}"? This will delete both performance and motion recordings.`)) {
      if (data.perfFile) await deleteRecording(data.perfFile);
      if (data.motionFile) await deleteMotionRecording(data.motionFile);
    }
  };

  // Handle export - export both files
  const handleExport = () => {
    // Export performance recording
    if (selectedRecording && selectedFilename) {
      const dataStr = JSON.stringify(selectedRecording, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `perf_${selectedFilename}`;
      link.click();
      URL.revokeObjectURL(url);
    }
    // Export motion recording
    if (selectedMotionRecording && selectedMotionFilename) {
      const dataStr = JSON.stringify(selectedMotionRecording, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `motion_${selectedMotionFilename}`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  // Refresh both recording lists
  const handleRefresh = () => {
    fetchRecordings();
    fetchMotionRecordings();
  };

  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Live Performance Monitoring */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Live Performance Monitoring</h2>

          {/* Statistics Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Current</div>
              <div className="text-2xl font-bold">{currentHz.toFixed(1)} Hz</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Average (60s)</div>
              <div className="text-2xl font-bold">{avgHz.toFixed(1)} Hz</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Min (60s)</div>
              <div className="text-2xl font-bold text-orange-500">{minHz.toFixed(1)} Hz</div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Max (60s)</div>
              <div className="text-2xl font-bold text-green-500">{maxHz.toFixed(1)} Hz</div>
            </Card>
          </div>

          {/* Live Line Chart */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Commander Loop Frequency (Last 60 Seconds)</h3>
            <ChartContainer
              config={{
                hz: {
                  label: "Frequency",
                  color: "hsl(var(--chart-1))",
                },
              }}
              className="h-[300px] w-full"
            >
              <LineChart data={hzData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="time"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 120]}
                  label={{ value: 'Hz', angle: -90, position: 'insideLeft' }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ReferenceLine
                  y={100}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{ value: 'Target (100 Hz)', position: 'right', fill: 'hsl(var(--muted-foreground))' }}
                />
                <Line
                  type="monotone"
                  dataKey="hz"
                  stroke="var(--color-hz)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>

            {hzData.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                Waiting for data...
              </div>
            )}
          </Card>
        </div>

        {/* Recording Analysis */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Recording Analysis</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoadingRecordings || isLoadingMotionRecordings}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${(isLoadingRecordings || isLoadingMotionRecordings) ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Unified Session Selector */}
          <Card className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Select Recording Session</label>
                <Select value={selectedSessionName || 'none'} onValueChange={handleSessionSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a recording session..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {unifiedSessions.map(([sessionName, data]) => (
                      <SelectItem key={sessionName} value={sessionName}>
                        {data.name} ({new Date(data.timestamp).toLocaleString()})
                        {data.hasPerf && data.hasMotion ? ' [Perf + Motion]' : data.hasPerf ? ' [Perf only]' : ' [Motion only]'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedSessionName && (
                <div className="flex gap-2 pt-6">
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                  <Button variant="destructive" size="sm" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* Recording Charts */}
          {selectedRecording && (
            <>
              {/* Phase Breakdown Bar Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Phase Breakdown (Stacked)</h3>
                <ChartContainer
                  config={{
                    network: {
                      label: "Network",
                      color: "hsl(var(--chart-1))",
                    },
                    processing: {
                      label: "Processing",
                      color: "hsl(var(--chart-2))",
                    },
                    execution: {
                      label: "Execution",
                      color: "hsl(var(--chart-3))",
                    },
                    serial: {
                      label: "Serial",
                      color: "hsl(var(--chart-4))",
                    },
                    ik_manipulability: {
                      label: "IK Manipulability",
                      color: "hsl(var(--chart-5))",
                    },
                    ik_solve: {
                      label: "IK Solve",
                      color: "hsl(30, 80%, 50%)",
                    },
                  }}
                  className="h-[400px] w-full"
                >
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
                      tickFormatter={(value) => value.toFixed(1)}
                    />
                    <YAxis
                      label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft' }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="network" stackId="a" fill="var(--color-network)" />
                    <Bar dataKey="processing" stackId="a" fill="var(--color-processing)" />
                    <Bar dataKey="execution" stackId="a" fill="var(--color-execution)" />
                    <Bar dataKey="ik_manipulability" stackId="a" fill="var(--color-ik_manipulability)" />
                    <Bar dataKey="ik_solve" stackId="a" fill="var(--color-ik_solve)" />
                    <Bar dataKey="serial" stackId="a" fill="var(--color-serial)" />
                  </BarChart>
                </ChartContainer>
              </Card>

              {/* Recording Hz Chart */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Frequency During Recording</h3>
                <ChartContainer
                  config={{
                    hz: {
                      label: "Frequency",
                      color: "hsl(var(--chart-5))",
                    },
                  }}
                  className="h-[300px] w-full"
                >
                  <LineChart data={recordingHzData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="time"
                      label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
                      tickFormatter={(value) => value.toFixed(1)}
                    />
                    <YAxis
                      domain={[0, 120]}
                      label={{ value: 'Hz', angle: -90, position: 'insideLeft' }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ReferenceLine
                      y={100}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="5 5"
                      strokeWidth={2}
                      label={{ value: 'Target (100 Hz)', position: 'right', fill: 'hsl(var(--muted-foreground))' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hz"
                      stroke="var(--color-hz)"
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ChartContainer>
              </Card>

              {/* Recording Statistics */}
              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-3">Recording Details</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Total Commands</div>
                    <div className="text-lg font-semibold">{selectedRecording.commands.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Duration</div>
                    <div className="text-lg font-semibold">
                      {selectedRecording.commands.reduce((sum, cmd) => sum + cmd.duration_s, 0).toFixed(2)}s
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Total Cycles</div>
                    <div className="text-lg font-semibold">
                      {selectedRecording.commands.reduce((sum, cmd) => sum + cmd.num_cycles, 0)}
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}

          {!selectedRecording && recordings.length > 0 && (
            <Card className="p-8">
              <div className="text-center text-muted-foreground">
                Select a recording to view detailed analysis
              </div>
            </Card>
          )}

          {recordings.length === 0 && !isLoadingRecordings && (
            <Card className="p-8">
              <div className="text-center text-muted-foreground">
                No recordings available. Start recording to capture performance data.
              </div>
            </Card>
          )}
        </div>

        {/* Motion Comparison Section */}
        <div className="space-y-4 pt-4 border-t">
          <h2 className="text-xl font-semibold">Motion Comparison</h2>

          <p className="text-sm text-muted-foreground">
            Compare commanded joint angles vs actual motor positions during timeline playback.
            Select a recording session above to view motion data.
          </p>

          {/* Joint Comparison Charts */}
          {selectedMotionRecording && motionJointData.length > 0 && (
            <>
              {/* Shared Legend */}
              <Card className="p-4">
                <div className="flex items-center gap-6 justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-blue-500" />
                    <span className="text-sm">Commanded (API Target)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-orange-500" style={{ borderTop: '2px dashed' }} />
                    <span className="text-sm">Position Out (To Motors)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-green-500" style={{ borderTop: '2px dotted' }} />
                    <span className="text-sm">Position In (Feedback)</span>
                  </div>
                </div>
              </Card>

              {/* 6 Joint Charts */}
              {JOINT_NAMES.map((jointName, jointIndex) => (
                <Card key={jointIndex} className="p-6">
                  <h3 className="text-lg font-semibold mb-4">{jointName}</h3>
                  <ChartContainer
                    config={{
                      commanded: {
                        label: "Commanded",
                        color: "hsl(217, 91%, 60%)",
                      },
                      position_out: {
                        label: "Position Out",
                        color: "hsl(25, 95%, 53%)",
                      },
                      position_in: {
                        label: "Position In",
                        color: "hsl(142, 76%, 36%)",
                      },
                    }}
                    className="h-[200px] w-full"
                  >
                    <LineChart data={motionJointData[jointIndex] || []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="time"
                        label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
                        tickFormatter={(value) => value.toFixed(1)}
                      />
                      <YAxis
                        label={{ value: 'Angle (°)', angle: -90, position: 'insideLeft' }}
                        domain={['auto', 'auto']}
                      />
                      <ChartTooltip
                        content={<ChartTooltipContent />}
                        labelFormatter={(value) => `Time: ${Number(value).toFixed(2)}s`}
                      />
                      {/* Position Out - dashed orange */}
                      <Line
                        type="monotone"
                        dataKey="position_out"
                        stroke="var(--color-position_out)"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                        isAnimationActive={false}
                      />
                      {/* Position In - dotted green */}
                      <Line
                        type="monotone"
                        dataKey="position_in"
                        stroke="var(--color-position_in)"
                        strokeWidth={2}
                        strokeDasharray="2 2"
                        dot={false}
                        isAnimationActive={false}
                      />
                      {/* Commanded - solid blue with dots (sparse data) */}
                      <Line
                        type="stepAfter"
                        dataKey="commanded"
                        stroke="var(--color-commanded)"
                        strokeWidth={2}
                        dot={{ r: 4 }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ChartContainer>
                </Card>
              ))}

              {/* Recording Statistics */}
              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-3">Motion Recording Details</h3>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Duration</div>
                    <div className="text-lg font-semibold">{selectedMotionRecording.metadata.duration_s.toFixed(2)}s</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Sample Rate</div>
                    <div className="text-lg font-semibold">{selectedMotionRecording.metadata.sample_rate_hz} Hz</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Commander Samples</div>
                    <div className="text-lg font-semibold">{selectedMotionRecording.metadata.num_samples}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Commanded Points</div>
                    <div className="text-lg font-semibold">{selectedMotionRecording.commanded?.length || 0}</div>
                  </div>
                </div>
              </Card>
            </>
          )}

          {!selectedMotionRecording && motionRecordings.length > 0 && (
            <Card className="p-8">
              <div className="text-center text-muted-foreground">
                Select a motion recording to view joint comparison charts
              </div>
            </Card>
          )}

          {motionRecordings.length === 0 && !isLoadingMotionRecordings && (
            <Card className="p-8">
              <div className="text-center text-muted-foreground">
                No motion recordings available. Play a timeline with &quot;Execute on Robot&quot; to capture motion data.
              </div>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
