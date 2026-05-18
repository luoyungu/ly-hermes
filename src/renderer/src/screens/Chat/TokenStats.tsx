import { useState, useEffect } from 'react';
import type { TokenStats as TokenStatsType } from '../../../../preload/index';

const DAYS_OPTIONS = [
  { label: '7天', value: 7 },
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
];

function formatNumber(num: number | undefined | null): string {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatCost(cost: number | undefined | null): string {
  if (!cost) return '$0.00';
  return '$' + cost.toFixed(4);
}

function ProgressBar({ percentage, color }: { percentage: number; color: string }) {
  return (
    <div className="w-full h-2 bg-[var(--bg-hover)] rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(percentage, 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function StatsCard({ title, value, subtitle, icon }: {
  title: string
  value: string
  subtitle?: string
  icon: string
}) {
  return (
    <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-xs text-[var(--text-dim)]">{title}</span>
      </div>
      <div className="text-xl font-bold text-[var(--text-primary)]">{value}</div>
      {subtitle && <div className="text-xs text-[var(--text-dim)] mt-1">{subtitle}</div>}
    </div>
  );
}

function ListItem({ label, value, percentage, color }: {
  label: string
  value: string
  percentage: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-[var(--text-primary)] truncate">{label}</span>
          <span className="text-xs text-[var(--text-dim)] ml-2 shrink-0">{value}</span>
        </div>
        <ProgressBar percentage={percentage} color={color} />
      </div>
    </div>
  );
}

function ChartBar({ date, value, maxValue }: { date: string; value: number; maxValue: number }) {
  const height = maxValue > 0 ? Math.max((value / maxValue) * 100, 5) : 5;
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-full flex flex-col items-center justify-end" style={{ height: 60 }}>
        <div
          className="w-4 rounded-sm bg-[var(--accent)] opacity-80 transition-all hover:opacity-100"
          style={{ height: `${height}%` }}
        />
      </div>
      <span className="text-[10px] text-[var(--text-dim)]">{date.slice(5)}</span>
    </div>
  );
}

export function TokenStats() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<TokenStatsType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [days]);

  async function loadStats() {
    setLoading(true);
    try {
      const data = await window.hermesAPI.getTokenStats(days);
      setStats(data);
    } catch (e) {
      console.error('Failed to load token stats:', e);
    } finally {
      setLoading(false);
    }
  }

  const totals = stats?.totals || {};
  const inputTokens = (totals.total_input as number) || 0;
  const outputTokens = (totals.total_output as number) || 0;
  const cacheTokens = (totals.total_cache_read as number) || 0;
  const totalTokens = inputTokens + outputTokens;
  const estimatedCost = (totals.total_estimated_cost as number) || 0;

  const byModel = stats?.byModel || [];
  const modelColors = ['#7c6af9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
  const totalModelTokens = byModel.reduce((sum, m) => {
    return sum + ((m.input_tokens as number) || 0) + ((m.output_tokens as number) || 0);
  }, 0);

  const byAgent = stats?.byAgent || [];

  const daily = stats?.daily || [];
  const maxDailyValue = Math.max(...daily.map(d => {
    return ((d.input_tokens as number) || 0) + ((d.output_tokens as number) || 0);
  }), 1);

  return (
    <div className="h-full flex flex-col bg-transparent overflow-hidden">
      {/* Header */}
      <div className="drag-region flex items-center justify-between px-4 glass-medium shrink-0 border-b border-[var(--border)]"
        style={{ paddingTop: 44, paddingBottom: 12 }}>
        <div>
          <h2 className="text-base font-bold text-accent-gradient" style={{ letterSpacing: '-0.3px' }}>
            📊 Token 使用统计
          </h2>
          <p className="text-xs text-[var(--text-dim)]">查看 Token 消耗分布</p>
        </div>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                days === opt.value
                  ? 'bg-[var(--accent)] text-white shadow-[0_2px_8px_var(--accent-glow)]'
                  : 'glass-medium border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Overview Cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatsCard
                title="输入 Token"
                value={formatNumber(inputTokens)}
                subtitle={`${((inputTokens / (totalTokens || 1)) * 100).toFixed(1)}%`}
                icon="📥"
              />
              <StatsCard
                title="输出 Token"
                value={formatNumber(outputTokens)}
                subtitle={`${((outputTokens / (totalTokens || 1)) * 100).toFixed(1)}%`}
                icon="📤"
              />
              <StatsCard
                title="缓存读取"
                value={formatNumber(cacheTokens)}
                icon="💾"
              />
              <StatsCard
                title="预估费用"
                value={formatCost(estimatedCost)}
                icon="💰"
              />
            </div>

            {/* Two Column Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* By Model */}
              <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <span>🤖</span> 按模型
                </h3>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {byModel.length === 0 ? (
                    <div className="text-center py-4 text-[var(--text-dim)] text-sm">暂无数据</div>
                  ) : (
                    byModel.map((model, idx) => {
                      const modelTokens = ((model.input_tokens as number) || 0) + ((model.output_tokens as number) || 0);
                      const pct = totalModelTokens > 0 ? Math.round((modelTokens / totalModelTokens) * 100) : 0;
                      return (
                        <ListItem
                          key={idx}
                          label={(model.model as string) || 'Unknown'}
                          value={formatNumber(modelTokens)}
                          percentage={pct}
                          color={modelColors[idx % modelColors.length]}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              {/* By Agent */}
              <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                  <span>👤</span> 按 Agent
                </h3>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {byAgent.length === 0 ? (
                    <div className="text-center py-4 text-[var(--text-dim)] text-sm">暂无数据</div>
                  ) : (
                    byAgent.map((agent, idx) => {
                      const agentTokens = ((agent.input_tokens as number) || 0) + ((agent.output_tokens as number) || 0);
                      return (
                        <ListItem
                          key={idx}
                          label={(agent.agent as string) || 'Unknown'}
                          value={formatNumber(agentTokens)}
                          percentage={(agent.percentage as number) || 0}
                          color={modelColors[idx % modelColors.length]}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Daily Trend */}
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3 flex items-center gap-2">
                <span>📈</span> 每日趋势
              </h3>
              {daily.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-dim)] text-sm">暂无数据</div>
              ) : (
                <div className="flex items-end gap-1 overflow-x-auto pb-2">
                  {daily.slice(-14).map((day, idx) => {
                    const dayTokens = ((day.input_tokens as number) || 0) + ((day.output_tokens as number) || 0);
                    return (
                      <ChartBar
                        key={idx}
                        date={(day.date as string) || ''}
                        value={dayTokens}
                        maxValue={maxDailyValue}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
