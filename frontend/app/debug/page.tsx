'use client';

import { useState, useMemo } from 'react';
import Header from '../components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Search,
  Database,
  RefreshCw
} from 'lucide-react';
import { useInputStore } from '../lib/stores/inputStore';
import { useCommandStore } from '../lib/stores/commandStore';
import { useHardwareStore } from '../lib/stores/hardwareStore';
import { useKinematicsStore } from '../lib/stores/kinematicsStore';
import { useTimelineStore } from '../lib/stores/timelineStore';
import { useRobotConfigStore } from '../lib/stores/robotConfigStore';
import { usePerformanceStore } from '../lib/stores/performanceStore';
import { useMonitoringStore } from '../lib/stores/monitoringStore';

// Type for flattened store data
interface FlattenedEntry {
  key: string;
  value: any;
  type: string;
  storeName: string;
}

export default function DebugPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedStores, setExpandedStores] = useState<Set<string>>(new Set([
    'inputStore',
    'commandStore',
    'hardwareStore'
  ]));

  // Subscribe to all stores
  const inputStore = useInputStore();
  const commandStore = useCommandStore();
  const hardwareStore = useHardwareStore();
  const kinematicsStore = useKinematicsStore();
  const timelineStore = useTimelineStore();
  const robotConfigStore = useRobotConfigStore();
  const performanceStore = usePerformanceStore();
  const monitoringStore = useMonitoringStore();

  // Flatten object into key-value pairs with dot notation
  const flattenObject = (obj: any, prefix = '', storeName: string): FlattenedEntry[] => {
    const entries: FlattenedEntry[] = [];

    for (const [key, value] of Object.entries(obj)) {
      // Skip functions
      if (typeof value === 'function') continue;

      const fullKey = prefix ? `${prefix}.${key}` : key;

      // Get type
      const type = Array.isArray(value) ? 'array' : typeof value;

      if (value === null || value === undefined) {
        entries.push({ key: fullKey, value, type: 'null', storeName });
      } else if (type === 'object' && !Array.isArray(value)) {
        // For objects, add the object itself and recurse
        entries.push({ key: fullKey, value: `{...}`, type: 'object', storeName });
        entries.push(...flattenObject(value, fullKey, storeName));
      } else if (type === 'array') {
        // For arrays, show length and elements
        entries.push({ key: fullKey, value: `[${value.length}]`, type: 'array', storeName });
        if (value.length > 0 && typeof value[0] === 'object') {
          // Show array elements with index
          value.forEach((item: any, idx: number) => {
            if (typeof item === 'object') {
              entries.push(...flattenObject(item, `${fullKey}[${idx}]`, storeName));
            } else {
              entries.push({ key: `${fullKey}[${idx}]`, value: item, type: typeof item, storeName });
            }
          });
        }
      } else {
        entries.push({ key: fullKey, value, type, storeName });
      }
    }

    return entries;
  };

  // Collect all store data
  const allStoreData = useMemo(() => {
    return [
      { name: 'inputStore', data: inputStore },
      { name: 'commandStore', data: commandStore },
      { name: 'hardwareStore', data: hardwareStore },
      { name: 'kinematicsStore', data: kinematicsStore },
      { name: 'timelineStore', data: timelineStore },
      { name: 'robotConfigStore', data: robotConfigStore },
      { name: 'performanceStore', data: performanceStore },
      { name: 'monitoringStore', data: monitoringStore },
    ];
  }, [
    inputStore,
    commandStore,
    hardwareStore,
    kinematicsStore,
    timelineStore,
    robotConfigStore,
    performanceStore,
    monitoringStore,
  ]);

  // Flatten all stores
  const flattenedData = useMemo(() => {
    return allStoreData.flatMap(({ name, data }) => flattenObject(data, '', name));
  }, [allStoreData]);

  // Filter by search query
  const filteredData = useMemo(() => {
    if (!searchQuery) return flattenedData;
    const query = searchQuery.toLowerCase();
    return flattenedData.filter(entry =>
      entry.key.toLowerCase().includes(query) ||
      String(entry.value).toLowerCase().includes(query)
    );
  }, [flattenedData, searchQuery]);

  // Group by store
  const groupedData = useMemo(() => {
    const grouped: Record<string, FlattenedEntry[]> = {};
    filteredData.forEach(entry => {
      if (!grouped[entry.storeName]) {
        grouped[entry.storeName] = [];
      }
      grouped[entry.storeName].push(entry);
    });
    return grouped;
  }, [filteredData]);

  // Toggle store expansion
  const toggleStore = (storeName: string) => {
    const newExpanded = new Set(expandedStores);
    if (newExpanded.has(storeName)) {
      newExpanded.delete(storeName);
    } else {
      newExpanded.add(storeName);
    }
    setExpandedStores(newExpanded);
  };

  // Expand/collapse all
  const expandAll = () => {
    setExpandedStores(new Set(allStoreData.map(s => s.name)));
  };

  const collapseAll = () => {
    setExpandedStores(new Set());
  };

  // Export to JSON
  const exportToJson = () => {
    const exportData: Record<string, any> = {};
    allStoreData.forEach(({ name, data }) => {
      exportData[name] = data;
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `store-snapshot-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Format value for display
  const formatValue = (value: any, type: string): string => {
    if (value === null || value === undefined) return 'null';
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'string') return `"${value}"`;
    if (type === 'number') return value.toFixed(4).replace(/\.?0+$/, '');
    return String(value);
  };

  // Get type badge color
  const getTypeBadgeColor = (type: string): string => {
    switch (type) {
      case 'number': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'string': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'boolean': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'object': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'array': return 'bg-pink-500/20 text-pink-400 border-pink-500/30';
      case 'null': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  return (
    <main className="h-screen flex flex-col bg-background">
      <Header />

      <div className="flex-1 p-4 space-y-4 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6" />
            <h2 className="text-xl font-semibold">Store Inspector</h2>
            <Badge variant="outline" className="font-mono">
              {filteredData.length} values
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={expandAll}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              Collapse All
            </Button>
            <Button variant="outline" size="sm" onClick={exportToJson}>
              <Download className="w-4 h-4 mr-2" />
              Export JSON
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by key or value..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Store Tables */}
        <div className="space-y-3">
          {Object.entries(groupedData).map(([storeName, entries]) => (
            <Card key={storeName} className="overflow-hidden">
              {/* Store Header */}
              <button
                onClick={() => toggleStore(storeName)}
                className="w-full px-4 py-3 flex items-center justify-between bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedStores.has(storeName) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-semibold font-mono">{storeName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {entries.length} values
                  </Badge>
                </div>
              </button>

              {/* Store Data Table */}
              {expandedStores.has(storeName) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-muted/30">
                      <tr className="text-left">
                        <th className="px-4 py-2 font-semibold w-2/5">Key</th>
                        <th className="px-4 py-2 font-semibold w-2/5">Value</th>
                        <th className="px-4 py-2 font-semibold w-1/5">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => (
                        <tr key={`${entry.key}-${idx}`} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                            {entry.key}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs break-all">
                            {formatValue(entry.value, entry.type)}
                          </td>
                          <td className="px-4 py-2">
                            <Badge
                              variant="outline"
                              className={`text-xs font-mono ${getTypeBadgeColor(entry.type)}`}
                            >
                              {entry.type}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* No results */}
        {filteredData.length === 0 && (
          <Card className="p-8">
            <div className="text-center text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No values found matching "{searchQuery}"</p>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
