export function BulletinFilters({
  currentFilter,
  onFilterChange,
}: {
  currentFilter: string;
  onFilterChange: (type: string) => void;
}) {
  const tabs = [
    { id: "ALL", label: "All" },
    { id: "ANNOUNCEMENT", label: "Announcements" },
    { id: "EVENT", label: "Events" },
    { id: "DEADLINE", label: "Deadlines" },
    { id: "URGENT", label: "Urgent" },
    { id: "HOLIDAY", label: "Holidays" },
  ];

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onFilterChange(tab.id)}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
            currentFilter === tab.id
              ? "bg-white/20 text-white shadow-inner border border-white/10"
              : "bg-white/5 text-white/50 border border-white/5 hover:bg-white/10 hover:text-white/80"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
