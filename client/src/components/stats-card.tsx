interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  changeType: "positive" | "negative";
  icon: string;
}

export default function StatsCard({ title, value, change, changeType, icon }: StatsCardProps) {
  return (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <i className={`${icon} text-gray-400 text-lg`}></i>
          </div>
          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
              <dd className="text-lg font-medium text-gray-900">{value}</dd>
            </dl>
          </div>
        </div>
      </div>
      <div className="bg-gray-50 px-5 py-3">
        <div className="text-sm">
          <span className={`font-medium ${changeType === "positive" ? "text-green-600" : "text-red-600"}`}>
            {change}
          </span>
          <span className="text-gray-500"> from last month</span>
        </div>
      </div>
    </div>
  );
}
