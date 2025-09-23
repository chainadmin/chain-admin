interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative";
  icon: string;
}

export default function StatsCard({ title, value, change, changeType, icon }: StatsCardProps) {
  const changeColor = changeType === "positive" ? "text-emerald-300" : "text-rose-300";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg shadow-blue-900/20 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400" />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-blue-100/70">{title}</p>
          <p className="mt-4 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-sky-400/20 to-indigo-500/20 text-white">
          <i className={`${icon} text-lg`}></i>
        </div>
      </div>
      <p className="relative z-10 mt-6 text-xs font-medium text-blue-100/70">
        <span className={`${changeColor} mr-1 font-semibold`}>{change}</span>
        vs last month
      </p>
    </div>
  );
}
