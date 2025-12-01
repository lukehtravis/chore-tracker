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

// Main App Component
export default function App() {
  const [currentView, setCurrentView] = useState("calendar");
  const [people, setPeople] = useState([]);
  const [chores, setChores] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [completions, setCompletions] = useState([]);
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

    return () => {
      unsubPeople();
      unsubChores();
      unsubAssignments();
      unsubCompletions();
    };
  }, []);

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
                { id: "analysis", label: "Analysis", icon: "📊" },
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
            db={db}
          />
        )}
        {currentView === "analysis" && (
          <AnalysisView
            people={people}
            chores={chores}
            assignments={assignments}
            completions={completions}
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
          />
        )}
        {currentView === "admin" && (
          <AdminView
            people={people}
            chores={chores}
            assignments={assignments}
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
      acc[person.id] = colors[i % colors.length];
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
                    const chore = chores.find(
                      (c) => c.id === completion.choreId
                    );
                    const choreName = chore?.name || "";
                    const displayName =
                      choreName.length > 10
                        ? choreName.substring(0, 10) + "..."
                        : choreName;
                    return (
                      <div
                        key={idx}
                        className="completion-dot px-2 py-0.5 rounded-full text-white text-xs font-medium whitespace-nowrap"
                        style={{
                          backgroundColor: personColors[completion.completedBy],
                        }}
                        title={`${
                          people.find((p) => p.id === completion.completedBy)
                            ?.name
                        }: ${chore?.name}`}
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
function RecordChoreModal({ date, people, chores, assignments, onClose, db }) {
  const [selectedPerson, setSelectedPerson] = useState("");
  const [selectedChore, setSelectedChore] = useState("");
  const [saving, setSaving] = useState(false);
  const [isPartial, setIsPartial] = useState(false);
  const [partialMinutes, setPartialMinutes] = useState("");

  const selectedChoreObj = chores.find((c) => c.id === selectedChore);

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
    if (!selectedPerson || !selectedChore) return;
    if (isPartial && !partialMinutes) return;

    setSaving(true);

    const id = generateId();
    const chore = chores.find((c) => c.id === selectedChore);
    const minutesDone = isPartial
      ? parseInt(partialMinutes, 10)
      : chore?.minutes ?? 0;

    await setDoc(doc(db, "completions", id), {
      id,
      date,
      completedBy: selectedPerson,
      choreId: selectedChore,
      minutes: minutesDone,
      createdAt: new Date().toISOString(),
    });

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
        <h3 className="font-display text-xl font-semibold text-stone-800 mb-1">
          Record Chore
        </h3>
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
              Partial
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
              !selectedPerson ||
              !selectedChore ||
              saving ||
              (isPartial && !partialMinutes)
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
  currentMonth,
  setCurrentMonth,
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

  // Calculate stats for each person
  const calculatePersonStats = (
    personId,
    monthFilter: string | null = null
  ) => {
    const personAssignments = assignments.filter(
      (a) => a.personId === personId
    );
    const personCompletions = completions.filter(
      (c) =>
        c.completedBy === personId &&
        (monthFilter ? c.date.startsWith(monthFilter) : true)
    );

    let expectedMinutes = 0;
    let completedMinutes = 0;
    const choreBreakdown = {};

    // Calculate expected minutes from assignments
    personAssignments.forEach((assignment) => {
      const chore = chores.find((c) => c.id === assignment.choreId);
      if (chore) {
        const monthMultiplier = monthFilter ? 1 : getMonthsSinceStart();
        expectedMinutes +=
          chore.minutes * assignment.timesPerMonth * monthMultiplier;
      }
    });

    // Calculate completed minutes
    personCompletions.forEach((completion) => {
      const chore = chores.find((c) => c.id === completion.choreId);
      if (chore) {
        completedMinutes += completion.minutes;
        choreBreakdown[chore.name] =
          (choreBreakdown[chore.name] || 0) + completion.minutes;
      }
    });

    const percentage =
      expectedMinutes > 0
        ? Math.round((completedMinutes / expectedMinutes) * 100)
        : 0;

    return { expectedMinutes, completedMinutes, percentage, choreBreakdown };
  };

  const getMonthsSinceStart = () => {
    if (completions.length === 0) return 1;
    const dates = completions.map((c) => new Date(c.date));
    const earliest = new Date(Math.min(...dates));
    const now = new Date();
    return Math.max(
      1,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
        (now.getMonth() - earliest.getMonth()) +
        1
    );
  };

  // Calculate who owes whom
  const calculateDebts = () => {
    const debts = {};

    // Initialize debt matrix
    people.forEach((p1) => {
      debts[p1.id] = {};
      people.forEach((p2) => {
        if (p1.id !== p2.id) debts[p1.id][p2.id] = 0;
      });
    });

    // Process completions to find "done for others"
    completions.forEach((completion) => {
      // Determine day-of-week for this completion (0-6, Sunday-Saturday)
      const completionDate = new Date(completion.date + "T12:00:00");
      const completionDayOfWeek = completionDate.getDay();

      // Find matching assignment:
      //  - Prefer a day-specific assignment where both choreId and dayOfWeek match
      //  - Fallback to a regular assignment (no dayOfWeek) for that chore
      const assignmentsForChore = assignments.filter(
        (a) => a.choreId === completion.choreId
      );

      let choreAssignment =
        assignmentsForChore.find(
          (a) => a.dayOfWeek === completionDayOfWeek
        ) ||
        assignmentsForChore.find(
          (a) => a.dayOfWeek === null || a.dayOfWeek === undefined
        );

      if (choreAssignment && choreAssignment.personId !== completion.completedBy) {
        const chore = chores.find((c) => c.id === completion.choreId);
        if (chore) {
          const minutesDone = completion.minutes;
          // The assigned person owes the completer
          const owedBy = choreAssignment.personId;
          const owedTo = completion.completedBy;
          if (debts[owedBy] && debts[owedBy][owedTo] !== undefined) {
            debts[owedBy][owedTo] += minutesDone;
          }
        }
      }
    });

    // Simplify debts (net out mutual debts)
    const simplifiedDebts = [];
    const processed = new Set();

    people.forEach((p1) => {
      people.forEach((p2) => {
        if (p1.id !== p2.id && !processed.has(`${p1.id}-${p2.id}`)) {
          const debt1to2 = debts[p1.id]?.[p2.id] || 0;
          const debt2to1 = debts[p2.id]?.[p1.id] || 0;
          const net = debt1to2 - debt2to1;

          if (net > 0) {
            simplifiedDebts.push({ from: p1.id, to: p2.id, minutes: net });
          } else if (net < 0) {
            simplifiedDebts.push({ from: p2.id, to: p1.id, minutes: -net });
          }

          processed.add(`${p1.id}-${p2.id}`);
          processed.add(`${p2.id}-${p1.id}`);
        }
      });
    });

    return simplifiedDebts;
  };

  const debts = calculateDebts();

  // Calculate house totals
  const houseStats = () => {
    let totalExpected = 0;
    let totalCompleted = 0;

    people.forEach((person) => {
      const stats = calculatePersonStats(person.id, monthKey);
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
          { id: "debts", label: "Who Owes Who" },
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
            const monthStats = calculatePersonStats(person.id, monthKey);
            const allTimeStats = calculatePersonStats(person.id);

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
              // Get all completions for the current month
              const monthCompletions = completions.filter((c) =>
                c.date.startsWith(monthKey)
              );

              // Calculate expected and completed minutes per chore
              const choreStatus = {};

              // Initialize with all assignments
              assignments.forEach((assignment) => {
                const chore = chores.find((c) => c.id === assignment.choreId);
                if (chore) {
                  if (!choreStatus[assignment.choreId]) {
                    choreStatus[assignment.choreId] = {
                      choreId: assignment.choreId,
                      choreName: chore.name,
                      expectedMinutes: 0,
                      completedMinutes: 0,
                    };
                  }
                  choreStatus[assignment.choreId].expectedMinutes +=
                    assignment.timesPerMonth * chore.minutes;
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
                const stats = calculatePersonStats(person.id, m.key);
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
                            calculatePersonStats(person.id, m.key)
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
        <div className="bg-white rounded-2xl card-shadow p-6">
          <h3 className="font-display text-xl font-semibold text-stone-800 mb-4">
            Chore Debts
          </h3>

          {debts.length > 0 ? (
            <div className="space-y-3">
              {debts.map((debt, idx) => {
                const fromPerson = people.find((p) => p.id === debt.from);
                const toPerson = people.find((p) => p.id === debt.to);
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-4 bg-stone-50 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-stone-800">
                        {fromPerson?.name}
                      </span>
                      <svg
                        className="w-5 h-5 text-stone-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 8l4 4m0 0l-4 4m4-4H3"
                        />
                      </svg>
                      <span className="font-medium text-stone-800">
                        {toPerson?.name}
                      </span>
                    </div>
                    <span className="text-lg font-bold text-amber-600">
                      {debt.minutes} min
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center py-8 text-stone-500">
              No one owes anyone chores! 🎉
            </p>
          )}

          <p className="mt-4 text-sm text-stone-500">
            Debts are calculated when someone does a chore assigned to another
            person.
          </p>
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
function AdminView({ people, chores, assignments, db }) {
  const [activeSection, setActiveSection] = useState("people");
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
                  <button
                    onClick={() => deleteChore(chore.id)}
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
                  <button
                    onClick={() => deleteAssignment(assignment.id)}
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
            {assignments.length === 0 && (
              <p className="text-center py-8 text-stone-500">
                No assignments yet. Add people and chores first, then assign
                them.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
