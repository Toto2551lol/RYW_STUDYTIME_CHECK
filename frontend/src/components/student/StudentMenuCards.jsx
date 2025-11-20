// src/components/student/StudentMenuCards.jsx
import React from "react";
import { motion } from "framer-motion";

const TABS = [
  {
    id: "summary",
    icon: "📊",
    label: "Summary",
  },
  {
    id: "absence",
    icon: "🗓️",
    label: "Absence",
  },
  {
    id: "profile",
    icon: "👤",
    label: "Profile",
  },
];

export default function StudentMenuCards({ activeTab, onChange }) {
  return (
    <nav className="w-full border-b border-slate-700/60 overflow-x-auto">
      <div className="flex min-w-max sm:min-w-0 gap-1 sm:gap-4 px-1 sm:px-0">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              whileHover={{ y: active ? 0 : -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onChange(tab.id)}
              className={`relative flex items-center gap-1 sm:gap-2 px-3 sm:px-4 pt-2 pb-2.5 text-xs sm:text-sm font-medium whitespace-nowrap
              ${
                active
                  ? "text-indigo-300"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <span className="text-base sm:text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
              {/* bottom border for active tab */}
              {active && (
                <motion.span
                  layoutId="student-tab-indicator"
                  className="absolute inset-x-0 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-indigo-400 to-blue-400"
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
