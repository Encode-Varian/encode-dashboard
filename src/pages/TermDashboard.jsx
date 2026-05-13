import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  Target,
  DollarSign,
  Users,
  CalendarDays,
  TrendingUp,
  Clock,
  GraduationCap,
  AlertTriangle,
  ArrowUpRight,
  Repeat,
} from "lucide-react";

const BRAND_PRIMARY = "#53C8E0";
const BRAND_SECONDARY = "#F7941D";

const LEVEL_ORDER = {
  PreCoding: 1,
  Discovery: 2,
  Exploration: 3,
  Innovation: 4,
};

const schooltracsCsvFiles = import.meta.glob("../data/schooltracs/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
});

const termPresetCsvFile = import.meta.glob("../data/term-presets.csv", {
  query: "?raw",
  import: "default",
  eager: true,
});

function toNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/HK\$|\$|,|\s/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(value) {
  if (!value) return null;
  const raw = String(value).trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(raw)) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const slashParts = raw.split(/[\/\-]/).map((x) => x.trim());

  if (slashParts.length === 3) {
    const [a, b, c] = slashParts;
    const year = c.length === 2 ? `20${c}` : c;
    const d = new Date(Number(year), Number(b) - 1, Number(a));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateKey(date) {
  if (!date) return "Unknown";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekdayName(date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getWeekKey(date) {
  if (!date) return "Unknown";

  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = copy.getUTCDay() || 7;

  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((copy - yearStart) / 86400000 + 1) / 7);

  return `${copy.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function formatHKD(value) {
  return new Intl.NumberFormat("en-HK", {
    style: "currency",
    currency: "HKD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown";
  return raw.slice(0, 5);
}

function normalizeMakeup(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Normal";
  if (lower.includes("makeup to")) return "Makeup To";
  if (lower.includes("single from")) return "Makeup From";
  if (lower.includes("makeup")) return "Other Makeup";

  return "Other";
}

function normalizeSchooltracsRow(row, index) {
  const date = parseDate(row.Date || row.date);
  const dateKey = formatDateKey(date);
  const startTime = normalizeTime(row["Start Time"] || row.startTime);
  const paid = toNumber(row.Paid || row.paid);
  const durationRaw = toNumber(row.Duration || row.duration);
  const durationHours = durationRaw > 10 ? durationRaw / 60 : durationRaw;

  const courseCategory =
    String(row["Course Category"] || row.courseCategory || "").trim() || "Uncategorized";

  const courseName =
    String(row["Course Name"] || row.courseName || "Unknown Course").trim() ||
    "Unknown Course";

  const courseLevel =
    String(row["Course Level"] || row.courseLevel || "Unknown").trim() || "Unknown";

  const studentNumber = String(
    row["Student Number"] || row.studentNumber || row["Student Name"] || `row-${index}`
  ).trim();

  const staff = String(row.Staff || "Unknown").trim() || "Unknown";

  const makeupRaw = String(row["Make Up"] || row.MakeUp || row.makeup || "").trim();
  const makeupStatus = normalizeMakeup(makeupRaw);

  return {
    id: index,
    date,
    dateKey,
    weekKey: getWeekKey(date),
    weekday: date ? getWeekdayName(date) : "Unknown",
    paid,
    durationHours,
    courseCategory,
    courseName,
    courseLevel,
    studentNumber,
    studentName: String(row["Student Name"] || "").trim(),
    startTime,
    staff,
    makeupRaw,
    makeupStatus,
    sessionKey: `${dateKey}|${startTime}|${courseName}|${courseLevel}|${staff}`,
  };
}

function normalizeTermPreset(row, index) {
  return {
    id: index,
    termName: String(row["Term Name"] || "").trim(),
    academicYear: String(row["Academic Year"] || "").trim(),
    termNumber: String(row["Term Number"] || "").trim(),
    weekday: String(row.Weekday || "").trim(),
    startDate: String(row["Start Date"] || "").trim(),
    endDate: String(row["End Date"] || "").trim(),
    revenueTarget: toNumber(row["Revenue Target"]),
    previousTerm: String(row["Previous Term"] || "").trim(),
    sameTermLastYear: String(row["Same Term Last Year"] || "").trim(),
  };
}

function groupRows(rows, keyFn) {
  const map = new Map();

  rows.forEach((row) => {
    const key = keyFn(row);

    if (!map.has(key)) {
      map.set(key, {
        key,
        revenue: 0,
        paidLessons: 0,
        lessonHours: 0,
        students: new Set(),
        sessions: new Map(),
      });
    }

    const item = map.get(key);
    item.revenue += row.paid;

    if (row.paid > 0) {
      item.paidLessons += 1;
      item.lessonHours += row.durationHours;
    }

    item.students.add(row.studentNumber);

    if (!item.sessions.has(row.sessionKey)) {
      item.sessions.set(row.sessionKey, new Set());
    }

    item.sessions.get(row.sessionKey).add(row.studentNumber);
  });

  return Array.from(map.values()).map((item) => {
    const sessionSizes = Array.from(item.sessions.values()).map((set) => set.size);
    const totalSessions = sessionSizes.length;
    const oneKidSessions = sessionSizes.filter((size) => size === 1).length;

    return {
      ...item,
      encoders: item.students.size,
      totalSessions,
      oneKidSessions,
      lessonSize: totalSessions ? item.paidLessons / totalSessions : 0,
      oneKidRate: totalSessions ? oneKidSessions / totalSessions : 0,
      revenuePerEncoder: item.students.size ? item.revenue / item.students.size : 0,
    };
  });
}

function getTermRows(rows, termRanges, termName) {
  const ranges = termRanges.filter((term) => term.termName === termName);

  return rows.filter((row) => {
    if (row.courseCategory.toLowerCase() !== "regular") return false;
    if (row.paid <= 0) return false;

    const matchingRange = ranges.find((range) => range.weekday === row.weekday);

    if (!matchingRange) return false;

    return row.dateKey >= matchingRange.startDate && row.dateKey <= matchingRange.endDate;
  });
}

function summarizeTerm(rows, termPreset) {
  const revenue = rows.reduce((sum, row) => sum + row.paid, 0);
  const paidLessons = rows.length;
  const encoders = new Set(rows.map((row) => row.studentNumber)).size;
  const lessonHours = rows.reduce((sum, row) => sum + row.durationHours, 0);

  const sessions = new Map();

  rows.forEach((row) => {
    if (!sessions.has(row.sessionKey)) {
      sessions.set(row.sessionKey, new Set());
    }

    sessions.get(row.sessionKey).add(row.studentNumber);
  });

  const sessionSizes = Array.from(sessions.values()).map((set) => set.size);
  const totalSessions = sessionSizes.length;
  const oneKidLessons = sessionSizes.filter((size) => size === 1).length;
  const target = termPreset?.revenueTarget || 0;

  return {
    revenue,
    target,
    targetProgress: target ? revenue / target : 0,
    remaining: Math.max(target - revenue, 0),
    paidLessons,
    encoders,
    lessonHours,
    totalSessions,
    lessonSize: totalSessions ? paidLessons / totalSessions : 0,
    oneKidLessons,
    oneKidRate: totalSessions ? oneKidLessons / totalSessions : 0,
  };
}

function getMainLevelForStudents(rows) {
  const map = new Map();

  rows.forEach((row) => {
    if (!map.has(row.studentNumber)) {
      map.set(row.studentNumber, new Map());
    }

    const levelMap = map.get(row.studentNumber);
    levelMap.set(row.courseLevel, (levelMap.get(row.courseLevel) || 0) + 1);
  });

  const result = new Map();

  map.forEach((levelMap, studentNumber) => {
    const sorted = Array.from(levelMap.entries()).sort((a, b) => b[1] - a[1]);
    result.set(studentNumber, sorted[0]?.[0] || "Unknown");
  });

  return result;
}

function calculateStudentMovement(currentRows, previousRows) {
  const current = getMainLevelForStudents(currentRows);
  const previous = getMainLevelForStudents(previousRows);

  const allStudents = new Set([...current.keys(), ...previous.keys()]);

  const movement = {
    "Moved Up": 0,
    Stayed: 0,
    "Moved Down": 0,
    New: 0,
    "Left / Missing": 0,
  };

  allStudents.forEach((studentNumber) => {
    const currentLevel = current.get(studentNumber);
    const previousLevel = previous.get(studentNumber);

    if (!previousLevel && currentLevel) {
      movement.New += 1;
      return;
    }

    if (previousLevel && !currentLevel) {
      movement["Left / Missing"] += 1;
      return;
    }

    const currentOrder = LEVEL_ORDER[currentLevel] || 0;
    const previousOrder = LEVEL_ORDER[previousLevel] || 0;

    if (currentOrder > previousOrder) movement["Moved Up"] += 1;
    else if (currentOrder < previousOrder) movement["Moved Down"] += 1;
    else movement.Stayed += 1;
  });

  return Object.entries(movement).map(([key, value]) => ({
    key,
    students: value,
  }));
}

function KpiCard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="relative min-h-[150px] rounded-2xl border border-slate-200 bg-white p-5 pr-16 shadow-sm">
      {Icon && (
        <div className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-xl bg-[#53C8E0]/15 text-[#0E8FA4]">
          <Icon size={22} />
        </div>
      )}

      <p className="text-sm font-semibold leading-5 text-slate-500">{title}</p>
      <p className="mt-3 whitespace-nowrap text-2xl font-bold leading-tight text-slate-900">
        {value}
      </p>
      {subtitle && <p className="mt-2 text-sm leading-5 text-slate-500">{subtitle}</p>}
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-slate-900">{title}</h3>
      <div className="h-80">{children}</div>
    </div>
  );
}

function TopTable({ title, rows, columns }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-slate-900">{title}</h3>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-3 font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-slate-500" colSpan={columns.length}>
                  No data available.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${row.key || row.date || "row"}-${index}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3 text-slate-700">
                      {col.render ? col.render(row, index) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  totalRows,
  rowsPerPage,
  onPageChange,
}) {
  const startRow = totalRows === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
  const endRow = Math.min(currentPage * rowsPerPage, totalRows);

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{startRow}</span> to{" "}
        <span className="font-semibold text-slate-700">{endRow}</span> of{" "}
        <span className="font-semibold text-slate-700">{totalRows}</span> rows
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          First
        </button>

        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <span className="rounded-xl bg-[#53C8E0]/15 px-4 py-2 text-sm font-bold text-[#0E8FA4]">
          {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>

        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Last
        </button>
      </div>
    </div>
  );
}

export default function TermDashboard() {
  const [rows, setRows] = useState([]);
  const [termRanges, setTermRanges] = useState([]);
  const [selectedTermName, setSelectedTermName] = useState("");
  const [oneKidPage, setOneKidPage] = useState(1);
  const oneKidRowsPerPage = 20;

  useEffect(() => {
    const schooltracsEntries = Object.entries(schooltracsCsvFiles);

    const allRows = schooltracsEntries.flatMap(([filePath, csvText]) => {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      return result.data.map((row, index) =>
        normalizeSchooltracsRow(row, `${filePath}-${index}`)
      );
    });

    setRows(allRows.filter((row) => row.date && row.dateKey !== "Unknown"));

    const presetEntries = Object.entries(termPresetCsvFile);
    const presetText = presetEntries[0]?.[1];

    if (presetText) {
      const result = Papa.parse(presetText, {
        header: true,
        skipEmptyLines: true,
      });

      const presets = result.data
        .map(normalizeTermPreset)
        .filter((term) => term.termName && term.weekday && term.startDate && term.endDate);

      setTermRanges(presets);

      const todayKey = formatDateKey(new Date());

      const activeTerm = presets.find((term) => {
        return todayKey >= term.startDate && todayKey <= term.endDate;
      });

      if (activeTerm) {
        setSelectedTermName(activeTerm.termName);
      } else if (presets.length) {
        setSelectedTermName(presets[presets.length - 1].termName);
      }
    }
  }, []);

  useEffect(() => {
    setOneKidPage(1);
  }, [selectedTermName]);

  const termNames = useMemo(() => {
    return Array.from(new Set(termRanges.map((term) => term.termName)));
  }, [termRanges]);

  const selectedTermPreset = useMemo(() => {
    return termRanges.find((term) => term.termName === selectedTermName);
  }, [termRanges, selectedTermName]);

  const previousTermName = selectedTermPreset?.previousTerm || "";
  const sameTermLastYearName = selectedTermPreset?.sameTermLastYear || "";

  const currentRows = useMemo(() => {
    return getTermRows(rows, termRanges, selectedTermName);
  }, [rows, termRanges, selectedTermName]);

  const previousRows = useMemo(() => {
    return previousTermName ? getTermRows(rows, termRanges, previousTermName) : [];
  }, [rows, termRanges, previousTermName]);

  const sameTermLastYearRows = useMemo(() => {
    return sameTermLastYearName ? getTermRows(rows, termRanges, sameTermLastYearName) : [];
  }, [rows, termRanges, sameTermLastYearName]);

  const summary = useMemo(() => {
    return summarizeTerm(currentRows, selectedTermPreset);
  }, [currentRows, selectedTermPreset]);

  const previousSummary = useMemo(() => summarizeTerm(previousRows), [previousRows]);

  const lastYearSummary = useMemo(
    () => summarizeTerm(sameTermLastYearRows),
    [sameTermLastYearRows]
  );

  const previousTermGrowth = previousSummary.revenue
    ? (summary.revenue - previousSummary.revenue) / previousSummary.revenue
    : null;

  const lastYearGrowth = lastYearSummary.revenue
    ? (summary.revenue - lastYearSummary.revenue) / lastYearSummary.revenue
    : null;

  const courseNameRows = useMemo(() => {
    return groupRows(currentRows, (row) => row.courseName).sort(
      (a, b) => b.revenue - a.revenue
    );
  }, [currentRows]);

  const weeklyRevenueRows = useMemo(() => {
    return groupRows(currentRows, (row) => row.weekKey)
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map((row) => ({
        week: row.key,
        revenue: Math.round(row.revenue),
      }));
  }, [currentRows]);

  const staffRows = useMemo(() => {
    return groupRows(currentRows, (row) => row.staff).sort((a, b) => b.revenue - a.revenue);
  }, [currentRows]);

  const sessionMap = useMemo(() => {
    const map = new Map();

    currentRows.forEach((row) => {
      if (!map.has(row.sessionKey)) {
        map.set(row.sessionKey, {
          key: row.sessionKey,
          date: row.dateKey,
          startTime: row.startTime,
          courseName: row.courseName,
          courseLevel: row.courseLevel,
          staff: row.staff,
          students: new Set(),
          revenue: 0,
          paidLessons: 0,
          hasMakeupFrom: false,
        });
      }

      const session = map.get(row.sessionKey);
      session.students.add(row.studentNumber);
      session.revenue += row.paid;
      session.paidLessons += 1;

      if (row.makeupStatus === "Makeup From") {
        session.hasMakeupFrom = true;
      }
    });

    return Array.from(map.values()).map((session) => ({
      ...session,
      classSize: session.students.size,
    }));
  }, [currentRows]);

  const classSizeRows = useMemo(() => {
    const map = new Map();

    sessionMap.forEach((session) => {
      const key = String(session.classSize);
      map.set(key, (map.get(key) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([key, sessions]) => ({
        key,
        sessions,
        rate: sessionMap.length ? sessions / sessionMap.length : 0,
      }))
      .sort((a, b) => Number(a.key) - Number(b.key));
  }, [sessionMap]);

  const oneKidSessionRows = useMemo(() => {
    return sessionMap
      .filter((session) => session.classSize === 1)
      .sort((a, b) => {
        const dateCompare = String(a.date).localeCompare(String(b.date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.startTime).localeCompare(String(b.startTime));
      });
  }, [sessionMap]);

  const oneKidTotalPages = useMemo(() => {
    return Math.max(1, Math.ceil(oneKidSessionRows.length / oneKidRowsPerPage));
  }, [oneKidSessionRows.length]);

  const paginatedOneKidSessionRows = useMemo(() => {
    const startIndex = (oneKidPage - 1) * oneKidRowsPerPage;
    const endIndex = startIndex + oneKidRowsPerPage;

    return oneKidSessionRows.slice(startIndex, endIndex);
  }, [oneKidSessionRows, oneKidPage]);

  const makeupStats = useMemo(() => {
    const makeupToKid = currentRows.filter((row) => row.makeupStatus === "Makeup To").length;
    const makeupFromKid = currentRows.filter((row) => row.makeupStatus === "Makeup From").length;

    const makeupFromLessonKeys = new Set(
      currentRows.filter((row) => row.makeupStatus === "Makeup From").map((row) => row.sessionKey)
    );

    const oneKidMakeupLessons = sessionMap.filter(
      (session) => session.classSize === 1 && session.hasMakeupFrom
    ).length;

    return {
      makeupToKid,
      makeupFromKid,
      makeupFromLessons: makeupFromLessonKeys.size,
      oneKidMakeupLessons,
      oneKidMakeupAllMakeupRate: makeupFromLessonKeys.size
        ? oneKidMakeupLessons / makeupFromLessonKeys.size
        : 0,
      oneKidMakeupNormalRate: summary.oneKidLessons
        ? oneKidMakeupLessons / summary.oneKidLessons
        : 0,
    };
  }, [currentRows, sessionMap, summary.oneKidLessons]);

  const movementRows = useMemo(() => {
    return calculateStudentMovement(currentRows, previousRows);
  }, [currentRows, previousRows]);

  const topCourseName = courseNameRows[0];

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#53C8E0] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Encode Education</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Term Dashboard</h1>
              <p className="mt-2 text-sm text-white/85">
                Regular class term dashboard for revenue, class efficiency, student movement, and
                makeup pressure.
              </p>
            </div>

            <div className="w-full max-w-md">
              <label className="mb-1 block text-sm font-semibold text-white/90">
                Select Term
              </label>

              <select
                value={selectedTermName}
                onChange={(e) => setSelectedTermName(e.target.value)}
                className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
              >
                {termNames.map((termName) => (
                  <option key={termName} value={termName}>
                    {termName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {!selectedTermPreset ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            No term presets found. Please create <strong>src/data/term-presets.csv</strong>.
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">Selected Term</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{selectedTermName}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Revenue Target</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatHKD(selectedTermPreset.revenueTarget)}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Comparison</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    Previous: {previousTermName || "—"} <br />
                    Last Year: {sameTermLastYearName || "—"}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <KpiCard
                  title="Term Revenue"
                  value={formatHKD(summary.revenue)}
                  subtitle="Earned revenue from regular classes"
                  icon={DollarSign}
                />

                <KpiCard
                  title="Target Progress"
                  value={formatPercent(summary.targetProgress)}
                  subtitle={`${formatHKD(summary.revenue)} / ${formatHKD(summary.target)}`}
                  icon={Target}
                />

                <KpiCard
                  title="Remaining"
                  value={formatHKD(summary.remaining)}
                  subtitle="Revenue needed to hit target"
                  icon={TrendingUp}
                />

                <KpiCard
                  title="vs Previous Term"
                  value={previousTermGrowth === null ? "—" : formatPercent(previousTermGrowth)}
                  subtitle={previousTermName || "No comparison term"}
                  icon={ArrowUpRight}
                />

                <KpiCard
                  title="vs Same Term Last Year"
                  value={lastYearGrowth === null ? "—" : formatPercent(lastYearGrowth)}
                  subtitle={sameTermLastYearName || "No comparison term"}
                  icon={Repeat}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <KpiCard
                  title="Total Encoders"
                  value={summary.encoders.toLocaleString()}
                  subtitle="Unique students"
                  icon={Users}
                />

                <KpiCard
                  title="Paid Lessons"
                  value={summary.paidLessons.toLocaleString()}
                  subtitle="Paid student-lesson rows"
                  icon={CalendarDays}
                />

                <KpiCard
                  title="Lesson Size"
                  value={summary.lessonSize.toFixed(2)}
                  subtitle={`${summary.totalSessions} class sessions`}
                  icon={GraduationCap}
                />

                <KpiCard
                  title="1-Kid Lessons"
                  value={summary.oneKidLessons.toLocaleString()}
                  subtitle="Class sessions with 1 student"
                  icon={AlertTriangle}
                />

                <KpiCard
                  title="1-Kid Rate"
                  value={formatPercent(summary.oneKidRate)}
                  subtitle="1-kid sessions ÷ total sessions"
                  icon={AlertTriangle}
                />

                <KpiCard
                  title="Student Lesson Hours"
                  value={summary.lessonHours.toFixed(1)}
                  subtitle="Sum of paid lesson duration"
                  icon={Clock}
                />
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {courseNameRows.slice(0, 4).map((course) => (
                <div
                  key={course.key}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="line-clamp-2 text-lg font-bold text-slate-900">{course.key}</p>

                  <p className="mt-3 text-2xl font-bold text-[#0E8FA4]">
                    {formatHKD(course.revenue)}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                    <div>
                      <p className="font-semibold text-slate-500">Encoders</p>
                      <p className="text-slate-900">{course.encoders}</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-500">Rev / Encoder</p>
                      <p className="text-slate-900">{formatHKD(course.revenuePerEncoder)}</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-500">Paid Lessons</p>
                      <p className="text-slate-900">{course.paidLessons}</p>
                    </div>

                    <div>
                      <p className="font-semibold text-slate-500">Lesson Size</p>
                      <p className="text-slate-900">{course.lessonSize.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Weekly Term Revenue Trend">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={weeklyRevenueRows}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(value) => formatHKD(value)} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke={BRAND_PRIMARY}
                      strokeWidth={3}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Revenue by Course Name">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={courseNameRows.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 100, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis dataKey="key" type="category" width={150} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatHKD(value)} />
                    <Legend />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      radius={[0, 8, 8, 0]}
                      fill={BRAND_PRIMARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Class Size Distribution">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={classSizeRows}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="key" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="sessions"
                      name="Class Sessions"
                      radius={[8, 8, 0, 0]}
                      fill={BRAND_SECONDARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Student Movement from Previous Term">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={movementRows}
                    margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="key" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="students"
                      name="Students"
                      radius={[8, 8, 0, 0]}
                      fill={BRAND_PRIMARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <TopTable
                title="Makeup Pressure"
                rows={[
                  { key: "Makeup To (kid)", value: makeupStats.makeupToKid },
                  { key: "Makeup From (kid)", value: makeupStats.makeupFromKid },
                  { key: "Makeup From (lesson)", value: makeupStats.makeupFromLessons },
                  { key: "1-Kid Makeup Lesson", value: makeupStats.oneKidMakeupLessons },
                  {
                    key: "1-Kid Makeup / All Makeup",
                    value: formatPercent(makeupStats.oneKidMakeupAllMakeupRate),
                  },
                  {
                    key: "1-Kid Makeup / Normal",
                    value: formatPercent(makeupStats.oneKidMakeupNormalRate),
                  },
                ]}
                columns={[
                  { key: "key", label: "Metric" },
                  { key: "value", label: "Value" },
                ]}
              />

              <ChartCard title="Revenue by Teaching Allocation">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={staffRows.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 60, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis dataKey="key" type="category" width={110} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatHKD(value)} />
                    <Legend />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      radius={[0, 8, 8, 0]}
                      fill={BRAND_SECONDARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Term Insights</h3>

                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                  <p>
                    <strong className="text-slate-900">{selectedTermName}</strong> has generated{" "}
                    <strong className="text-slate-900">{formatHKD(summary.revenue)}</strong>,
                    reaching{" "}
                    <strong className="text-slate-900">
                      {formatPercent(summary.targetProgress)}
                    </strong>{" "}
                    of the{" "}
                    <strong className="text-slate-900">{formatHKD(summary.target)}</strong>{" "}
                    target.
                  </p>

                  <p>
                    The remaining revenue needed is{" "}
                    <strong className="text-slate-900">{formatHKD(summary.remaining)}</strong>.
                  </p>

                  {topCourseName ? (
                    <p>
                      The strongest course name is{" "}
                      <strong className="text-slate-900">{topCourseName.key}</strong>, generating{" "}
                      <strong className="text-slate-900">{formatHKD(topCourseName.revenue)}</strong>.
                    </p>
                  ) : null}

                  <p>
                    Average lesson size is{" "}
                    <strong className="text-slate-900">{summary.lessonSize.toFixed(2)}</strong>, and{" "}
                    <strong className="text-slate-900">{formatPercent(summary.oneKidRate)}</strong>{" "}
                    of class sessions are 1-kid lessons.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <TopTable
                title="Course Name Performance"
                rows={courseNameRows}
                columns={[
                  { key: "key", label: "Course Name" },
                  {
                    key: "revenue",
                    label: "Revenue",
                    render: (row) => formatHKD(row.revenue),
                  },
                  { key: "encoders", label: "Encoders" },
                  {
                    key: "revenuePerEncoder",
                    label: "Revenue / Encoder",
                    render: (row) => formatHKD(row.revenuePerEncoder),
                  },
                  { key: "paidLessons", label: "Paid Lessons" },
                  {
                    key: "lessonSize",
                    label: "Lesson Size",
                    render: (row) => row.lessonSize.toFixed(2),
                  },
                  {
                    key: "oneKidRate",
                    label: "1-Kid Rate",
                    render: (row) => formatPercent(row.oneKidRate),
                  },
                ]}
              />

              <div>
                <TopTable
                  title="1-Kid Lesson Detail"
                  rows={paginatedOneKidSessionRows}
                  columns={[
                    { key: "date", label: "Date" },
                    { key: "startTime", label: "Start Time" },
                    { key: "courseLevel", label: "Course Level" },
                    { key: "courseName", label: "Course Name" },
                    { key: "staff", label: "Staff" },
                    {
                      key: "revenue",
                      label: "Revenue",
                      render: (row) => formatHKD(row.revenue),
                    },
                  ]}
                />

                <PaginationControls
                  currentPage={oneKidPage}
                  totalPages={oneKidTotalPages}
                  totalRows={oneKidSessionRows.length}
                  rowsPerPage={oneKidRowsPerPage}
                  onPageChange={setOneKidPage}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}