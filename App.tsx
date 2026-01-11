import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";

// Firebase config - loaded from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Utility functions
const generateId = () => Math.random().toString(36).substr(2, 9);

const getMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

// Helper function to check and mark expired debts
const checkAndMarkExpiredDebts = async (debts, completions, db) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const debt of debts) {
    // Skip if already expired or fully paid
    if (debt.expiredAt || (debt.remainingMinutes ?? 0) <= 0) {
      continue;
    }

    // Check if debt is expired
    if (debt.dueDate) {
      const dueDate = new Date(debt.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate < today && (debt.remainingMinutes ?? 0) > 0) {
        // Mark debt as expired
        await updateDoc(doc(db, "debts", debt.id), {
          expiredAt: new Date().toISOString(),
        });
      }
    }
  }
};

// Helper functions for chore and assignment versioning
// Get the chore minutes that were effective on a given date
const getChoreMinutesAtDate = (chore, date: string): number => {
  // If no versioning, return current minutes (backward compatible)
  if (!chore.effectiveDate && !chore.history) {
    return chore.minutes;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Check if current version was effective on this date
  if (chore.effectiveDate) {
    const effectiveDate = new Date(chore.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return chore.minutes; // Current version applies
    }
  }

  // Search history for the version that was active on this date
  if (chore.history && chore.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    const sortedHistory = [...chore.history].sort(
      (a, b) =>
        new Date(b.effectiveDate + "T12:00:00").getTime() -
        new Date(a.effectiveDate + "T12:00:00").getTime()
    );

    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        return version.minutes;
      }
    }
  }

  // Fallback: if no version found, use current minutes
  return chore.minutes;
};

// Get the chore name that was effective on a given date
const getChoreNameAtDate = (chore, date: string): string => {
  // If no versioning, return current name (backward compatible)
  if (!chore.effectiveDate && !chore.history) {
    return chore.name;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Check if current version was effective on this date
  if (chore.effectiveDate) {
    const effectiveDate = new Date(chore.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return chore.name; // Current version applies
    }
  }

  // Search history for the version that was active on this date
  if (chore.history && chore.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    const sortedHistory = [...chore.history].sort(
      (a, b) =>
        new Date(b.effectiveDate + "T12:00:00").getTime() -
        new Date(a.effectiveDate + "T12:00:00").getTime()
    );

    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        // Return the name from history if stored, otherwise use current name
        return version.name !== undefined ? version.name : chore.name;
      }
    }
  }

  // Fallback: if no version found, use current name
  return chore.name;
};

// Get the assignment frequency that was effective on a given date
const getAssignmentFrequencyAtDate = (assignment, date: string): number => {
  // If no versioning, return current frequency (backward compatible)
  if (!assignment.effectiveDate && !assignment.history) {
    return assignment.timesPerMonth;
  }

  // Parse target date
  const targetDate = new Date(date + "T12:00:00");

  // Check if current version was effective on this date
  if (assignment.effectiveDate) {
    const effectiveDate = new Date(assignment.effectiveDate + "T12:00:00");
    if (targetDate >= effectiveDate) {
      return assignment.timesPerMonth; // Current version applies
    }
  }

  // Search history for the version that was active on this date
  if (assignment.history && assignment.history.length > 0) {
    // Sort history by effectiveDate descending (newest first)
    const sortedHistory = [...assignment.history].sort(
      (a, b) =>
        new Date(b.effectiveDate + "T12:00:00").getTime() -
        new Date(a.effectiveDate + "T12:00:00").getTime()
    );

    // Find the most recent version that was effective before or on target date
    for (const version of sortedHistory) {
      const versionDate = new Date(version.effectiveDate + "T12:00:00");
      if (targetDate >= versionDate) {
        return version.timesPerMonth;
      }
    }
  }

  // Fallback: if no version found, use current frequency
  return assignment.timesPerMonth;
};

// Main App Component
export default function App() {
  const [currentView, setCurrentView] = useState("calendar");
  const [people, setPeople] = useState([]);
  const [chores, setChores] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [completions, setCompletions] = useState([]);
  const [debts, setDebts] = useState([]);
  const [debtPayments, setDebtPayments] = useState([]);
  const [feeSettings, setFeeSettings] = useState(null);
  const [monthlyFees, setMonthlyFees] = useState([]);
  const [communityChoreTypes, setCommunityChoreTypes] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showRecordModal, setShowRecordModal] = useState(false);

  // Firebase listeners
  useEffect(() => {
    const unsubPeople = onSnapshot(collection(db, "people"), (snapshot) => {
      setPeople(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    const unsubChores = onSnapshot(collection(db, "chores"), (snapshot) => {
      setChores(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    const unsubAssignments = onSnapshot(
      collection(db, "assignments"),
      (snapshot) => {
        setAssignments(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      }
    );
    const unsubCompletions = onSnapshot(
      collection(db, "completions"),
      (snapshot) => {
        setCompletions(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      }
    );
    const unsubDebts = onSnapshot(collection(db, "debts"), (snapshot) => {
      setDebts(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    const unsubDebtPayments = onSnapshot(
      collection(db, "debtPayments"),
      (snapshot) => {
        setDebtPayments(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      }
    );
    const unsubFeeSettings = onSnapshot(
      doc(db, "feeSettings", "settings"),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // Initialize communityCreditTiers if missing (migration)
          const defaults = {
            id: "settings",
            rewardThreshold: 90,
            rewardAmount: 20,
            penaltyModifier: 1.0,
            communityCreditTiers: [
              { min: 0, credit: 0 },
              { min: 30, credit: 5 },
              { min: 60, credit: 10 },
              { min: 90, credit: 15 },
              { min: 120, credit: 20 },
            ],
            lastUpdated: new Date().toISOString(),
          };
          const settings = {
            id: snapshot.id,
            ...defaults,
            ...data,
            // Ensure communityCreditTiers exists
            communityCreditTiers:
              data.communityCreditTiers || defaults.communityCreditTiers,
          };
          setFeeSettings(settings);
          // Update in Firebase if communityCreditTiers was missing
          if (!data.communityCreditTiers) {
            updateDoc(doc(db, "feeSettings", "settings"), {
              communityCreditTiers: defaults.communityCreditTiers,
            });
          }
        } else {
          // Initialize with defaults if not present
          const defaults = {
            id: "settings",
            rewardThreshold: 90,
            rewardAmount: 20,
            penaltyModifier: 1.0,
            communityCreditTiers: [
              { min: 0, credit: 0 },
              { min: 30, credit: 5 },
              { min: 60, credit: 10 },
              { min: 90, credit: 15 },
              { min: 120, credit: 20 },
            ],
            lastUpdated: new Date().toISOString(),
          };
          setFeeSettings(defaults);
          setDoc(doc(db, "feeSettings", "settings"), defaults);
        }
      }
    );
    const unsubCommunityChoreTypes = onSnapshot(
      collection(db, "communityChoreTypes"),
      (snapshot) => {
        setCommunityChoreTypes(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      }
    );
    const unsubMonthlyFees = onSnapshot(
      collection(db, "monthlyFees"),
      (snapshot) => {
        setMonthlyFees(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      }
    );

    // Check for expired debts when debts are loaded
    if (debts.length > 0) {
      checkAndMarkExpiredDebts(debts, completions, db);
    }

    return () => {
      unsubPeople();
      unsubChores();
      unsubAssignments();
      unsubCompletions();
      unsubDebts();
      unsubDebtPayments();
      unsubFeeSettings();
      unsubMonthlyFees();
      unsubCommunityChoreTypes();
    };
  }, []);

  // Check for expired debts when debts change
  useEffect(() => {
    if (debts.length > 0) {
      checkAndMarkExpiredDebts(debts, completions, db);
    }
  }, [debts, completions]);

  return (
    <div className="min-h-screen bg-stone-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap');
        
        * { font-family: 'DM Sans', sans-serif; }
        .font-display { font-family: 'Fraunces', serif; }
        
        .noise-bg {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          background-size: 200px;
          opacity: 0.03;
        }
        
        .card-shadow {
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03);
        }
        
        .calendar-day:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        
        .nav-item {
          transition: all 0.2s ease;
        }
        
        .nav-item:hover {
          background: rgba(120, 113, 108, 0.08);
        }
        
        .nav-item.active {
          background: linear-gradient(135deg, #78716c 0%, #57534e 100%);
          color: white;
        }
        
        .progress-ring {
          transform: rotate(-90deg);
        }
        
        .fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .stagger-1 { animation-delay: 0.05s; }
        .stagger-2 { animation-delay: 0.1s; }
        .stagger-3 { animation-delay: 0.15s; }
        .stagger-4 { animation-delay: 0.2s; }
        
        input:focus, select:focus, textarea:focus {
          outline: none;
          border-color: #78716c;
          box-shadow: 0 0 0 3px rgba(120, 113, 108, 0.1);
        }
        
        .btn-primary {
          background: linear-gradient(135deg, #78716c 0%, #57534e 100%);
          transition: all 0.2s ease;
        }
        
        .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(87, 83, 78, 0.3);
        }
        
        .completion-dot {
          animation: pop 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @keyframes pop {
          0% { transform: scale(0); }
          100% { transform: scale(1); }
        }
      `}</style>

      {/* Background texture */}
      <div className="fixed inset-0 noise-bg pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-stone-50/90 backdrop-blur-md border-b border-stone-200/50">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-semibold text-stone-800 tracking-tight">
              Chore Chart
            </h1>
            <nav className="flex gap-2 p-1 bg-stone-100 rounded-xl">
              {[
                { id: "calendar", label: "Calendar", icon: "📅" },
                { id: "analysis", label: "Records", icon: "📊" },
                { id: "admin", label: "Admin", icon: "⚙️" },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={`nav-item px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                    currentView === item.id ? "active" : "text-stone-600"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {currentView === "calendar" && (
          <CalendarView
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            completions={completions}
            people={people}
            chores={chores}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            showRecordModal={showRecordModal}
            setShowRecordModal={setShowRecordModal}
            assignments={assignments}
            communityChoreTypes={communityChoreTypes}
            db={db}
          />
        )}
        {currentView === "analysis" && (
          <AnalysisView
            people={people}
            chores={chores}
            assignments={assignments}
            completions={completions}
            debts={debts}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            feeSettings={feeSettings}
            monthlyFees={monthlyFees}
            communityChoreTypes={communityChoreTypes}
            db={db}
          />
        )}
        {currentView === "admin" && (
          <AdminView
            people={people}
            chores={chores}
            assignments={assignments}
            feeSettings={feeSettings}
            communityChoreTypes={communityChoreTypes}
            db={db}
          />
        )}
      </main>

      {/* Record Chore Modal */}
      {showRecordModal && selectedDate && (
        <RecordChoreModal
          date={selectedDate}
          people={people}
          chores={chores}
          assignments={assignments}
          debts={debts}
          completions={completions}
          communityChoreTypes={communityChoreTypes}
          onClose={() => {
            setShowRecordModal(false);
            setSelectedDate(null);
          }}
          db={db}
        />
      )}
    </div>
  );
}

// Calendar View Component
function CalendarView({
  currentMonth,
  setCurrentMonth,
  completions,
  people,
  chores,
  selectedDate,
  setSelectedDate,
  showRecordModal,
  setShowRecordModal,
  assignments,
  communityChoreTypes,
  db,
}) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const monthKey = getMonthKey(currentMonth);

  const monthCompletions = completions.filter((c) =>
    c.date.startsWith(monthKey)
  );

  const getCompletionsForDay = (day) => {
    const dateStr = `${monthKey}-${String(day).padStart(2, "0")}`;
    return monthCompletions.filter((c) => c.date === dateStr);
  };

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const getPeopleColors = () => {
    const colors = [
      "#e07a5f",
      "#3d5a80",
      "#81b29a",
      "#f2cc8f",
      "#9c89b8",
      "#f0a6ca",
      "#a8dadc",
      "#fca311",
    ];
    return people.reduce((acc, person, i) => {
      // Use custom color if person has one, otherwise fall back to default array
      acc[person.id] = person.color || colors[i % colors.length];
      return acc;
    }, {});
  };

  const personColors = getPeopleColors();

  return (
    <div className="fade-in">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={prevMonth}
          className="p-3 rounded-xl bg-white card-shadow hover:bg-stone-50 transition-colors"
        >
          <svg
            className="w-5 h-5 text-stone-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h2 className="font-display text-3xl font-semibold text-stone-800">
          {monthNames[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-3 rounded-xl bg-white card-shadow hover:bg-stone-50 transition-colors"
        >
          <svg
            className="w-5 h-5 text-stone-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Legend */}
      {people.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {people.map((person) => (
            <div
              key={person.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full card-shadow"
            >
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: personColors[person.id] }}
              />
              <span className="text-sm text-stone-600">{person.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl card-shadow overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-stone-100/50">
          {dayNames.map((day) => (
            <div
              key={day}
              className="p-4 text-center text-sm font-medium text-stone-500"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {/* Empty cells for days before month starts */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="p-4 min-h-[100px] bg-stone-50/30"
            />
          ))}

          {/* Actual days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayCompletions = getCompletionsForDay(day);
            const isToday =
              new Date().toDateString() ===
              new Date(year, month, day).toDateString();

            return (
              <button
                key={day}
                onClick={() => {
                  setSelectedDate(
                    `${monthKey}-${String(day).padStart(2, "0")}`
                  );
                  setShowRecordModal(true);
                }}
                className={`calendar-day p-3 min-h-[100px] border-t border-l border-stone-100 text-left transition-all hover:bg-stone-50 ${
                  isToday ? "bg-amber-50/50" : ""
                }`}
              >
                <div
                  className={`text-sm font-medium mb-2 ${
                    isToday ? "text-amber-600" : "text-stone-700"
                  }`}
                >
                  {day}
                </div>
                <div className="flex flex-wrap gap-1">
                  {dayCompletions.map((completion, idx) => {
                    const isCommunity = completion.type === "community";

                    if (isCommunity) {
                      const communityType = communityChoreTypes.find(
                        (t) => t.id === completion.communityChoreTypeId
                      );
                      const typeName = communityType?.name || "Unknown";
                      const displayName =
                        typeName.length > 10
                          ? typeName.substring(0, 10) + "..."
                          : typeName;
                      const completedByPerson = people.find(
                        (p) => p.id === completion.completedBy
                      );

                      return (
                        <div
                          key={idx}
                          className="px-2 py-0.5 rounded-sm bg-cyan-500 text-white text-xs font-medium whitespace-nowrap"
                          title={`Community: ${typeName} - ${
                            completion.minutes
                          } min (by ${completedByPerson?.name || "Unknown"})`}
                        >
                          {displayName}
                        </div>
                      );
                    }

                    // Individual completion
                    const chore = chores.find(
                      (c) => c.id === completion.choreId
                    );
                    const choreName = chore
                      ? getChoreNameAtDate(chore, completion.date)
                      : "";
                    const displayName =
                      choreName.length > 10
                        ? choreName.substring(0, 10) + "..."
                        : choreName;

                    // Get the person who gets credit (forPersonId, or completedBy if same)
                    const creditPersonId =
                      completion.forPersonId || completion.completedBy;
                    const creditPerson = people.find(
                      (p) => p.id === creditPersonId
                    );
                    const isProvisional = completion.isProvisional;

                    return (
                      <div
                        key={idx}
                        className={`completion-dot px-2 py-0.5 rounded-full text-white text-xs font-medium whitespace-nowrap ${
                          isProvisional
                            ? "opacity-90 border border-dashed border-white/50"
                            : ""
                        }`}
                        style={{
                          backgroundColor: personColors[creditPersonId],
                        }}
                        title={`${creditPerson?.name}: ${choreName}${
                          isProvisional ? " (provisional)" : ""
                        }`}
                      >
                        {displayName}
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <p className="mt-6 text-center text-sm text-stone-500">
        Click on any day to record a completed chore
      </p>
    </div>
  );
}

// Record Chore Modal
function RecordChoreModal({
  date,
  people,
  chores,
  assignments,
  debts,
  completions,
  communityChoreTypes,
  onClose,
  db,
}) {
  const [isCommunityMode, setIsCommunityMode] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState("");
  const [selectedChore, setSelectedChore] = useState("");
  const [selectedCommunityChoreType, setSelectedCommunityChoreType] =
    useState("");
  const [communityMinutes, setCommunityMinutes] = useState("");
  const [saving, setSaving] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [partialMinutes, setPartialMinutes] = useState("");
  const [forPersonId, setForPersonId] = useState("");
  const [dueDate, setDueDate] = useState("");

  // Determine the day of week for this completion (0-6, Sunday-Saturday)
  const completionDayOfWeek = date
    ? new Date(date + "T12:00:00").getDay()
    : null;

  const selectedChoreObj = chores.find((c) => c.id === selectedChore);

  // People who are explicitly assigned this chore for the given date:
  // - Day-specific assignments (dayOfWeek matches the completion date)
  // - Any-day assignments (dayOfWeek is null/undefined)
  const assignedPeopleForChore =
    selectedChore && assignments && assignments.length > 0
      ? [
          ...new Map(
            assignments
              .filter((a) => {
                if (a.choreId !== selectedChore) return false;
                const aDay =
                  a.dayOfWeek === undefined || a.dayOfWeek === null
                    ? null
                    : a.dayOfWeek;

                // Any-day assignment
                if (aDay === null) return true;
                // Day-specific: must match the completion's day of week
                if (completionDayOfWeek === null) return false;
                return aDay === completionDayOfWeek;
              })
              .map((a) => {
                const person = people.find((p) => p.id === a.personId);
                return person ? [person.id, person] : null;
              })
              .filter((entry) => entry !== null)
          ).values(),
        ]
      : [];

  const hasAssigneesForChore = assignedPeopleForChore.length > 0;
  const isPersonAssignedToSelectedChore =
    !!selectedPerson &&
    assignedPeopleForChore.some((p) => p.id === selectedPerson);

  const isCrossPerson =
    selectedPerson && forPersonId && selectedPerson !== forPersonId;

  // Only show "Who was this chore for?" when there are assignees for this chore
  // and the person who did it is NOT one of those assignees.
  const shouldShowForPersonDropdown =
    hasAssigneesForChore &&
    !!selectedChore &&
    !!selectedPerson &&
    !isPersonAssignedToSelectedChore;

  // Determine if there are existing open debts between selectedPerson (debtor) and forPersonId (creditor)
  const openDebtsBetween =
    isCrossPerson && debts && debts.length > 0
      ? debts
          .filter(
            (d) =>
              d.debtorId === selectedPerson &&
              d.creditorId === forPersonId &&
              (d.remainingMinutes ?? d.originalMinutes ?? 0) > 0
          )
          .sort((a, b) => {
            const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return aDate - bDate;
          })
      : [];

  const isPayment = isCrossPerson && openDebtsBetween.length > 0;
  const isNewDebt = isCrossPerson && openDebtsBetween.length === 0;

  const getMinuteOptions = () => {
    if (!selectedChoreObj || !selectedChoreObj.minutes) return [];
    const total = selectedChoreObj.minutes;
    // Use 5-minute increments for nicer UX, falling back to 1-minute steps for small chores
    const step = total <= 15 ? 1 : 5;
    const options = [];
    for (let m = step; m <= total; m += step) {
      options.push(m);
    }
    if (!options.includes(total)) {
      options.push(total);
    }
    return options;
  };

  const handleSave = async () => {
    if (isCommunityMode) {
      // Community mode validation
      if (!selectedPerson || !selectedCommunityChoreType || !communityMinutes)
        return;
      const minutesDone = parseInt(communityMinutes, 10);
      if (isNaN(minutesDone) || minutesDone <= 0 || minutesDone > 999) return;
    } else {
      // Individual mode validation
      if (!selectedPerson || !selectedChore) return;
      if (isPartial && !partialMinutes) return;
      if (isNewDebt && !dueDate) {
        // Require a due date when this completion will create a new debt
        return;
      }
    }

    setSaving(true);

    const completionId = generateId();
    const nowIso = new Date().toISOString();

    if (isCommunityMode) {
      // Community completion
      const minutesDone = parseInt(communityMinutes, 10);
      const completionData = {
        id: completionId,
        date,
        completedBy: selectedPerson,
        type: "community",
        communityChoreTypeId: selectedCommunityChoreType,
        minutes: minutesDone,
        createdAt: nowIso,
      };

      await setDoc(doc(db, "completions", completionId), completionData);
      setSaving(false);
      onClose();
      return;
    }

    // Individual completion (existing logic)
    const chore = chores.find((c) => c.id === selectedChore);
    const minutesDone = isPartial
      ? parseInt(partialMinutes, 10)
      : chore?.minutes ?? 0;

    // Determine if this will create a new debt (needed for isProvisional)
    let debtIdForCompletion = undefined;
    if (isNewDebt) {
      debtIdForCompletion = generateId();
    }

    // Build completion object - only include optional fields if they have values
    const completionData = {
      id: completionId,
      date,
      completedBy: selectedPerson,
      choreId: selectedChore,
      minutes: minutesDone,
      createdAt: nowIso,
      type: "individual",
      // Who this chore was done for; can be the same as selectedPerson
      // If not explicitly chosen, default to the person who did the chore
      forPersonId: forPersonId || selectedPerson,
      // Only add provisional fields if creating a new debt (Firebase doesn't allow undefined)
      ...(isNewDebt && debtIdForCompletion
        ? {
            isProvisional: true,
            sourceDebtId: debtIdForCompletion,
          }
        : {}),
    };

    await setDoc(doc(db, "completions", completionId), completionData);

    // Debt logic:
    // - If the chore was done for another person (forPersonId !== selectedPerson),
    //   and there are existing debts where selectedPerson is the debtor and
    //   forPersonId is the creditor, auto-apply minutes oldest-first as payments.
    // - If there are no such existing debts, create a new debt from forPersonId (debtor)
    //   to selectedPerson (creditor) for the full minutesDone, with a manually chosen dueDate.
    if (isCrossPerson) {
      if (isPayment) {
        let pool = minutesDone;
        for (const debt of openDebtsBetween) {
          const remaining = debt.remainingMinutes ?? debt.originalMinutes ?? 0;
          if (remaining <= 0 || pool <= 0) continue;
          const apply = Math.min(pool, remaining);
          if (apply <= 0) continue;

          const paymentId = generateId();
          await setDoc(doc(db, "debtPayments", paymentId), {
            id: paymentId,
            debtId: debt.id,
            completionId: completionId,
            minutesApplied: apply,
            createdAt: nowIso,
          });

          const newRemaining = remaining - apply;
          await updateDoc(doc(db, "debts", debt.id), {
            remainingMinutes: newRemaining,
          });

          // If debt is fully paid, mark source completion as permanent
          if (newRemaining <= 0) {
            const sourceCompletion = completions.find(
              (c) => c.id === debt.sourceCompletionId
            );
            if (sourceCompletion && sourceCompletion.isProvisional) {
              await updateDoc(doc(db, "completions", sourceCompletion.id), {
                isProvisional: false,
              });
            }
          }

          pool -= apply;
          if (pool <= 0) break;
        }
      } else if (isNewDebt) {
        const debtId = debtIdForCompletion || generateId();
        // Build debt object - only include optional fields if they have values
        const debtData = {
          id: debtId,
          creditorId: selectedPerson,
          debtorId: forPersonId,
          choreId: selectedChore,
          originalMinutes: minutesDone,
          remainingMinutes: minutesDone,
          createdAt: nowIso,
          // Store the date string directly; we can interpret it as needed in the UI
          dueDate: dueDate || null,
          sourceCompletionId: completionId,
          // NEW FIELDS: Track expiration and fee calculation status
          feeCalculated: false,
        };
        // Only add expiredAt if it has a value (it won't initially)
        // This field will be set later when the debt expires
        await setDoc(doc(db, "debts", debtId), debtData);
      }
    }

    setSaving(false);
    onClose();
  };

  const formattedDate = new Date(date + "T12:00:00").toLocaleDateString(
    "en-US",
    {
      weekday: "long",
      month: "long",
      day: "numeric",
    }
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl card-shadow w-full max-w-md p-6 fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-xl font-semibold text-stone-800">
            Record Chore
          </h3>
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-medium ${
                !isCommunityMode ? "text-stone-800" : "text-stone-400"
              }`}
            >
              Individual
            </span>
            <button
              type="button"
              onClick={() => {
                setIsCommunityMode(!isCommunityMode);
                // Reset form when switching modes
                setSelectedChore("");
                setSelectedCommunityChoreType("");
                setCommunityMinutes("");
                setIsPartial(false);
                setPartialMinutes("");
                setForPersonId("");
                setDueDate("");
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isCommunityMode ? "bg-cyan-500" : "bg-stone-300"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isCommunityMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-xs font-medium ${
                isCommunityMode ? "text-cyan-600" : "text-stone-400"
              }`}
            >
              Community
            </span>
          </div>
        </div>
        <p className="text-sm text-stone-500 mb-6">{formattedDate}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Who did the chore?
            </label>
            <select
              value={selectedPerson}
              onChange={(e) => setSelectedPerson(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
            >
              <option value="">Select person...</option>
              {[...people]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
          </div>

          {!isCommunityMode && (
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Which chore?
              </label>
              <select
                value={selectedChore}
                onChange={(e) => setSelectedChore(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
              >
                <option value="">Select chore...</option>
                {[...chores]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((chore) => (
                    <option key={chore.id} value={chore.id}>
                      {chore.name} ({chore.minutes} min)
                    </option>
                  ))}
              </select>
            </div>
          )}

          {isCommunityMode && (
            <>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Community Chore Type
                </label>
                <select
                  value={selectedCommunityChoreType}
                  onChange={(e) =>
                    setSelectedCommunityChoreType(e.target.value)
                  }
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
                >
                  <option value="">Select type...</option>
                  {[...communityChoreTypes]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Minutes
                </label>
                <input
                  type="number"
                  value={communityMinutes}
                  onChange={(e) => setCommunityMinutes(e.target.value)}
                  min="1"
                  max="999"
                  placeholder="Enter minutes (1-999)"
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
                />
              </div>
            </>
          )}

          {!isCommunityMode && (
            <>
              {/* Partial completion controls */}
              <div className="flex items-center gap-2">
                <input
                  id="partial-checkbox"
                  type="checkbox"
                  checked={isPartial}
                  onChange={(e) => {
                    setIsPartial(e.target.checked);
                    if (!e.target.checked) {
                      setPartialMinutes("");
                    }
                  }}
                  className="h-4 w-4 rounded border-stone-300 text-stone-700 focus:ring-stone-500"
                />
                <label
                  htmlFor="partial-checkbox"
                  className="text-sm font-medium text-stone-700"
                >
                  Partial Chore Completion
                </label>
              </div>

              {isPartial && selectedChoreObj && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Minutes completed (up to {selectedChoreObj.minutes} min)
                  </label>
                  <select
                    value={partialMinutes}
                    onChange={(e) => setPartialMinutes(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
                  >
                    <option value="">Select minutes...</option>
                    {getMinuteOptions().map((m) => (
                      <option key={m} value={m}>
                        {m} min
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Who was this chore for? */}
              {shouldShowForPersonDropdown && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Who was this chore for?
                  </label>
                  <select
                    value={forPersonId}
                    onChange={(e) => setForPersonId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
                  >
                    <option value="">Select person...</option>
                    {assignedPeopleForChore
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                  </select>
                  {isCrossPerson && (
                    <p className="mt-1 text-xs text-stone-500">
                      This will credit{" "}
                      {people.find((p) => p.id === forPersonId)?.name ||
                        "this person"}
                      's stats
                      {isNewDebt ? " (provisional until debt is paid)" : ""}
                      {isPayment && (
                        <>
                          . There are existing open debts where{" "}
                          {people.find((p) => p.id === selectedPerson)?.name}{" "}
                          owes {people.find((p) => p.id === forPersonId)?.name}.
                          This completion will automatically pay down the oldest
                          debts first.
                        </>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Due date for new debts */}
              {!isCommunityMode && isNewDebt && (
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-2">
                    Due date for this favor
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50 text-stone-800"
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    This is when the person you did this for should pay you back
                    by.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-stone-200 text-stone-600 font-medium hover:bg-stone-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={
              saving ||
              (isCommunityMode
                ? !selectedPerson ||
                  !selectedCommunityChoreType ||
                  !communityMinutes
                : !selectedPerson ||
                  !selectedChore ||
                  (isPartial && !partialMinutes) ||
                  (isNewDebt && !dueDate) ||
                  (shouldShowForPersonDropdown && !forPersonId))
            }
            className="flex-1 px-4 py-3 rounded-xl btn-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Analysis View Component
function AnalysisView({
  people,
  chores,
  assignments,
  completions,
  debts,
  currentMonth,
  setCurrentMonth,
  feeSettings,
  monthlyFees,
  communityChoreTypes,
  db,
}) {
  const [selectedTab, setSelectedTab] = useState("individual");
  const [historyMonths, setHistoryMonths] = useState(6);
  const monthKey = getMonthKey(currentMonth);
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  // Get array of last N months
  const getLastNMonths = (n) => {
    const months: { key: string; label: string; date: Date }[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(year, month - i, 1);
      months.push({
        key: getMonthKey(d),
        label: `${monthNames[d.getMonth()].substring(0, 3)} '${d
          .getFullYear()
          .toString()
          .slice(-2)}`,
        date: d,
      });
    }
    return months;
  };

  // Helper function to calculate stats without expired debt credits
  const calculatePersonStatsWithoutExpiredDebts = (
    personId,
    monthFilter: string | null = null
  ) => {
    // Get expired debt IDs
    const expiredDebtIds = new Set(
      debts
        .filter((d) => d.expiredAt && (d.remainingMinutes ?? 0) > 0)
        .map((d) => d.id)
    );

    // Filter out completions from expired debts
    const filteredCompletions = completions.filter((c) => {
      // Apply month filter
      if (monthFilter && !c.date.startsWith(monthFilter)) {
        return false;
      }

      // Check if this completion is from an expired debt
      if (
        c.isProvisional &&
        c.sourceDebtId &&
        expiredDebtIds.has(c.sourceDebtId)
      ) {
        return false; // Exclude this completion
      }

      return true;
    });

    // Now calculate stats using filtered completions
    const personAssignments = assignments.filter(
      (a) => a.personId === personId
    );

    const personCompletions = filteredCompletions.filter((c) => {
      // Self-completion: credit goes to completedBy
      if (c.forPersonId === c.completedBy || !c.forPersonId) {
        return c.completedBy === personId;
      }
      // Cross-person completion: credit goes to forPersonId
      return c.forPersonId === personId;
    });

    let expectedMinutes = 0;
    let completedMinutes = 0;
    const choreBreakdown = {};

    // Calculate expected minutes from assignments
    if (monthFilter) {
      // For a specific month, use values effective on the first day of the month
      const monthStartDate = monthFilter + "-01";
      personAssignments.forEach((assignment) => {
        const chore = chores.find((c) => c.id === assignment.choreId);
        if (chore) {
          const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
          const assignmentFreq = getAssignmentFrequencyAtDate(
            assignment,
            monthStartDate
          );
          expectedMinutes += choreMinutes * assignmentFreq * 1;
        }
      });
    } else {
      if (personCompletions.length === 0) {
        // No completions yet, default to 1 month with current values
        personAssignments.forEach((assignment) => {
          const chore = chores.find((c) => c.id === assignment.choreId);
          if (chore) {
            expectedMinutes += chore.minutes * assignment.timesPerMonth * 1;
          }
        });
      } else {
        // Count expected minutes per month, using values effective in that month
        const monthsWithCompletions = new Set();
        personCompletions.forEach((completion) => {
          const monthKey = completion.date.substring(0, 7);
          monthsWithCompletions.add(monthKey);
        });

        // For each month, calculate expected minutes using values effective in that month
        monthsWithCompletions.forEach((monthKey) => {
          const monthStartDate = monthKey + "-01";
          personAssignments.forEach((assignment) => {
            const chore = chores.find((c) => c.id === assignment.choreId);
            if (chore) {
              const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
              const assignmentFreq = getAssignmentFrequencyAtDate(
                assignment,
                monthStartDate
              );
              expectedMinutes += choreMinutes * assignmentFreq * 1;
            }
          });
        });
      }
    }

    // Calculate completed minutes
    personCompletions.forEach((completion) => {
      const chore = chores.find((c) => c.id === completion.choreId);
      if (chore) {
        completedMinutes += completion.minutes;
        const choreNameAtDate = getChoreNameAtDate(chore, completion.date);
        choreBreakdown[choreNameAtDate] =
          (choreBreakdown[choreNameAtDate] || 0) + completion.minutes;
      }
    });

    const percentage =
      expectedMinutes > 0
        ? Math.round((completedMinutes / expectedMinutes) * 100)
        : 0;

    return { expectedMinutes, completedMinutes, percentage, choreBreakdown };
  };

  // Calculate stats for each person
  const calculatePersonStats = (
    personId,
    monthFilter: string | null = null
  ) => {
    const personAssignments = assignments.filter(
      (a) => a.personId === personId
    );
    // NEW LOGIC: Credit assignment uses forPersonId for cross-person completions
    const personCompletions = completions.filter((c) => {
      // Apply month filter first
      if (monthFilter && !c.date.startsWith(monthFilter)) {
        return false;
      }

      // Self-completion: credit goes to completedBy
      if (c.forPersonId === c.completedBy || !c.forPersonId) {
        return c.completedBy === personId;
      }

      // Cross-person completion: credit goes to forPersonId
      return c.forPersonId === personId;
    });

    let expectedMinutes = 0;
    let completedMinutes = 0;
    const choreBreakdown = {};

    // Calculate expected minutes from assignments
    if (monthFilter) {
      // For a specific month, use values effective on the first day of the month
      const monthStartDate = monthFilter + "-01";
      personAssignments.forEach((assignment) => {
        const chore = chores.find((c) => c.id === assignment.choreId);
        if (chore) {
          const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
          const assignmentFreq = getAssignmentFrequencyAtDate(
            assignment,
            monthStartDate
          );
          expectedMinutes += choreMinutes * assignmentFreq * 1;
        }
      });
    } else {
      // For all-time, calculate expected minutes based on the actual months
      // where this person has completions. This matches how the history view
      // calculates totals by summing individual months.
      if (personCompletions.length === 0) {
        // No completions yet, default to 1 month with current values
        personAssignments.forEach((assignment) => {
          const chore = chores.find((c) => c.id === assignment.choreId);
          if (chore) {
            expectedMinutes += chore.minutes * assignment.timesPerMonth * 1;
          }
        });
      } else {
        // Count expected minutes per month, using values effective in that month
        const monthsWithCompletions = new Set();
        personCompletions.forEach((completion) => {
          // Extract month key from date (format: "YYYY-MM-DD")
          const monthKey = completion.date.substring(0, 7); // "YYYY-MM"
          monthsWithCompletions.add(monthKey);
        });

        // For each month, calculate expected minutes using values effective in that month
        monthsWithCompletions.forEach((monthKey) => {
          const monthStartDate = monthKey + "-01";
          personAssignments.forEach((assignment) => {
            const chore = chores.find((c) => c.id === assignment.choreId);
            if (chore) {
              const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
              const assignmentFreq = getAssignmentFrequencyAtDate(
                assignment,
                monthStartDate
              );
              expectedMinutes += choreMinutes * assignmentFreq * 1;
            }
          });
        });
      }
    }

    // Calculate completed minutes
    personCompletions.forEach((completion) => {
      const chore = chores.find((c) => c.id === completion.choreId);
      if (chore) {
        completedMinutes += completion.minutes;
        const choreNameAtDate = getChoreNameAtDate(chore, completion.date);
        choreBreakdown[choreNameAtDate] =
          (choreBreakdown[choreNameAtDate] || 0) + completion.minutes;
      }
    });

    const percentage =
      expectedMinutes > 0
        ? Math.round((completedMinutes / expectedMinutes) * 100)
        : 0;

    return { expectedMinutes, completedMinutes, percentage, choreBreakdown };
  };

  // Calculate community stats for a person
  const calculatePersonCommunityStats = (
    personId,
    monthFilter: string | null = null
  ) => {
    const communityCompletions = completions.filter((c) => {
      if (c.type !== "community") return false;
      if (c.completedBy !== personId) return false;
      if (monthFilter && !c.date.startsWith(monthFilter)) return false;
      return true;
    });

    const totalMinutes = communityCompletions.reduce(
      (sum, c) => sum + c.minutes,
      0
    );

    // Breakdown by type
    const breakdownByType = {};
    communityCompletions.forEach((c) => {
      const typeName =
        communityChoreTypes.find((t) => t.id === c.communityChoreTypeId)
          ?.name || "Unknown";
      breakdownByType[typeName] = (breakdownByType[typeName] || 0) + c.minutes;
    });

    return {
      totalMinutes,
      breakdownByType,
      thisMonthMinutes: monthFilter ? totalMinutes : undefined,
      allTimeMinutes: monthFilter ? undefined : totalMinutes,
    };
  };

  // Calculate house-wide community stats
  const calculateHouseCommunityStats = (monthFilter: string | null = null) => {
    const communityCompletions = completions.filter((c) => {
      if (c.type !== "community") return false;
      if (monthFilter && !c.date.startsWith(monthFilter)) return false;
      return true;
    });

    const totalMinutes = communityCompletions.reduce(
      (sum, c) => sum + c.minutes,
      0
    );

    // Per-person contributions
    const perPerson = {};
    communityCompletions.forEach((c) => {
      perPerson[c.completedBy] = (perPerson[c.completedBy] || 0) + c.minutes;
    });

    const topContributors = Object.entries(perPerson)
      .map(([personId, minutes]) => ({
        personId,
        minutes,
        name: people.find((p) => p.id === personId)?.name || "Unknown",
      }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5); // Top 5

    return {
      totalMinutes,
      contributors: Object.keys(perPerson).length,
      topContributors,
    };
  };

  // Calculate community chore credit for a person in a month
  const calculateCommunityChoreCredit = (personId, monthKey, settings) => {
    if (!settings || !settings.communityCreditTiers) return 0;

    const stats = calculatePersonCommunityStats(personId, monthKey);
    const totalMinutes = stats.totalMinutes;

    const tiers = settings.communityCreditTiers || [
      { min: 0, credit: 0 },
      { min: 30, credit: 5 },
      { min: 60, credit: 10 },
      { min: 90, credit: 15 },
      { min: 120, credit: 20 },
    ];

    // Find the highest tier the person qualifies for
    let credit = 0;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if (totalMinutes >= tiers[i].min) {
        credit = tiers[i].credit;
        break;
      }
    }

    return credit;
  };

  const getDebtStatus = (debt) => {
    const remaining = debt.remainingMinutes ?? debt.originalMinutes ?? 0;
    if (remaining <= 0) return "paid";
    if (debt.dueDate) {
      const today = new Date();
      const due = new Date(debt.dueDate);
      if (
        due < new Date(today.getFullYear(), today.getMonth(), today.getDate())
      ) {
        return "overdue";
      }
    }
    return "open";
  };

  // Calculate house totals
  const houseStats = () => {
    let totalExpected = 0;
    let totalCompleted = 0;

    people.forEach((person) => {
      const stats = calculatePersonStatsWithoutExpiredDebts(
        person.id,
        monthKey
      );
      totalExpected += stats.expectedMinutes;
      totalCompleted += stats.completedMinutes;
    });

    return {
      expected: totalExpected,
      completed: totalCompleted,
      percentage:
        totalExpected > 0
          ? Math.round((totalCompleted / totalExpected) * 100)
          : 0,
    };
  };

  const house = houseStats();

  // Fee calculation functions
  const calculateBaseFee = (completionPercentage, settings) => {
    if (!settings) return 0;
    if (completionPercentage >= settings.rewardThreshold) {
      return -settings.rewardAmount; // Negative = credit
    } else {
      return (100 - completionPercentage) * settings.penaltyModifier;
    }
  };

  // Calculate stats excluding specific debt IDs
  const calculatePersonStatsExcludingDebts = (
    personId,
    monthFilter,
    excludeDebtIds
  ) => {
    const excludeSet = new Set(excludeDebtIds || []);

    const filteredCompletions = completions.filter((c) => {
      if (monthFilter && !c.date.startsWith(monthFilter)) {
        return false;
      }
      if (c.isProvisional && c.sourceDebtId && excludeSet.has(c.sourceDebtId)) {
        return false;
      }
      return true;
    });

    const personAssignments = assignments.filter(
      (a) => a.personId === personId
    );

    const personCompletions = filteredCompletions.filter((c) => {
      if (c.forPersonId === c.completedBy || !c.forPersonId) {
        return c.completedBy === personId;
      }
      return c.forPersonId === personId;
    });

    let expectedMinutes = 0;
    let completedMinutes = 0;

    if (monthFilter) {
      // For a specific month, use values effective on the first day of the month
      const monthStartDate = monthFilter + "-01";
      personAssignments.forEach((assignment) => {
        const chore = chores.find((c) => c.id === assignment.choreId);
        if (chore) {
          const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
          const assignmentFreq = getAssignmentFrequencyAtDate(
            assignment,
            monthStartDate
          );
          expectedMinutes += choreMinutes * assignmentFreq * 1;
        }
      });
    } else {
      if (personCompletions.length === 0) {
        // No completions yet, default to 1 month with current values
        personAssignments.forEach((assignment) => {
          const chore = chores.find((c) => c.id === assignment.choreId);
          if (chore) {
            expectedMinutes += chore.minutes * assignment.timesPerMonth * 1;
          }
        });
      } else {
        // Count expected minutes per month, using values effective in that month
        const monthsWithCompletions = new Set();
        personCompletions.forEach((completion) => {
          const monthKey = completion.date.substring(0, 7);
          monthsWithCompletions.add(monthKey);
        });
        // For each month, calculate expected minutes using values effective in that month
        monthsWithCompletions.forEach((monthKey) => {
          const monthStartDate = monthKey + "-01";
          personAssignments.forEach((assignment) => {
            const chore = chores.find((c) => c.id === assignment.choreId);
            if (chore) {
              const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
              const assignmentFreq = getAssignmentFrequencyAtDate(
                assignment,
                monthStartDate
              );
              expectedMinutes += choreMinutes * assignmentFreq * 1;
            }
          });
        });
      }
    }

    personCompletions.forEach((completion) => {
      completedMinutes += completion.minutes;
    });

    const percentage =
      expectedMinutes > 0
        ? Math.round((completedMinutes / expectedMinutes) * 100)
        : 0;

    return { expectedMinutes, completedMinutes, percentage };
  };

  // Calculate expired debt fee for a specific debt
  const calculateExpiredDebtFee = async (debt) => {
    if (
      !debt.expiredAt ||
      (debt.remainingMinutes ?? 0) <= 0 ||
      debt.feeCalculated
    ) {
      return null;
    }

    const sourceCompletion = completions.find(
      (c) => c.id === debt.sourceCompletionId
    );
    if (!sourceCompletion) return null;

    const completionMonthKey = sourceCompletion.date.substring(0, 7);
    const expirationDate = new Date(debt.expiredAt);
    const expirationMonthKey = getMonthKey(expirationDate);

    // Target month is the month WHERE the debt expires (not the month after)
    // This way expired debt fees are allocated in the same month as the expiration,
    // which aligns with when rent is calculated (December fees → January rent)
    const targetMonthKey = expirationMonthKey;

    // Get all debts that expired BEFORE this one
    const earlierExpiredDebts = debts.filter(
      (d) =>
        d.expiredAt &&
        d.id !== debt.id &&
        new Date(d.expiredAt) < expirationDate &&
        (d.remainingMinutes ?? 0) > 0
    );
    const earlierExpiredDebtIds = earlierExpiredDebts.map((d) => d.id);

    // Calculate stats WITHOUT this debt's credit (and without earlier expired debts)
    const statsWithout = calculatePersonStatsExcludingDebts(
      debt.debtorId,
      completionMonthKey,
      [...earlierExpiredDebtIds, debt.id]
    );

    // Calculate stats WITH this debt's credit (but without earlier expired debts)
    const statsWith = calculatePersonStatsExcludingDebts(
      debt.debtorId,
      completionMonthKey,
      earlierExpiredDebtIds
    );

    const feeWithout = calculateBaseFee(statsWithout.percentage, feeSettings);
    const feeWith = calculateBaseFee(statsWith.percentage, feeSettings);
    const delta = feeWithout - feeWith;

    return {
      debtId: debt.id,
      personId: debt.debtorId,
      targetMonthKey,
      delta,
    };
  };

  // Calculate and store monthly fees for a given month
  const calculateMonthlyFees = async (monthKey) => {
    if (!feeSettings) return;

    // First, process any unprocessed expired debts
    await processExpiredDebts();

    for (const person of people) {
      // Use stats WITHOUT expired debts for base fee calculation
      const stats = calculatePersonStatsWithoutExpiredDebts(
        person.id,
        monthKey
      );
      const baseFee = calculateBaseFee(stats.percentage, feeSettings);

      // Get expired debt fees from existing monthly fees for this person/month
      // (These are calculated when debts expire via processExpiredDebts)
      const existingFeeForPerson = monthlyFees.find(
        (f) => f.personId === person.id && f.monthKey === monthKey
      );
      const expiredDebtFees = existingFeeForPerson?.expiredDebtFees || 0;

      // Calculate community chore credit
      const communityChoreCredit = calculateCommunityChoreCredit(
        person.id,
        monthKey,
        feeSettings
      );

      const totalFee = baseFee + expiredDebtFees;

      // Find or create monthly fee record
      const existingFee = monthlyFees.find(
        (f) => f.personId === person.id && f.monthKey === monthKey
      );

      const feeData = {
        personId: person.id,
        monthKey,
        baseFee,
        expiredDebtFees,
        totalFee,
        communityChoreCredit,
        calculatedAt: new Date().toISOString(),
        processed: existingFee?.processed || false,
      };

      if (existingFee) {
        await updateDoc(doc(db, "monthlyFees", existingFee.id), feeData);
      } else {
        const feeId = generateId();
        await setDoc(doc(db, "monthlyFees", feeId), {
          id: feeId,
          ...feeData,
        });
      }
    }
  };

  // Process expired debts and calculate fees
  const processExpiredDebts = async () => {
    const unprocessedExpiredDebts = debts
      .filter(
        (d) => d.expiredAt && !d.feeCalculated && (d.remainingMinutes ?? 0) > 0
      )
      .sort((a, b) => {
        // Sort by expiration date to process in order
        const dateA = new Date(a.expiredAt).getTime();
        const dateB = new Date(b.expiredAt).getTime();
        return dateA - dateB;
      });

    for (const debt of unprocessedExpiredDebts) {
      const feeResult = await calculateExpiredDebtFee(debt);
      if (feeResult) {
        // Update or create monthly fee record
        const existingFee = monthlyFees.find(
          (f) =>
            f.personId === feeResult.personId &&
            f.monthKey === feeResult.targetMonthKey
        );

        if (existingFee) {
          const newExpiredDebtFees =
            (existingFee.expiredDebtFees || 0) + feeResult.delta;
          const newTotalFee = existingFee.baseFee + newExpiredDebtFees;
          await updateDoc(doc(db, "monthlyFees", existingFee.id), {
            expiredDebtFees: newExpiredDebtFees,
            totalFee: newTotalFee,
          });
        } else {
          // Need to calculate base fee first
          // Use stats without expired debts for consistency
          const stats = calculatePersonStatsWithoutExpiredDebts(
            feeResult.personId,
            feeResult.targetMonthKey
          );
          const baseFee = calculateBaseFee(stats.percentage, feeSettings);
          const communityChoreCredit = calculateCommunityChoreCredit(
            feeResult.personId,
            feeResult.targetMonthKey,
            feeSettings
          );
          const feeId = generateId();
          await setDoc(doc(db, "monthlyFees", feeId), {
            id: feeId,
            personId: feeResult.personId,
            monthKey: feeResult.targetMonthKey,
            baseFee,
            expiredDebtFees: feeResult.delta,
            totalFee: baseFee + feeResult.delta,
            communityChoreCredit,
            calculatedAt: new Date().toISOString(),
            processed: false,
          });
        }

        // Mark debt as fee calculated
        await updateDoc(doc(db, "debts", debt.id), {
          feeCalculated: true,
        });
      }
    }
  };

  // Auto-process expired debts when viewing fees tab
  useEffect(() => {
    if (selectedTab === "fees" && feeSettings && debts.length > 0) {
      // Process expired debts to calculate fees
      const processDebts = async () => {
        await processExpiredDebts();
      };
      processDebts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, debts.length, feeSettings]);

  return (
    <div className="fade-in">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={prevMonth}
          className="p-3 rounded-xl bg-white card-shadow hover:bg-stone-50 transition-colors"
        >
          <svg
            className="w-5 h-5 text-stone-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <h2 className="font-display text-3xl font-semibold text-stone-800">
          {monthNames[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="p-3 rounded-xl bg-white card-shadow hover:bg-stone-50 transition-colors"
        >
          <svg
            className="w-5 h-5 text-stone-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 p-1 bg-stone-100 rounded-xl w-fit">
        {[
          { id: "individual", label: "Individual" },
          { id: "house", label: "House Total" },
          { id: "history", label: "History" },
          { id: "debts", label: "Debts" },
          { id: "fees", label: "Fees" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSelectedTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedTab === tab.id
                ? "bg-white card-shadow text-stone-800"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Individual Stats */}
      {selectedTab === "individual" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person, idx) => {
            const monthStats = calculatePersonStatsWithoutExpiredDebts(
              person.id,
              monthKey
            );
            const allTimeStats = calculatePersonStatsWithoutExpiredDebts(
              person.id
            );
            const monthCommunityStats = calculatePersonCommunityStats(
              person.id,
              monthKey
            );
            const allTimeCommunityStats = calculatePersonCommunityStats(
              person.id,
              null
            );

            return (
              <div
                key={person.id}
                className={`bg-white rounded-2xl card-shadow p-6 fade-in stagger-${
                  idx + 1
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-semibold text-stone-800">
                    {person.name}
                  </h3>
                  <ProgressRing percentage={monthStats.percentage} />
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-stone-500">This Month</p>
                    <p className="text-lg font-medium text-stone-700">
                      {monthStats.completedMinutes} /{" "}
                      {monthStats.expectedMinutes} min
                    </p>
                  </div>

                  <div className="border-t border-stone-100 pt-3">
                    <p className="text-sm text-stone-500">All Time</p>
                    <p className="text-lg font-medium text-stone-700">
                      {allTimeStats.completedMinutes} min (
                      {allTimeStats.percentage}%)
                    </p>
                  </div>

                  {Object.keys(monthStats.choreBreakdown).length > 0 && (
                    <div className="border-t border-stone-100 pt-3">
                      <p className="text-sm text-stone-500 mb-2">Breakdown</p>
                      <div className="space-y-1">
                        {Object.entries(monthStats.choreBreakdown).map(
                          ([chore, mins]) => (
                            <div
                              key={chore}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-stone-600">{chore}</span>
                              <span className="text-stone-800 font-medium">
                                {mins} min
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Community Chores Section */}
                  {(monthCommunityStats.totalMinutes > 0 ||
                    allTimeCommunityStats.totalMinutes > 0) && (
                    <div className="border-t border-stone-200 pt-4 mt-4">
                      <h4 className="text-sm font-semibold text-cyan-700 mb-3">
                        Community Chores
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-stone-500">
                            Total Minutes
                          </p>
                          <p className="text-sm font-medium text-stone-700">
                            {allTimeCommunityStats.totalMinutes} min
                          </p>
                        </div>
                        {monthCommunityStats.thisMonthMinutes !== undefined && (
                          <div>
                            <p className="text-xs text-stone-500">This Month</p>
                            <p className="text-sm font-medium text-stone-700">
                              {monthCommunityStats.thisMonthMinutes} min
                            </p>
                          </div>
                        )}
                        {allTimeCommunityStats.allTimeMinutes !== undefined && (
                          <div>
                            <p className="text-xs text-stone-500">All-Time</p>
                            <p className="text-sm font-medium text-stone-700">
                              {allTimeCommunityStats.allTimeMinutes} min
                            </p>
                          </div>
                        )}
                        {Object.keys(allTimeCommunityStats.breakdownByType)
                          .length > 0 && (
                          <div className="mt-3 pt-3 border-t border-stone-100">
                            <p className="text-xs text-stone-500 mb-2">
                              Breakdown by Type:
                            </p>
                            <div className="space-y-1">
                              {Object.entries(
                                allTimeCommunityStats.breakdownByType
                              ).map(([type, mins]) => (
                                <div
                                  key={type}
                                  className="flex justify-between text-xs"
                                >
                                  <span className="text-stone-600">
                                    • {type}
                                  </span>
                                  <span className="text-stone-800 font-medium">
                                    {mins} min
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {people.length === 0 && (
            <div className="col-span-full text-center py-12 text-stone-500">
              No people added yet. Go to Admin to add household members.
            </div>
          )}
        </div>
      )}

      {/* House Total */}
      {selectedTab === "house" && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-white rounded-2xl card-shadow p-8 max-w-lg mx-auto">
            <div className="text-center">
              <div className="inline-block mb-4">
                <ProgressRing
                  percentage={house.percentage}
                  size={120}
                  strokeWidth={8}
                />
              </div>
              <h3 className="font-display text-2xl font-semibold text-stone-800 mb-2">
                House Progress
              </h3>
              <p className="text-lg text-stone-600">
                {house.completed} / {house.expected} minutes completed
              </p>
              <p className="text-3xl font-bold text-stone-800 mt-4">
                {house.percentage}%
              </p>
            </div>
          </div>

          {/* Chore List */}
          <div className="bg-white rounded-2xl card-shadow p-6 max-w-2xl mx-auto">
            <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
              Chore Completion Status
            </h3>
            {(() => {
              // Get expired debt IDs
              const expiredDebtIds = new Set(
                debts
                  .filter((d) => d.expiredAt && (d.remainingMinutes ?? 0) > 0)
                  .map((d) => d.id)
              );

              // Get all completions for the current month, excluding expired debt credits
              const monthCompletions = completions.filter((c) => {
                if (!c.date.startsWith(monthKey)) return false;

                // Exclude completions from expired debts
                if (
                  c.isProvisional &&
                  c.sourceDebtId &&
                  expiredDebtIds.has(c.sourceDebtId)
                ) {
                  return false;
                }

                return true;
              });

              // Calculate expected and completed minutes per chore
              const choreStatus = {};

              // Initialize with all assignments
              const monthStartDate = monthKey + "-01";
              assignments.forEach((assignment) => {
                const chore = chores.find((c) => c.id === assignment.choreId);
                if (chore) {
                  if (!choreStatus[assignment.choreId]) {
                    choreStatus[assignment.choreId] = {
                      choreId: assignment.choreId,
                      choreName: getChoreNameAtDate(chore, monthStartDate),
                      expectedMinutes: 0,
                      completedMinutes: 0,
                    };
                  }
                  const choreMinutes = getChoreMinutesAtDate(chore, monthStartDate);
                  const assignmentFreq = getAssignmentFrequencyAtDate(
                    assignment,
                    monthStartDate
                  );
                  choreStatus[assignment.choreId].expectedMinutes +=
                    assignmentFreq * choreMinutes;
                }
              });

              // Count completions
              monthCompletions.forEach((completion) => {
                if (choreStatus[completion.choreId]) {
                  const chore = chores.find((c) => c.id === completion.choreId);
                  if (chore) {
                    choreStatus[completion.choreId].completedMinutes +=
                      completion.minutes;
                  }
                }
              });

              // Convert to array and sort by completion status (incomplete first, then by name)
              const choreList = Object.values(choreStatus).sort((a, b) => {
                const aComplete =
                  a.completedMinutes >= a.expectedMinutes &&
                  a.expectedMinutes > 0;
                const bComplete =
                  b.completedMinutes >= b.expectedMinutes &&
                  b.expectedMinutes > 0;
                if (aComplete !== bComplete) {
                  return aComplete ? 1 : -1; // Incomplete first
                }
                return a.choreName.localeCompare(b.choreName);
              });

              if (choreList.length === 0) {
                return (
                  <p className="text-center py-8 text-stone-500">
                    No chores assigned yet. Go to Admin to assign chores.
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {choreList.map((chore) => {
                    const isComplete =
                      chore.completedMinutes >= chore.expectedMinutes &&
                      chore.expectedMinutes > 0;
                    return (
                      <div
                        key={chore.choreId}
                        className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                          isComplete
                            ? "bg-green-50/50 border border-green-100"
                            : "bg-stone-50 border border-stone-100"
                        }`}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span
                            className={`font-medium text-stone-800 ${
                              isComplete ? "line-through text-stone-500" : ""
                            }`}
                          >
                            {chore.choreName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium ${
                              isComplete ? "text-green-700" : "text-stone-600"
                            }`}
                          >
                            {chore.completedMinutes} / {chore.expectedMinutes}{" "}
                            min
                          </span>
                          {isComplete && (
                            <svg
                              className="w-5 h-5 text-green-600"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Community Chores Section */}
          <div className="bg-white rounded-2xl card-shadow p-6 max-w-2xl mx-auto">
            <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
              Community Chores
            </h3>
            {(() => {
              const monthCommunityStats =
                calculateHouseCommunityStats(monthKey);
              const allTimeCommunityStats = calculateHouseCommunityStats(null);

              return (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-stone-500">Total Minutes</p>
                    <p className="text-2xl font-semibold text-stone-800">
                      {allTimeCommunityStats.totalMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">This Month</p>
                    <p className="text-xl font-medium text-stone-700">
                      {monthCommunityStats.totalMinutes} min
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-stone-500">Contributors</p>
                    <p className="text-lg font-medium text-stone-700">
                      {monthCommunityStats.contributors} people
                    </p>
                  </div>
                  {monthCommunityStats.topContributors.length > 0 && (
                    <div className="border-t border-stone-200 pt-4 mt-4">
                      <p className="text-sm font-medium text-stone-700 mb-3">
                        Top Contributors (This Month):
                      </p>
                      <div className="space-y-2">
                        {monthCommunityStats.topContributors.map(
                          (contributor, idx) => (
                            <div
                              key={contributor.personId}
                              className="flex items-center justify-between p-3 bg-stone-50 rounded-xl"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-stone-500 font-medium">
                                  {idx + 1}.
                                </span>
                                <span className="font-medium text-stone-800">
                                  {contributor.name}
                                </span>
                              </div>
                              <span className="text-stone-700 font-medium">
                                {contributor.minutes} min
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* History - Long Term View */}
      {selectedTab === "history" && (
        <div className="space-y-6">
          {(() => {
            // Start from the last N months relative to the currently selected month
            const baseMonths = getLastNMonths(historyMonths);
            const realCurrentMonthKey = getMonthKey(new Date());

            // Filter out months where nobody has any completions (everyone is effectively 0%),
            // but always keep the real current month so the latest period is visible.
            const historyMonthsToShow = baseMonths.filter((m) => {
              if (m.key === realCurrentMonthKey) return true;
              return people.some((person) => {
                const stats = calculatePersonStatsWithoutExpiredDebts(
                  person.id,
                  m.key
                );
                return stats.completedMinutes > 0;
              });
            });

            return (
              <>
                {/* Time range selector */}
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-sm text-stone-600">Show last:</span>
                  <div className="flex gap-2 p-1 bg-stone-100 rounded-xl">
                    {[3, 6, 12].map((n) => (
                      <button
                        key={n}
                        onClick={() => setHistoryMonths(n)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          historyMonths === n
                            ? "bg-white card-shadow text-stone-800"
                            : "text-stone-600 hover:text-stone-800"
                        }`}
                      >
                        {n} months
                      </button>
                    ))}
                  </div>
                </div>

                {/* History Table */}
                <div className="bg-white rounded-2xl card-shadow overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="text-left p-4 font-semibold text-stone-700 sticky left-0 bg-stone-50">
                            Person
                          </th>
                          {historyMonthsToShow.map((m) => (
                            <th
                              key={m.key}
                              className="text-center p-4 font-semibold text-stone-700 min-w-24"
                            >
                              {m.label}
                            </th>
                          ))}
                          <th className="text-center p-4 font-semibold text-stone-700 min-w-28 bg-amber-50">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((person) => {
                          const monthData = historyMonthsToShow.map((m) =>
                            calculatePersonStatsWithoutExpiredDebts(
                              person.id,
                              m.key
                            )
                          );
                          const totalCompleted = monthData.reduce(
                            (sum, m) => sum + m.completedMinutes,
                            0
                          );
                          const totalExpected = monthData.reduce(
                            (sum, m) => sum + m.expectedMinutes,
                            0
                          );
                          const totalPct =
                            totalExpected > 0
                              ? Math.round(
                                  (totalCompleted / totalExpected) * 100
                                )
                              : 0;

                          return (
                            <tr
                              key={person.id}
                              className="border-b border-stone-100 hover:bg-stone-50/50"
                            >
                              <td className="p-4 font-medium text-stone-800 sticky left-0 bg-white">
                                {person.name}
                              </td>
                              {monthData.map((stats, mIdx) => (
                                <td key={mIdx} className="p-4 text-center">
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="text-stone-800 font-medium">
                                      {stats.completedMinutes}
                                    </span>
                                    <span className="text-xs text-stone-400">
                                      / {stats.expectedMinutes}
                                    </span>
                                    <span
                                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                        stats.percentage >= 100
                                          ? "bg-green-100 text-green-700"
                                          : stats.percentage >= 75
                                          ? "bg-amber-100 text-amber-700"
                                          : stats.percentage >= 50
                                          ? "bg-orange-100 text-orange-700"
                                          : "bg-red-100 text-red-700"
                                      }`}
                                    >
                                      {stats.percentage}%
                                    </span>
                                  </div>
                                </td>
                              ))}
                              <td className="p-4 text-center bg-amber-50/50">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-stone-800 font-bold">
                                    {totalCompleted}
                                  </span>
                                  <span className="text-xs text-stone-500">
                                    / {totalExpected} min
                                  </span>
                                  <span
                                    className={`text-sm font-bold ${
                                      totalPct >= 100
                                        ? "text-green-600"
                                        : totalPct >= 75
                                        ? "text-amber-600"
                                        : "text-red-600"
                                    }`}
                                  >
                                    {totalPct}%
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-stone-500">
                  Months where nobody recorded any completions are hidden
                  (except the current month) so the averages aren&apos;t skewed
                  by missing data.
                </p>

                {/* Community Chores History Table */}
                <div className="bg-white rounded-2xl card-shadow overflow-hidden mt-6">
                  <h3 className="font-display text-lg font-semibold text-stone-800 p-4 border-b border-stone-200">
                    Community Chores History
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="text-left p-4 font-semibold text-stone-700 sticky left-0 bg-stone-50">
                            Person
                          </th>
                          {historyMonthsToShow.map((m) => (
                            <th
                              key={m.key}
                              className="text-center p-4 font-semibold text-stone-700 min-w-24"
                            >
                              {m.label}
                            </th>
                          ))}
                          <th className="text-center p-4 font-semibold text-stone-700 min-w-28 bg-cyan-50">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((person) => {
                          const monthData = historyMonthsToShow.map((m) =>
                            calculatePersonCommunityStats(person.id, m.key)
                          );
                          const totalMinutes = monthData.reduce(
                            (sum, m) => sum + m.totalMinutes,
                            0
                          );

                          return (
                            <tr
                              key={person.id}
                              className="border-b border-stone-100 hover:bg-stone-50/50"
                            >
                              <td className="p-4 font-medium text-stone-800 sticky left-0 bg-white">
                                {person.name}
                              </td>
                              {monthData.map((stats, mIdx) => (
                                <td key={mIdx} className="p-4 text-center">
                                  <span className="text-stone-800 font-medium">
                                    {stats.totalMinutes} min
                                  </span>
                                </td>
                              ))}
                              <td className="p-4 text-center bg-cyan-50/50">
                                <span className="text-stone-800 font-bold">
                                  {totalMinutes} min
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {/* Total row */}
                        <tr className="border-t-2 border-stone-300 bg-stone-50">
                          <td className="p-4 font-semibold text-stone-800 sticky left-0 bg-stone-50">
                            Total
                          </td>
                          {historyMonthsToShow.map((m) => {
                            const monthStats = calculateHouseCommunityStats(
                              m.key
                            );
                            return (
                              <td key={m.key} className="p-4 text-center">
                                <span className="text-stone-800 font-semibold">
                                  {monthStats.totalMinutes} min
                                </span>
                              </td>
                            );
                          })}
                          <td className="p-4 text-center bg-cyan-50">
                            <span className="text-stone-800 font-bold">
                              {historyMonthsToShow.reduce(
                                (sum, m) =>
                                  sum +
                                  calculateHouseCommunityStats(m.key)
                                    .totalMinutes,
                                0
                              )}{" "}
                              min
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Chore breakdown per person */}
          <div className="grid gap-4 md:grid-cols-2">
            {people.map((person, idx) => {
              // Aggregate all chores this person has done
              const personCompletions = completions.filter(
                (c) => c.completedBy === person.id
              );
              const choreAgg = {};
              personCompletions.forEach((c) => {
                const chore = chores.find((ch) => ch.id === c.choreId);
                if (chore) {
                  if (!choreAgg[chore.id]) {
                    choreAgg[chore.id] = {
                      name: chore.name,
                      count: 0,
                      totalMinutes: 0,
                    };
                  }
                  choreAgg[chore.id].count++;
                  choreAgg[chore.id].totalMinutes += c.minutes;
                }
              });
              const sortedChores = Object.values(choreAgg).sort(
                (a, b) => b.totalMinutes - a.totalMinutes
              );

              return (
                <div
                  key={person.id}
                  className="bg-white rounded-2xl card-shadow p-6"
                >
                  <h4 className="font-display text-lg font-semibold text-stone-800 mb-4">
                    {person.name}'s All-Time Chores
                  </h4>
                  {sortedChores.length > 0 ? (
                    <div className="space-y-3">
                      {sortedChores.map((chore, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between"
                        >
                          <div>
                            <span className="text-stone-700">{chore.name}</span>
                            <span className="text-stone-400 text-sm ml-2">
                              ×{chore.count}
                            </span>
                          </div>
                          <span className="font-medium text-stone-800">
                            {chore.totalMinutes} min
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-stone-500 text-sm">
                      No chores completed yet
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Debts */}
      {selectedTab === "debts" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl card-shadow p-6">
            <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
              Chore Debts
            </h3>
            {debts.length === 0 || people.length === 0 ? (
              <p className="text-center py-8 text-stone-500">
                No debts yet. When someone does a chore for someone else,
                we&apos;ll track that here.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {people.map((person) => {
                  const owedBy = debts.filter(
                    (d) =>
                      d.debtorId === person.id &&
                      (d.remainingMinutes ?? d.originalMinutes ?? 0) > 0
                  );
                  const owedTo = debts.filter(
                    (d) =>
                      d.creditorId === person.id &&
                      (d.remainingMinutes ?? d.originalMinutes ?? 0) > 0
                  );

                  const totalOwe = owedBy.reduce(
                    (sum, d) =>
                      sum + (d.remainingMinutes ?? d.originalMinutes ?? 0),
                    0
                  );
                  const totalOwed = owedTo.reduce(
                    (sum, d) =>
                      sum + (d.remainingMinutes ?? d.originalMinutes ?? 0),
                    0
                  );

                  if (owedBy.length === 0 && owedTo.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      key={person.id}
                      className="bg-stone-50 rounded-2xl border border-stone-100 p-4"
                    >
                      <h4 className="font-display text-lg font-semibold text-stone-800 mb-2">
                        {person.name}
                      </h4>
                      <div className="text-sm text-stone-600 mb-3">
                        <span className="mr-4">
                          You owe:{" "}
                          <span className="font-semibold text-amber-700">
                            {totalOwe} min
                          </span>
                        </span>
                        <span>
                          You are owed:{" "}
                          <span className="font-semibold text-emerald-700">
                            {totalOwed} min
                          </span>
                        </span>
                      </div>

                      {owedTo.length > 0 && (
                        <div className="mb-3">
                          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">
                            Others owe you
                          </p>
                          <div className="space-y-1">
                            {owedTo.map((d) => {
                              const debtor = people.find(
                                (p) => p.id === d.debtorId
                              );
                              const chore = chores.find(
                                (c) => c.id === d.choreId
                              );
                              // Get completion date to determine historical chore name
                              const sourceCompletion = completions.find(
                                (c) => c.id === d.sourceCompletionId
                              );
                              const completionDate = sourceCompletion?.date;
                              const choreName = chore && completionDate
                                ? getChoreNameAtDate(chore, completionDate)
                                : chore?.name || "";
                              const remaining =
                                d.remainingMinutes ?? d.originalMinutes ?? 0;
                              const status = getDebtStatus(d);
                              return (
                                <div
                                  key={d.id}
                                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-stone-800">
                                      {debtor?.name}{" "}
                                      {choreName ? `(${choreName})` : ""}
                                    </p>
                                    <p className="text-xs text-stone-500">
                                      Remaining {remaining} min
                                      {d.dueDate && <> • due {d.dueDate}</>}
                                    </p>
                                  </div>
                                  <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      status === "overdue"
                                        ? "bg-red-100 text-red-700"
                                        : status === "open"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {status === "overdue"
                                      ? "Overdue"
                                      : status === "open"
                                      ? "Open"
                                      : "Paid"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {owedBy.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">
                            You owe others
                          </p>
                          <div className="space-y-1">
                            {owedBy.map((d) => {
                              const creditor = people.find(
                                (p) => p.id === d.creditorId
                              );
                              const chore = chores.find(
                                (c) => c.id === d.choreId
                              );
                              // Get completion date to determine historical chore name
                              const sourceCompletion = completions.find(
                                (c) => c.id === d.sourceCompletionId
                              );
                              const completionDate = sourceCompletion?.date;
                              const choreName = chore && completionDate
                                ? getChoreNameAtDate(chore, completionDate)
                                : chore?.name || "";
                              const remaining =
                                d.remainingMinutes ?? d.originalMinutes ?? 0;
                              const status = getDebtStatus(d);
                              const isExpired = !!d.expiredAt;
                              return (
                                <div
                                  key={d.id}
                                  className={`flex items-center justify-between rounded-xl bg-white px-3 py-2 ${
                                    isExpired ? "opacity-60 line-through" : ""
                                  }`}
                                >
                                  <div>
                                    <p className="text-sm font-medium text-stone-800">
                                      {creditor?.name}{" "}
                                      {choreName ? `(${choreName})` : ""}
                                      {isExpired && (
                                        <span className="ml-2 text-xs text-stone-500">
                                          (Expired)
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-xs text-stone-500">
                                      Remaining {remaining} min
                                      {d.dueDate && <> • due {d.dueDate}</>}
                                      {d.expiredAt && (
                                        <>
                                          {" "}
                                          • expired{" "}
                                          {new Date(
                                            d.expiredAt
                                          ).toLocaleDateString()}
                                        </>
                                      )}
                                    </p>
                                  </div>
                                  <span
                                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                      status === "overdue"
                                        ? "bg-red-100 text-red-700"
                                        : status === "open"
                                        ? "bg-amber-100 text-amber-700"
                                        : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {status === "overdue"
                                      ? "Overdue"
                                      : status === "open"
                                      ? "Open"
                                      : "Paid"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="text-xs text-stone-500">
            Debts are created when someone does a chore for someone else, and
            are paid down automatically (oldest-first) when the debtor later
            does chores for the creditor.
          </p>
        </div>
      )}

      {/* Fees/Credits */}
      {selectedTab === "fees" && (
        <div className="space-y-6">
          {!feeSettings ? (
            <div className="bg-white rounded-2xl card-shadow p-8 text-center">
              <p className="text-stone-500">Loading fee settings...</p>
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="flex items-center justify-end flex-wrap gap-4">
                <button
                  onClick={() => calculateMonthlyFees(monthKey)}
                  className="px-4 py-2 rounded-xl bg-stone-100 text-stone-700 font-medium hover:bg-stone-200 transition-colors"
                >
                  Recalculate
                </button>
              </div>

              {/* Fees Table */}
              <div className="bg-white rounded-2xl card-shadow">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="text-left p-4 font-semibold text-stone-700">
                          Person
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Completion %
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Base Fee/Credit
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Expired Debt Fees
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Community Chore Credit
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Total
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Status
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((person) => {
                        // Use stats WITHOUT expired debts to match Individual tab
                        const stats = calculatePersonStatsWithoutExpiredDebts(
                          person.id,
                          monthKey
                        );
                        const baseFee = calculateBaseFee(
                          stats.percentage,
                          feeSettings
                        );
                        const monthlyFee = monthlyFees.find(
                          (f) =>
                            f.personId === person.id && f.monthKey === monthKey
                        );

                        if (!monthlyFee) {
                          // Calculate expired debt fees on-the-fly for display
                          // Find expired debts that should contribute to this month
                          const expiredDebtsForMonth = debts.filter((d) => {
                            if (
                              !d.expiredAt ||
                              (d.remainingMinutes ?? 0) <= 0 ||
                              d.debtorId !== person.id
                            ) {
                              return false;
                            }
                            // Expired debt fees go to the expiration month
                            const expirationDate = new Date(d.expiredAt);
                            const expirationMonthKey =
                              getMonthKey(expirationDate);
                            return expirationMonthKey === monthKey;
                          });

                          // Calculate expired debt fees (simplified - will be properly calculated when processed)
                          let expiredDebtFees = 0;
                          // Note: Full calculation requires processing expired debts, which happens via processExpiredDebts
                          // For display purposes, we'll show 0 if not yet calculated

                          const communityCredit = calculateCommunityChoreCredit(
                            person.id,
                            monthKey,
                            feeSettings
                          );
                          const totalFee =
                            baseFee + expiredDebtFees - communityCredit;

                          return (
                            <tr
                              key={person.id}
                              className="border-b border-stone-100 hover:bg-stone-50/50"
                            >
                              <td className="p-4 font-medium text-stone-800">
                                {person.name}
                              </td>
                              <td className="p-4 text-center text-stone-700">
                                {stats.percentage}%
                              </td>
                              <td
                                className={`p-4 text-center font-medium ${
                                  baseFee < 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {baseFee < 0 ? "-" : ""}$
                                {Math.abs(baseFee).toFixed(2)}
                              </td>
                              <td className="p-4 text-center text-stone-600">
                                $0.00
                              </td>
                              <td className="p-4 text-center text-green-600 font-medium">
                                ${communityCredit.toFixed(2)}
                              </td>
                              <td
                                className={`p-4 text-center font-semibold ${
                                  totalFee < 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {totalFee < 0 ? "-" : ""}$
                                {Math.abs(totalFee).toFixed(2)}
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                  Pending
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                <span className="text-xs text-stone-400">
                                  —
                                </span>
                              </td>
                            </tr>
                          );
                        }

                        if (monthlyFee) {
                          // Check for expired debts that should contribute to this month
                          const expiredDebtsForMonth = debts.filter((d) => {
                            if (
                              !d.expiredAt ||
                              (d.remainingMinutes ?? 0) <= 0 ||
                              d.debtorId !== person.id
                            ) {
                              return false;
                            }
                            // Expired debt fees go to the expiration month
                            const expirationDate = new Date(d.expiredAt);
                            const expirationMonthKey =
                              getMonthKey(expirationDate);
                            return expirationMonthKey === monthKey;
                          });
                          const unprocessedExpiredDebts =
                            expiredDebtsForMonth.filter(
                              (d) => !d.feeCalculated
                            );

                          const communityCredit =
                            monthlyFee.communityChoreCredit ||
                            calculateCommunityChoreCredit(
                              person.id,
                              monthKey,
                              feeSettings
                            );
                          const actualTotal =
                            monthlyFee.totalFee - communityCredit;

                          return (
                            <tr
                              key={person.id}
                              className={`border-b border-stone-100 hover:bg-stone-50/50 ${
                                monthlyFee.processed ? "opacity-60" : ""
                              }`}
                            >
                              <td className="p-4 font-medium text-stone-800">
                                {person.name}
                              </td>
                              <td className="p-4 text-center text-stone-700">
                                {stats.percentage}%
                              </td>
                              <td
                                className={`p-4 text-center font-medium ${
                                  monthlyFee.baseFee < 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {monthlyFee.baseFee < 0 ? "-" : ""}$
                                {Math.abs(monthlyFee.baseFee).toFixed(2)}
                              </td>
                              <td className="p-4 text-center text-red-600 font-medium">
                                ${(monthlyFee.expiredDebtFees || 0).toFixed(2)}
                                {unprocessedExpiredDebts.length > 0 && (
                                  <span className="block text-xs text-amber-600 mt-1">
                                    ({unprocessedExpiredDebts.length} expired
                                    debt
                                    {unprocessedExpiredDebts.length > 1
                                      ? "s"
                                      : ""}{" "}
                                    pending calculation)
                                  </span>
                                )}
                              </td>
                              <td className="p-4 text-center text-green-600 font-medium">
                                ${communityCredit.toFixed(2)}
                              </td>
                              <td
                                className={`p-4 text-center font-semibold ${
                                  actualTotal < 0
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {actualTotal < 0 ? "-" : ""}$
                                {Math.abs(actualTotal).toFixed(2)}
                              </td>
                              <td className="p-4 text-center">
                                <span
                                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    monthlyFee.processed
                                      ? "bg-stone-100 text-stone-700"
                                      : "bg-amber-100 text-amber-700"
                                  }`}
                                >
                                  {monthlyFee.processed
                                    ? "Processed"
                                    : "Pending"}
                                </span>
                              </td>
                              <td className="p-4 text-center">
                                {!monthlyFee.processed && (
                                  <button
                                    onClick={async () => {
                                      await updateDoc(
                                        doc(db, "monthlyFees", monthlyFee.id),
                                        { processed: true }
                                      );
                                    }}
                                    className="text-xs text-stone-600 hover:text-stone-800 underline"
                                  >
                                    Mark Processed
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        }

                        return null;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Running Tally */}
              <div className="bg-white rounded-2xl card-shadow p-6">
                <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
                  Running Tally
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-200">
                        <th className="text-left p-4 font-semibold text-stone-700">
                          Person
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Total Base Fees
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Total Expired Debt Fees
                        </th>
                        <th className="text-center p-4 font-semibold text-stone-700">
                          Grand Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {people.map((person) => {
                        const personFees = monthlyFees.filter(
                          (f) => f.personId === person.id && f.processed
                        );
                        const totalBase = personFees.reduce(
                          (sum, f) => sum + (f.baseFee || 0),
                          0
                        );
                        const totalExpired = personFees.reduce(
                          (sum, f) => sum + (f.expiredDebtFees || 0),
                          0
                        );
                        const grandTotal = totalBase + totalExpired;

                        return (
                          <tr
                            key={person.id}
                            className="border-b border-stone-100 hover:bg-stone-50/50"
                          >
                            <td className="p-4 font-medium text-stone-800">
                              {person.name}
                            </td>
                            <td
                              className={`p-4 text-center font-medium ${
                                totalBase < 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {totalBase < 0 ? "-" : ""}$
                              {Math.abs(totalBase).toFixed(2)}
                            </td>
                            <td className="p-4 text-center text-red-600 font-medium">
                              ${totalExpired.toFixed(2)}
                            </td>
                            <td
                              className={`p-4 text-center font-semibold ${
                                grandTotal < 0
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {grandTotal < 0 ? "-" : ""}$
                              {Math.abs(grandTotal).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-stone-500 mt-4">
                  Running tally includes only processed fees (fees that have
                  been included in rent calculations).
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Progress Ring Component
function ProgressRing({ percentage, size = 64, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset =
    circumference - (Math.min(percentage, 100) / 100) * circumference;

  const getColor = (pct) => {
    if (pct >= 100) return "#81b29a";
    if (pct >= 75) return "#f2cc8f";
    if (pct >= 50) return "#e07a5f";
    return "#ef4444";
  };

  return (
    <svg width={size} height={size} className="progress-ring">
      <circle
        stroke="#e7e5e4"
        fill="transparent"
        strokeWidth={strokeWidth}
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        stroke={getColor(percentage)}
        fill="transparent"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        r={radius}
        cx={size / 2}
        cy={size / 2}
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy=".3em"
        className="text-xs font-medium fill-stone-700"
        style={{ transform: "rotate(90deg)", transformOrigin: "center" }}
      >
        {percentage}%
      </text>
    </svg>
  );
}

// Admin View Component
function AdminView({
  people,
  chores,
  assignments,
  feeSettings,
  communityChoreTypes,
  db,
}) {
  const [activeSection, setActiveSection] = useState("people");
  const [rewardThreshold, setRewardThreshold] = useState(
    feeSettings?.rewardThreshold || 90
  );
  const [rewardAmount, setRewardAmount] = useState(
    feeSettings?.rewardAmount || 20
  );
  const [penaltyModifier, setPenaltyModifier] = useState(
    feeSettings?.penaltyModifier || 1.0
  );
  const [savingSettings, setSavingSettings] = useState(false);

  // Update local state when feeSettings change
  useEffect(() => {
    if (feeSettings) {
      setRewardThreshold(feeSettings.rewardThreshold || 90);
      setRewardAmount(feeSettings.rewardAmount || 20);
      setPenaltyModifier(feeSettings.penaltyModifier || 1.0);
      if (feeSettings.communityCreditTiers) {
        setCommunityCreditTiers(feeSettings.communityCreditTiers);
      }
    }
  }, [feeSettings]);
  const [newPersonName, setNewPersonName] = useState("");
  const [newChoreName, setNewChoreName] = useState("");
  const [newChoreMinutes, setNewChoreMinutes] = useState("");
  const [selectedPersonForAssignment, setSelectedPersonForAssignment] =
    useState("");
  const [selectedChoreForAssignment, setSelectedChoreForAssignment] =
    useState("");
  const [timesPerMonth, setTimesPerMonth] = useState("");
  const [isDaySpecific, setIsDaySpecific] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState("");
  const [newCommunityChoreTypeName, setNewCommunityChoreTypeName] =
    useState("");
  const [communityCreditTiers, setCommunityCreditTiers] = useState(
    feeSettings?.communityCreditTiers || [
      { min: 0, credit: 0 },
      { min: 30, credit: 5 },
      { min: 60, credit: 10 },
      { min: 90, credit: 15 },
      { min: 120, credit: 20 },
    ]
  );

  // Edit modal state
  const [editingChore, setEditingChore] = useState(null);
  const [editChoreName, setEditChoreName] = useState("");
  const [editChoreMinutes, setEditChoreMinutes] = useState("");
  const [editChoreEffectiveDate, setEditChoreEffectiveDate] = useState("");
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [editAssignmentFrequency, setEditAssignmentFrequency] = useState("");
  const [editAssignmentEffectiveDate, setEditAssignmentEffectiveDate] =
    useState("");

  const dayNamesLong = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];

  const addPerson = async () => {
    if (!newPersonName.trim()) return;
    const id = generateId();
    await setDoc(doc(db, "people", id), { id, name: newPersonName.trim() });
    setNewPersonName("");
  };

  const deletePerson = async (id) => {
    await deleteDoc(doc(db, "people", id));
    // Also delete their assignments
    const personAssignments = assignments.filter((a) => a.personId === id);
    for (const assignment of personAssignments) {
      await deleteDoc(doc(db, "assignments", assignment.id));
    }
  };

  const addChore = async () => {
    if (!newChoreName.trim() || !newChoreMinutes) return;
    const id = generateId();
    await setDoc(doc(db, "chores", id), {
      id,
      name: newChoreName.trim(),
      minutes: parseInt(newChoreMinutes),
    });
    setNewChoreName("");
    setNewChoreMinutes("");
  };

  const deleteChore = async (id) => {
    await deleteDoc(doc(db, "chores", id));
    // Also delete related assignments
    const choreAssignments = assignments.filter((a) => a.choreId === id);
    for (const assignment of choreAssignments) {
      await deleteDoc(doc(db, "assignments", assignment.id));
    }
  };

  const openEditChoreModal = (chore) => {
    setEditingChore(chore);
    setEditChoreName(chore.name);
    setEditChoreMinutes(chore.minutes.toString());
    // Default to today's date
    const today = new Date().toISOString().split("T")[0];
    setEditChoreEffectiveDate(today);
  };

  const closeEditChoreModal = () => {
    setEditingChore(null);
    setEditChoreName("");
    setEditChoreMinutes("");
    setEditChoreEffectiveDate("");
  };

  const saveEditChore = async () => {
    if (!editingChore || !editChoreName.trim() || !editChoreMinutes) return;

    const newMinutes = parseInt(editChoreMinutes);
    if (Number.isNaN(newMinutes) || newMinutes <= 0) return;

    // Validate effective date (cannot be in the future)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveDate = new Date(editChoreEffectiveDate + "T12:00:00");
    if (effectiveDate > today) {
      alert("Effective date cannot be in the future");
      return;
    }

    const choreRef = doc(db, "chores", editingChore.id);
    const currentChore = chores.find((c) => c.id === editingChore.id);
    if (!currentChore) return;

    // Prepare history entry with current values
    const historyEntry = {
      minutes: currentChore.minutes,
      effectiveDate: currentChore.effectiveDate || editChoreEffectiveDate,
    };

    // If name changed, store old name in history
    if (currentChore.name !== editChoreName.trim()) {
      historyEntry.name = currentChore.name;
    }

    // Build update object
    const updateData = {
      name: editChoreName.trim(),
      minutes: newMinutes,
      effectiveDate: editChoreEffectiveDate,
      lastChangedAt: new Date().toISOString(),
    };

    // Add to history array
    const existingHistory = currentChore.history || [];
    updateData.history = [...existingHistory, historyEntry];

    await updateDoc(choreRef, updateData);
    closeEditChoreModal();
  };

  const openEditAssignmentModal = (assignment) => {
    setEditingAssignment(assignment);
    setEditAssignmentFrequency(assignment.timesPerMonth.toString());
    // Default to today's date
    const today = new Date().toISOString().split("T")[0];
    setEditAssignmentEffectiveDate(today);
  };

  const closeEditAssignmentModal = () => {
    setEditingAssignment(null);
    setEditAssignmentFrequency("");
    setEditAssignmentEffectiveDate("");
  };

  const saveEditAssignment = async () => {
    if (!editingAssignment || !editAssignmentFrequency) return;

    const newFrequency = parseInt(editAssignmentFrequency);
    if (Number.isNaN(newFrequency) || newFrequency <= 0) {
      alert("Frequency must be greater than 0");
      return;
    }

    // Validate effective date (cannot be in the future)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const effectiveDate = new Date(
      editAssignmentEffectiveDate + "T12:00:00"
    );
    if (effectiveDate > today) {
      alert("Effective date cannot be in the future");
      return;
    }

    const assignmentRef = doc(db, "assignments", editingAssignment.id);
    const currentAssignment = assignments.find(
      (a) => a.id === editingAssignment.id
    );
    if (!currentAssignment) return;

    // Prepare history entry with current values
    const historyEntry = {
      timesPerMonth: currentAssignment.timesPerMonth,
      effectiveDate:
        currentAssignment.effectiveDate || editAssignmentEffectiveDate,
    };

    // Build update object
    const updateData = {
      timesPerMonth: newFrequency,
      effectiveDate: editAssignmentEffectiveDate,
      lastChangedAt: new Date().toISOString(),
    };

    // Add to history array
    const existingHistory = currentAssignment.history || [];
    updateData.history = [...existingHistory, historyEntry];

    await updateDoc(assignmentRef, updateData);
    closeEditAssignmentModal();
  };

  const addAssignment = async () => {
    if (
      !selectedPersonForAssignment ||
      !selectedChoreForAssignment ||
      !timesPerMonth
    )
      return;

    const parsedTimesPerMonth = parseInt(timesPerMonth, 10);
    if (Number.isNaN(parsedTimesPerMonth) || parsedTimesPerMonth <= 0) return;

    const dayOfWeekValue =
      isDaySpecific && dayOfWeek !== "" ? parseInt(dayOfWeek, 10) : null;

    // Check if assignment already exists for this person/chore/dayOfWeek combo
    const existing = assignments.find((a) => {
      if (
        a.personId !== selectedPersonForAssignment ||
        a.choreId !== selectedChoreForAssignment
      ) {
        return false;
      }

      const aDay =
        a.dayOfWeek === undefined || a.dayOfWeek === null ? null : a.dayOfWeek;
      const targetDay = dayOfWeekValue === null ? null : dayOfWeekValue;

      return aDay === targetDay;
    });

    if (existing) {
      await updateDoc(doc(db, "assignments", existing.id), {
        timesPerMonth: parsedTimesPerMonth,
        dayOfWeek: dayOfWeekValue,
      });
    } else {
      const id = generateId();
      await setDoc(doc(db, "assignments", id), {
        id,
        personId: selectedPersonForAssignment,
        choreId: selectedChoreForAssignment,
        timesPerMonth: parsedTimesPerMonth,
        dayOfWeek: dayOfWeekValue,
      });
    }

    setSelectedPersonForAssignment("");
    setSelectedChoreForAssignment("");
    setTimesPerMonth("");
    setIsDaySpecific(false);
    setDayOfWeek("");
  };

  const deleteAssignment = async (id) => {
    await deleteDoc(doc(db, "assignments", id));
  };

  const addCommunityChoreType = async () => {
    if (!newCommunityChoreTypeName.trim()) return;
    const id = generateId();
    await setDoc(doc(db, "communityChoreTypes", id), {
      id,
      name: newCommunityChoreTypeName.trim(),
      createdAt: new Date().toISOString(),
    });
    setNewCommunityChoreTypeName("");
  };

  const deleteCommunityChoreType = async (id) => {
    await deleteDoc(doc(db, "communityChoreTypes", id));
  };

  return (
    <div className="fade-in">
      <h2 className="font-display text-3xl font-semibold text-stone-800 mb-8">
        Admin Settings
      </h2>

      {/* Section Tabs */}
      <div className="flex gap-2 mb-6 p-1 bg-stone-100 rounded-xl w-fit">
        {[
          { id: "people", label: "People" },
          { id: "chores", label: "Chores" },
          { id: "assignments", label: "Assignments" },
          { id: "feeSettings", label: "Fee Settings" },
          { id: "communityChores", label: "Community Chores" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeSection === tab.id
                ? "bg-white card-shadow text-stone-800"
                : "text-stone-600 hover:text-stone-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* People Section */}
      {activeSection === "people" && (
        <div className="bg-white rounded-2xl card-shadow p-6">
          <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
            Household Members
          </h3>

          {/* Add Person */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newPersonName}
              onChange={(e) => setNewPersonName(e.target.value)}
              placeholder="Enter name..."
              className="flex-1 px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
              onKeyPress={(e) => e.key === "Enter" && addPerson()}
            />
            <button
              onClick={addPerson}
              className="px-6 py-3 rounded-xl btn-primary text-white font-medium"
            >
              Add
            </button>
          </div>

          {/* People List */}
          <div className="space-y-2">
            {[...people]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((person) => (
                <div
                  key={person.id}
                  className="flex items-center justify-between p-4 bg-stone-50 rounded-xl"
                >
                  <span className="font-medium text-stone-800">
                    {person.name}
                  </span>
                  <button
                    onClick={() => deletePerson(person.id)}
                    className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            {people.length === 0 && (
              <p className="text-center py-8 text-stone-500">
                No people added yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Chores Section */}
      {activeSection === "chores" && (
        <div className="bg-white rounded-2xl card-shadow p-6">
          <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
            Chore List
          </h3>

          {/* Add Chore */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newChoreName}
              onChange={(e) => setNewChoreName(e.target.value)}
              placeholder="Chore name..."
              className="flex-1 px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
            />
            <input
              type="number"
              value={newChoreMinutes}
              onChange={(e) => setNewChoreMinutes(e.target.value)}
              placeholder="Minutes"
              className="w-28 px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
            />
            <button
              onClick={addChore}
              className="px-6 py-3 rounded-xl btn-primary text-white font-medium"
            >
              Add
            </button>
          </div>

          {/* Chores List */}
          <div className="space-y-2">
            {[...chores]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((chore) => (
                <div
                  key={chore.id}
                  className="flex items-center justify-between p-4 bg-stone-50 rounded-xl"
                >
                  <div>
                    <span className="font-medium text-stone-800">
                      {chore.name}
                    </span>
                    <span className="ml-2 text-sm text-stone-500">
                      ({chore.minutes} min)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditChoreModal(chore)}
                      className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                      title="Edit chore"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteChore(chore.id)}
                      className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                      title="Delete chore"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            {chores.length === 0 && (
              <p className="text-center py-8 text-stone-500">
                No chores added yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Assignments Section */}
      {activeSection === "assignments" && (
        <div className="bg-white rounded-2xl card-shadow p-6">
          <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
            Chore Assignments
          </h3>

          {/* Add Assignment */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-6">
            <select
              value={selectedPersonForAssignment}
              onChange={(e) => setSelectedPersonForAssignment(e.target.value)}
              className="px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
            >
              <option value="">Select person...</option>
              {[...people]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
            <select
              value={selectedChoreForAssignment}
              onChange={(e) => setSelectedChoreForAssignment(e.target.value)}
              className="px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
            >
              <option value="">Select chore...</option>
              {[...chores]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((chore) => (
                  <option key={chore.id} value={chore.id}>
                    {chore.name}
                  </option>
                ))}
            </select>
            <input
              type="number"
              value={timesPerMonth}
              onChange={(e) => setTimesPerMonth(e.target.value)}
              placeholder="Times/month"
              className="px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
            />
            <button
              onClick={addAssignment}
              className="px-6 py-3 rounded-xl btn-primary text-white font-medium"
            >
              Assign
            </button>
          </div>

          {/* Day-specific (weekly) option */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <input
                id="day-specific-toggle"
                type="checkbox"
                checked={isDaySpecific}
                onChange={(e) => {
                  setIsDaySpecific(e.target.checked);
                  if (!e.target.checked) {
                    setDayOfWeek("");
                  }
                }}
                className="h-4 w-4 rounded border-stone-300 text-stone-700 focus:ring-stone-500"
              />
              <label
                htmlFor="day-specific-toggle"
                className="text-sm font-medium text-stone-700"
              >
                Day-specific (weekly kitchen duty style)
              </label>
            </div>
            {isDaySpecific && (
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                className="px-4 py-2 rounded-xl border border-stone-200 bg-stone-50 text-sm"
              >
                <option value="">Select day of week...</option>
                {dayNamesLong.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Assignments List */}
          <div className="space-y-2">
            {[...assignments]
              .map((assignment) => {
                const person = people.find((p) => p.id === assignment.personId);
                const chore = chores.find((c) => c.id === assignment.choreId);
                return { assignment, person, chore };
              })
              .filter((item) => item.person && item.chore)
              .sort((a, b) => a.person.name.localeCompare(b.person.name))
              .map(({ assignment, person, chore }) => (
                <div
                  key={assignment.id}
                  className="flex items-center justify-between p-4 bg-stone-50 rounded-xl"
                >
                  <div>
                    <span className="font-medium text-stone-800">
                      {person.name}
                    </span>
                    <span className="mx-2 text-stone-400">→</span>
                    <span className="text-stone-700">{chore.name}</span>
                    <span className="ml-2 text-sm text-stone-500">
                      ({assignment.timesPerMonth}x/month ={" "}
                      {chore.minutes * assignment.timesPerMonth} min)
                    </span>
                    {assignment.dayOfWeek !== undefined &&
                      assignment.dayOfWeek !== null && (
                        <span className="ml-2 text-sm text-stone-500">
                          on {dayNamesLong[assignment.dayOfWeek]}
                        </span>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditAssignmentModal(assignment)}
                      className="p-2 text-stone-400 hover:text-stone-600 transition-colors"
                      title="Edit assignment"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteAssignment(assignment.id)}
                      className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                      title="Delete assignment"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            {assignments.length === 0 && (
              <p className="text-center py-8 text-stone-500">
                No assignments yet. Add people and chores first, then assign
                them.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Fee Settings Section */}
      {activeSection === "feeSettings" && (
        <div className="bg-white rounded-2xl card-shadow p-6">
          <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
            Fee & Credit Settings
          </h3>

          <div className="space-y-6 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Reward Threshold (%)
              </label>
              <p className="text-xs text-stone-500 mb-2">
                Completion percentage required to receive a reward credit
              </p>
              <input
                type="number"
                value={rewardThreshold}
                onChange={(e) =>
                  setRewardThreshold(parseFloat(e.target.value) || 90)
                }
                min="0"
                max="100"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Reward Amount ($)
              </label>
              <p className="text-xs text-stone-500 mb-2">
                Dollar amount of credit received when meeting the reward
                threshold
              </p>
              <input
                type="number"
                value={rewardAmount}
                onChange={(e) =>
                  setRewardAmount(parseFloat(e.target.value) || 20)
                }
                min="0"
                step="0.01"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">
                Penalty Modifier
              </label>
              <p className="text-xs text-stone-500 mb-2">
                Multiplier for penalty calculation: (100 - completion%) ×
                modifier
              </p>
              <input
                type="number"
                value={penaltyModifier}
                onChange={(e) =>
                  setPenaltyModifier(parseFloat(e.target.value) || 1.0)
                }
                min="0"
                step="0.1"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
              />
            </div>

            <div className="bg-stone-50 rounded-xl p-4">
              <p className="text-sm font-medium text-stone-700 mb-2">
                Example Calculations:
              </p>
              <ul className="text-xs text-stone-600 space-y-1">
                <li>
                  • 80% completion: Fee = (100 - 80) × {penaltyModifier} = $
                  {((100 - 80) * penaltyModifier).toFixed(2)}
                </li>
                <li>
                  • {rewardThreshold}% completion: Credit = -$
                  {rewardAmount.toFixed(2)}
                </li>
                <li>
                  • 50% completion: Fee = (100 - 50) × {penaltyModifier} = $
                  {((100 - 50) * penaltyModifier).toFixed(2)}
                </li>
              </ul>
            </div>

            <button
              onClick={async () => {
                setSavingSettings(true);
                const settingsData = {
                  id: "settings",
                  rewardThreshold,
                  rewardAmount,
                  penaltyModifier,
                  communityCreditTiers: communityCreditTiers.sort(
                    (a, b) => a.min - b.min
                  ),
                  lastUpdated: new Date().toISOString(),
                };
                await setDoc(doc(db, "feeSettings", "settings"), settingsData);
                setSavingSettings(false);
              }}
              disabled={savingSettings}
              className="px-6 py-3 rounded-xl btn-primary text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>

          {/* Community Chore Credit Settings */}
          <div className="mt-8 pt-8 border-t border-stone-200">
            <h4 className="font-display text-lg font-semibold text-stone-800 mb-4">
              Community Chore Credit Settings
            </h4>
            <p className="text-sm text-stone-600 mb-4">
              Set credit tiers based on total community minutes completed per
              month. Credits are fixed amounts per minute range.
            </p>

            <div className="space-y-3 mb-4">
              {communityCreditTiers
                .sort((a, b) => a.min - b.min)
                .map((tier, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl"
                  >
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          Min Minutes
                        </label>
                        <input
                          type="number"
                          value={tier.min}
                          onChange={(e) => {
                            const newTiers = [...communityCreditTiers];
                            newTiers[index] = {
                              ...newTiers[index],
                              min: parseInt(e.target.value) || 0,
                            };
                            setCommunityCreditTiers(newTiers);
                          }}
                          min="0"
                          className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-700 mb-1">
                          Credit ($)
                        </label>
                        <input
                          type="number"
                          value={tier.credit}
                          onChange={(e) => {
                            const newTiers = [...communityCreditTiers];
                            newTiers[index] = {
                              ...newTiers[index],
                              credit: parseFloat(e.target.value) || 0,
                            };
                            setCommunityCreditTiers(newTiers);
                          }}
                          min="0"
                          step="0.01"
                          className="w-full px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (communityCreditTiers.length > 1) {
                          const newTiers = communityCreditTiers.filter(
                            (_, i) => i !== index
                          );
                          setCommunityCreditTiers(newTiers);
                        }
                      }}
                      disabled={communityCreditTiers.length <= 1}
                      className="p-2 text-stone-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
            </div>

            <button
              onClick={() => {
                const newTiers = [...communityCreditTiers];
                newTiers.push({ min: 0, credit: 0 });
                setCommunityCreditTiers(newTiers);
              }}
              className="mb-4 px-4 py-2 rounded-lg border border-stone-300 text-stone-700 text-sm font-medium hover:bg-stone-50 transition-colors"
            >
              + Add Tier
            </button>

            <div className="bg-stone-50 rounded-xl p-4">
              <p className="text-sm font-medium text-stone-700 mb-2">
                Example Calculation:
              </p>
              <p className="text-xs text-stone-600">
                If someone completes 60 minutes of community chores in a month,
                they earn $
                {communityCreditTiers
                  .sort((a, b) => b.min - a.min)
                  .find((tier) => 60 >= tier.min)?.credit || 0}{" "}
                credit (based on the highest tier they qualify for).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Community Chores Section */}
      {activeSection === "communityChores" && (
        <div className="bg-white rounded-2xl card-shadow p-6">
          <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
            Community Chore Types
          </h3>
          <p className="text-sm text-stone-600 mb-6">
            Community chores are unassigned chores that anyone can do. Minutes
            are entered when recording the completion.
          </p>

          {/* Add Community Chore Type */}
          <div className="flex gap-3 mb-6">
            <input
              type="text"
              value={newCommunityChoreTypeName}
              onChange={(e) => setNewCommunityChoreTypeName(e.target.value)}
              placeholder="Enter community chore type name..."
              className="flex-1 px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
              onKeyPress={(e) => e.key === "Enter" && addCommunityChoreType()}
            />
            <button
              onClick={addCommunityChoreType}
              className="px-6 py-3 rounded-xl btn-primary text-white font-medium"
            >
              Add
            </button>
          </div>

          {/* Community Chore Types List */}
          <div className="space-y-2">
            {[...communityChoreTypes]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((type) => (
                <div
                  key={type.id}
                  className="flex items-center justify-between p-4 bg-stone-50 rounded-xl"
                >
                  <span className="font-medium text-stone-800">
                    {type.name}
                  </span>
                  <button
                    onClick={() => deleteCommunityChoreType(type.id)}
                    className="p-2 text-stone-400 hover:text-red-500 transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            {communityChoreTypes.length === 0 && (
              <p className="text-center py-8 text-stone-500">
                No community chore types added yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Edit Chore Modal */}
      {editingChore && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl card-shadow p-6 max-w-md w-full mx-4">
            <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
              Edit Chore
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Chore Name
                </label>
                <input
                  type="text"
                  value={editChoreName}
                  onChange={(e) => setEditChoreName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
                  placeholder="Chore name..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Minutes
                </label>
                <input
                  type="number"
                  value={editChoreMinutes}
                  onChange={(e) => setEditChoreMinutes(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
                  placeholder="Minutes"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Effective Date
                </label>
                <p className="text-xs text-stone-500 mb-2">
                  When did these values become effective? (Cannot be in the
                  future)
                </p>
                <input
                  type="date"
                  value={editChoreEffectiveDate}
                  onChange={(e) => setEditChoreEffectiveDate(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeEditChoreModal}
                  className="flex-1 px-6 py-3 rounded-xl border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditChore}
                  className="flex-1 px-6 py-3 rounded-xl btn-primary text-white font-medium"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Assignment Modal */}
      {editingAssignment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl card-shadow p-6 max-w-md w-full mx-4">
            <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
              Edit Assignment
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Person
                </label>
                <input
                  type="text"
                  value={
                    people.find((p) => p.id === editingAssignment.personId)
                      ?.name || ""
                  }
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-100 text-stone-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Chore
                </label>
                <input
                  type="text"
                  value={
                    chores.find((c) => c.id === editingAssignment.choreId)
                      ?.name || ""
                  }
                  disabled
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-100 text-stone-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Times Per Month
                </label>
                <input
                  type="number"
                  value={editAssignmentFrequency}
                  onChange={(e) => setEditAssignmentFrequency(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
                  placeholder="Times/month"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">
                  Effective Date
                </label>
                <p className="text-xs text-stone-500 mb-2">
                  When did this frequency become effective? (Cannot be in the
                  future)
                </p>
                <input
                  type="date"
                  value={editAssignmentEffectiveDate}
                  onChange={(e) =>
                    setEditAssignmentEffectiveDate(e.target.value)
                  }
                  max={new Date().toISOString().split("T")[0]}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 bg-stone-50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={closeEditAssignmentModal}
                  className="flex-1 px-6 py-3 rounded-xl border border-stone-300 text-stone-700 font-medium hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEditAssignment}
                  className="flex-1 px-6 py-3 rounded-xl btn-primary text-white font-medium"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
