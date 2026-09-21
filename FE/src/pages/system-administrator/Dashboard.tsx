import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Server,
  Database,
  Cpu,
  HardDrive,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

const mockMeters = [
  { label: 'CPU Load', value: 42, unit: '%', color: '#38bdf8' },
  { label: 'Memory', value: 68, unit: '%', color: '#ffb03a' },
  { label: 'Disk I/O', value: 23, unit: '%', color: '#38bdf8' },
  { label: 'Analysis Queue', value: 87, unit: '%', color: '#ef4444' },
];

const mockServices = [
  { name: 'API Gateway', status: 'operational' as const, latency: '42ms' },
  { name: 'Analysis Pipeline', status: 'operational' as const, latency: '128ms' },
  { name: 'PostgreSQL Primary', status: 'operational' as const, latency: '8ms' },
  { name: 'Git Mining Worker', status: 'degraded' as const, latency: '890ms' },
  { name: 'AST Parser Service', status: 'operational' as const, latency: '65ms' },
  { name: 'Background Job Queue', status: 'outage' as const, latency: '—' },
];

const mockLogStream = [
  { level: 'info', ts: '14:32:08', message: 'Analysis job a3f21c completed for repo ecomm-core' },
  { level: 'warn', ts: '14:31:54', message: 'Git Mining Worker response time exceeded 800ms threshold' },
  { level: 'info', ts: '14:31:20', message: 'New user session started: m.nguyen' },
  { level: 'error', ts: '14:30:47', message: 'Background Job Queue: connection refused, retrying (3/5)' },
  { level: 'info', ts: '14:30:02', message: 'Database backup completed: archtime_prod_20260921' },
  { level: 'info', ts: '14:29:18', message: 'Analysis job 8af31c queued for repo catalog-service' },
];

const statusMeta = {
  operational: { label: 'OPERATIONAL', color: '#22c55e', icon: CheckCircle2 },
  degraded: { label: 'DEGRADED', color: '#ffb03a', icon: AlertTriangle },
  outage: { label: 'OUTAGE', color: '#ef4444', icon: XCircle },
};

const logLevelColor: Record<string, string> = {
  info: '#94a3b8',
  warn: '#ffb03a',
  error: '#ef4444',
};

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function GaugeMeter({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  const offset = CIRCUMFERENCE - (value / 100) * CIRCUMFERENCE;
  return (
    <div className="bg-[#161d24] border border-[#222c37] p-5 flex flex-col items-center">
      <div className="relative w-24 h-24 mb-3">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#222c37" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-[#f4f4f6]" style={{ fontFamily: fontFamily.mono }}>
            {value}{unit}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-[#94a3b8] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>
        {label}
      </span>
    </div>
  );
}

const SystemAdministratorDashboard: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="max-w-[1400px] mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#161d24] border border-[#222c37] mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-[#22c55e] shadow-[0_0_5px_#22c55e]"></div>
            <span
              className="text-[10px] text-[#38bdf8] tracking-wider font-semibold uppercase"
              style={{ fontFamily: fontFamily.mono }}
            >
              System Administrator Workspace
            </span>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">System &amp; infrastructure health</h2>
              <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
                Monitor resource usage, service status, and live system events across the ArchTime platform.
              </p>
            </div>
            <div className="shrink-0 h-10 px-5 bg-[#161d24] border border-[#222c37] text-[#94a3b8] text-xs flex items-center gap-2" style={{ fontFamily: fontFamily.mono }}>
              <Server size={16} className="text-[#22c55e]" />
              UPTIME 99.94% &middot; 47d 12h
            </div>
          </div>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* RESOURCE GAUGES */}
        <section>
          <div className="mb-6 flex items-center gap-2">
            <Cpu size={18} className="text-[#38bdf8]" />
            <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Resource Usage</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {mockMeters.map((meter) => (
              <GaugeMeter key={meter.label} {...meter} />
            ))}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

          {/* SERVICE STATUS GRID */}
          <section className="lg:col-span-2">
            <div className="mb-6 flex items-center gap-2">
              <Database size={18} className="text-[#38bdf8]" />
              <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">Service Status</h3>
            </div>

            <div className="space-y-2">
              {mockServices.map((service) => {
                const meta = statusMeta[service.status];
                const StatusIcon = meta.icon;
                return (
                  <div
                    key={service.name}
                    className="bg-[#11161b] border border-[#222c37] px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon size={16} style={{ color: meta.color }} className="shrink-0" />
                      <span className="text-sm text-[#f4f4f6] font-medium truncate">{service.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>{service.latency}</span>
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 border"
                        style={{
                          fontFamily: fontFamily.mono,
                          color: meta.color,
                          borderColor: `${meta.color}33`,
                          backgroundColor: `${meta.color}1A`,
                        }}
                      >
                        {meta.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* LIVE LOG STREAM */}
          <section className="lg:col-span-3">
            <div className="mb-6 flex items-center gap-2">
              <Activity size={18} className="text-[#38bdf8]" />
              <h3 className="text-xl font-bold text-[#f4f4f6] tracking-tight">System Event Log</h3>
            </div>

            <div className="bg-[#0b0f14] border border-[#222c37] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[#222c37] bg-[#161d24] px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/40" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500/40" />
                <span className="ml-2 text-xs text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>
                  system.log &middot; live tail
                </span>
              </div>
              <div className="p-4 space-y-2 text-xs max-h-[340px] overflow-y-auto" style={{ fontFamily: fontFamily.mono }}>
                {mockLogStream.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="text-[#5f636b] shrink-0">{entry.ts}</span>
                    <span
                      className="shrink-0 uppercase font-bold w-12"
                      style={{ color: logLevelColor[entry.level] }}
                    >
                      {entry.level}
                    </span>
                    <span className="text-[#94a3b8]">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* STORAGE FOOTER */}
        <section>
          <div className="bg-[#161d24] border border-[#222c37] p-5 flex items-center gap-6">
            <HardDrive size={24} className="text-[#38bdf8] shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-[#f4f4f6] font-medium">Repository Storage</span>
                <span className="text-xs text-[#5f636b]" style={{ fontFamily: fontFamily.mono }}>312 GB / 500 GB</span>
              </div>
              <div className="h-1.5 w-full bg-[#0b0f14] overflow-hidden">
                <div className="h-full bg-[#38bdf8]" style={{ width: '62%' }}></div>
              </div>
            </div>
          </div>
        </section>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default SystemAdministratorDashboard;
