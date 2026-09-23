import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Key, Cpu, Save, Eye, EyeOff } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useComingSoon } from '@/hooks/useComingSoon';

const fontFamily = {
  mono: '"JetBrains Mono", monospace',
};

const SystemSettings: React.FC = () => {
  const [showApiKey, setShowApiKey] = useState(false);
  const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(4);
  const [maxRepoSizeGb, setMaxRepoSizeGb] = useState(10);
  const notifyComingSoon = useComingSoon();

  return (
    <DashboardLayout>
      <div className="max-w-[900px] mx-auto space-y-10">

        {/* HEADER */}
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-[#f4f4f6] mb-2">Repository &amp; Extraction Config</h2>
          <p className="text-[#94a3b8] text-sm max-w-xl leading-relaxed">
            Manage repository authorization and configure extraction parameters for the analysis pipeline.
          </p>
          <div className="h-[1px] w-full bg-gradient-to-r from-[#222c37] to-transparent mt-8"></div>
        </div>

        {/* REPOSITORY AUTHORIZATION */}
        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-1" style={{ fontFamily: fontFamily.mono }}>Repository Authorization</h3>
          <p className="text-xs text-[#5f636b] mb-4">Authorize which source providers the mining pipeline can access.</p>

          <div className="bg-[#161d24] border border-[#222c37] divide-y divide-[#222c37]">
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <Icon icon="mdi:github" width="24" height="24" className="text-[#f4f4f6]" />
                <div>
                  <div className="text-sm text-[#f4f4f6] font-medium">GitHub</div>
                  <div className="text-xs text-[#5f636b]">Connected as archtime-bot</div>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[#22c55e] uppercase tracking-widest" style={{ fontFamily: fontFamily.mono }}>Connected</span>
            </div>
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <Icon icon="mdi:gitlab" width="24" height="24" className="text-[#FC6D26]" />
                <div>
                  <div className="text-sm text-[#f4f4f6] font-medium">GitLab</div>
                  <div className="text-xs text-[#5f636b]">Not connected</div>
                </div>
              </div>
              <button
                onClick={() => notifyComingSoon("GitLab connection")}
                className="h-8 px-4 bg-[#11161b] border border-[#222c37] hover:border-[#38bdf8]/50 text-[#38bdf8] text-[10px] font-bold transition-colors" style={{ fontFamily: fontFamily.mono }}>
                CONNECT
              </button>
            </div>
          </div>
        </section>

        {/* API KEYS */}
        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-1" style={{ fontFamily: fontFamily.mono }}>API Keys</h3>
          <p className="text-xs text-[#5f636b] mb-4">Credentials used by the analysis pipeline and external clients.</p>

          <div className="bg-[#161d24] border border-[#222c37] p-5">
            <label className="text-[10px] text-[#94a3b8] uppercase tracking-widest block mb-2" style={{ fontFamily: fontFamily.mono }}>Pipeline API Key</label>
            <div className="relative">
              <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f636b]" />
              <input
                type={showApiKey ? 'text' : 'password'}
                readOnly
                value="at_live_9f2c1e8d4b7a5f3c0e6d1a9b2c4e7f80"
                className="w-full h-10 bg-[#0b0f14] border border-[#222c37] pl-9 pr-10 text-xs text-[#f4f4f6] tracking-wider focus:outline-none"
                style={{ fontFamily: fontFamily.mono }}
              />
              <button
                type="button"
                onClick={() => setShowApiKey((v) => !v)}
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5f636b] hover:text-[#f4f4f6] transition-colors"
              >
                {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[10px] text-[#5f636b] mt-2">Last rotated 14 days ago</p>
          </div>
        </section>

        {/* EXTRACTION PARAMETERS */}
        <section>
          <h3 className="text-sm font-bold text-[#f4f4f6] tracking-tight uppercase mb-1" style={{ fontFamily: fontFamily.mono }}>Extraction Parameters</h3>
          <p className="text-xs text-[#5f636b] mb-4">Control how the mining pipeline extracts and processes repositories.</p>

          <div className="bg-[#161d24] border border-[#222c37] divide-y divide-[#222c37]">
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="max-concurrent-jobs" className="text-sm text-[#f4f4f6] font-medium flex items-center gap-2">
                  <Cpu size={14} className="text-[#38bdf8]" />
                  Max Concurrent Analysis Jobs
                </label>
                <span className="text-sm font-bold text-[#38bdf8]" style={{ fontFamily: fontFamily.mono }}>{maxConcurrentJobs}</span>
              </div>
              <input
                id="max-concurrent-jobs"
                type="range"
                min={1}
                max={16}
                value={maxConcurrentJobs}
                onChange={(e) => setMaxConcurrentJobs(Number(e.target.value))}
                aria-valuetext={`${maxConcurrentJobs} concurrent jobs`}
                className="w-full accent-[#38bdf8]"
              />
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="max-repo-size" className="text-sm text-[#f4f4f6] font-medium flex items-center gap-2">
                  <Key size={14} className="text-[#ffb03a]" />
                  Max Repository Size (GB)
                </label>
                <span className="text-sm font-bold text-[#ffb03a]" style={{ fontFamily: fontFamily.mono }}>{maxRepoSizeGb}</span>
              </div>
              <input
                id="max-repo-size"
                type="range"
                min={1}
                max={50}
                value={maxRepoSizeGb}
                onChange={(e) => setMaxRepoSizeGb(Number(e.target.value))}
                aria-valuetext={`${maxRepoSizeGb} gigabytes`}
                className="w-full accent-[#ffb03a]"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            onClick={() => notifyComingSoon("Saving configuration changes")}
            className="h-10 px-6 bg-[#38bdf8] hover:bg-[#38bdf8]/90 text-[#080b0e] font-bold text-xs transition-colors flex items-center gap-2" style={{ fontFamily: fontFamily.mono }}>
            <Save size={14} />
            SAVE CHANGES
          </button>
        </div>

        <div className="h-10"></div>
      </div>
    </DashboardLayout>
  );
};

export default SystemSettings;
