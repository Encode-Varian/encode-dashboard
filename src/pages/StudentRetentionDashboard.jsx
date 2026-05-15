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
  Users,
  UserPlus,
  UserMinus,
  Repeat,
  TrendingUp,
  Percent,
} from "lucide-react";

const BRAND_PRIMARY = "#53C8E0";
const BRAND_SECONDARY = "#F7941D";

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

function monthKey(date) {
  if (!date) return "Unknown";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(key) {
  if (!key || key === "Unknown") return "Unknown";
  const [year, month] = key.split("-").map(Number);
  const d = new Date(year, month - 1, 1);

  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });
}

function getPreviousMonthKey(currentMonthKey) {
  const [year, month] = currentMonthKey.split("-").map(Number);
  const d = new Date(year, month - 2, 1);
  return monthKey(d);
}

function getWeekdayName(date) {
  return date.toLocaleDateString("en-US", { weekday: "long" });
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

function normalizeRow(row, index) {
  const date = parseDate(row.Date || row.date);
  const paid = toNumber(row.Paid || row.paid);

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

  const studentName = String(row["Student Name"] || "").trim() || studentNumber;

  return {
    id: index,
    date,
    dateKey: formatDateKey(date),
    monthKey: monthKey(date),
    weekday: date ? getWeekdayName(date) : "Unknown",
    paid,
    courseCategory,
    courseName,
    courseLevel,
    studentNumber,
    studentName,
    staff: String(row.Staff || "Unknown").trim() || "Unknown",
  };
}

function normalizeTermPreset(row, index) {
  return {
    id: index,
    termName: String(row["Term Name"] || "").trim(),
    weekday: String(row.Weekday || "").trim(),
    startDate: String(row["Start Date"] || "").trim(),
    endDate: String(row["End Date"] || "").trim(),
    previousTerm: String(row["Previous Term"] || "").trim(),
    sameTermLastYear: String(row["Same Term Last Year"] || "").trim(),
  };
}

function isPaidRegular(row) {
  return String(row.courseCategory || "").toLowerCase() === "regular" && row.paid > 0;
}

function getTermRows(rows, termRanges, termName) {
  const ranges = termRanges.filter((term) => term.termName === termName);

  return rows.filter((row) => {
    if (!isPaidRegular(row)) return false;

    const matchingRange = ranges.find((range) => range.weekday === row.weekday);
    if (!matchingRange) return false;

    return row.dateKey >= matchingRange.startDate && row.dateKey <= matchingRange.endDate;
  });
}

function getMainValue(map) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
}

function buildStudentMap(rows) {
  const map = new Map();

  rows.forEach((row) => {
    if (!map.has(row.studentNumber)) {
      map.set(row.studentNumber, {
        studentNumber: row.studentNumber,
        studentName: row.studentName,
        revenue: 0,
        paidLessons: 0,
        courseNames: new Map(),
        courseLevels: new Map(),
        staff: new Map(),
      });
    }

    const student = map.get(row.studentNumber);
    student.revenue += row.paid;
    student.paidLessons += 1;
    student.courseNames.set(row.courseName, (student.courseNames.get(row.courseName) || 0) + 1);
    student.courseLevels.set(row.courseLevel, (student.courseLevels.get(row.courseLevel) || 0) + 1);
    student.staff.set(row.staff, (student.staff.get(row.staff) || 0) + 1);
  });

  return map;
}

function compareStudentMaps(currentMap, previousMap, allHistoryMap, currentKey, previousKey) {
  const currentStudents = new Set(currentMap.keys());
  const previousStudents = new Set(previousMap.keys());
  const allStudents = new Set([...currentStudents, ...previousStudents]);

  const detailRows = Array.from(allStudents).map((studentNumber) => {
    const current = currentMap.get(studentNumber);
    const previous = previousMap.get(studentNumber);
    const history = allHistoryMap.get(studentNumber);

    let status = "Unknown";

    if (current && previous) {
      status = "Stayed";
    } else if (current && !previous) {
      const hadEarlierHistory =
        history &&
        Array.from(history.periods).some(
          (period) => period < currentKey && period !== previousKey
        );

      status = hadEarlierHistory ? "Returned" : "New";
    } else if (!current && previous) {
      status = "Lost / Not Active";
    }

    const source = current || previous;

    return {
      studentNumber,
      studentName: source?.studentName || studentNumber,
      status,
      currentRevenue: current?.revenue || 0,
      previousRevenue: previous?.revenue || 0,
      currentPaidLessons: current?.paidLessons || 0,
      previousPaidLessons: previous?.paidLessons || 0,
      courseName: current
        ? getMainValue(current.courseNames)
        : previous
          ? getMainValue(previous.courseNames)
          : "—",
      courseLevel: current
        ? getMainValue(current.courseLevels)
        : previous
          ? getMainValue(previous.courseLevels)
          : "—",
      staff: current ? getMainValue(current.staff) : previous ? getMainValue(previous.staff) : "—",
      firstActivePeriod: history?.firstPeriod || "—",
      lastActivePeriod: history?.lastPeriod || "—",
    };
  });

  const stayed = detailRows.filter((row) => row.status === "Stayed").length;
  const newStudents = detailRows.filter((row) => row.status === "New").length;
  const returned = detailRows.filter((row) => row.status === "Returned").length;
  const lost = detailRows.filter((row) => row.status === "Lost / Not Active").length;

  const activeStudents = currentStudents.size;
  const previousActiveStudents = previousStudents.size;
  const retentionRate = previousActiveStudents ? stayed / previousActiveStudents : 0;
  const netChange = newStudents + returned - lost;

  const revenue = Array.from(currentMap.values()).reduce((sum, student) => sum + student.revenue, 0);

  return {
    activeStudents,
    previousActiveStudents,
    stayed,
    newStudents,
    returned,
    lost,
    netChange,
    retentionRate,
    revenue,
    detailRows,
  };
}

function KpiCard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="relative min-h-[140px] rounded-2xl border border-slate-200 bg-white p-5 pr-16 shadow-sm">
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
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
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
                  key={`${row.studentNumber || row.key || "row"}-${index}`}
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

export default function StudentRetentionDashboard() {
  const [rows, setRows] = useState([]);
  const [termRanges, setTermRanges] = useState([]);
  const [viewMode, setViewMode] = useState("Term-by-Term");
  const [selectedTerm, setSelectedTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("All");

  useEffect(() => {
    const entries = Object.entries(schooltracsCsvFiles);

    const allRows = entries.flatMap(([filePath, csvText]) => {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      return result.data.map((row, index) => normalizeRow(row, `${filePath}-${index}`));
    });

    const cleanedRows = allRows.filter((row) => row.date && row.dateKey !== "Unknown");
    setRows(cleanedRows);

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

      const activeTerm = presets.find(
        (term) => todayKey >= term.startDate && todayKey <= term.endDate
      );

      if (activeTerm) {
        setSelectedTerm(activeTerm.termName);
      } else {
        const termNames = Array.from(new Set(presets.map((term) => term.termName)));
        setSelectedTerm(termNames[termNames.length - 1] || "");
      }
    }

    const regularMonthKeys = Array.from(
      new Set(cleanedRows.filter(isPaidRegular).map((row) => row.monthKey))
    ).sort();

    if (regularMonthKeys.length) {
      setSelectedMonth(regularMonthKeys[regularMonthKeys.length - 1]);
    }
  }, []);

  const paidRegularRows = useMemo(() => rows.filter(isPaidRegular), [rows]);

  const availableMonths = useMemo(() => {
    return Array.from(new Set(paidRegularRows.map((row) => row.monthKey))).sort();
  }, [paidRegularRows]);

  const termNames = useMemo(() => {
    return Array.from(new Set(termRanges.map((term) => term.termName)));
  }, [termRanges]);

  const selectedTermPreset = useMemo(() => {
    return termRanges.find((term) => term.termName === selectedTerm);
  }, [termRanges, selectedTerm]);

  const previousTermName = selectedTermPreset?.previousTerm || "";

  const termStudentMaps = useMemo(() => {
    const map = new Map();

    termNames.forEach((termName) => {
      const termRows = getTermRows(rows, termRanges, termName);
      map.set(termName, buildStudentMap(termRows));
    });

    return map;
  }, [rows, termRanges, termNames]);

  const termHistoryMap = useMemo(() => {
    const map = new Map();

    termNames.forEach((termName) => {
      const studentMap = termStudentMaps.get(termName) || new Map();

      studentMap.forEach((student, studentNumber) => {
        if (!map.has(studentNumber)) {
          map.set(studentNumber, {
            studentNumber,
            studentName: student.studentName,
            periods: new Set(),
            firstPeriod: termName,
            lastPeriod: termName,
          });
        }

        const item = map.get(studentNumber);
        item.periods.add(termName);

        if (termName < item.firstPeriod) item.firstPeriod = termName;
        if (termName > item.lastPeriod) item.lastPeriod = termName;
      });
    });

    return map;
  }, [termNames, termStudentMaps]);

  const termFlowRows = useMemo(() => {
    return termNames.map((termName) => {
      const termPreset = termRanges.find((term) => term.termName === termName);
      const previousName = termPreset?.previousTerm || "";
      const currentMap = termStudentMaps.get(termName) || new Map();
      const previousMap = previousName ? termStudentMaps.get(previousName) || new Map() : new Map();

      const result = compareStudentMaps(
        currentMap,
        previousMap,
        termHistoryMap,
        termName,
        previousName
      );

      return {
        key: termName,
        period: termName,
        ...result,
      };
    });
  }, [termNames, termRanges, termStudentMaps, termHistoryMap]);

  const monthStudentMaps = useMemo(() => {
    const map = new Map();

    availableMonths.forEach((month) => {
      const monthRows = paidRegularRows.filter((row) => row.monthKey === month);
      map.set(month, buildStudentMap(monthRows));
    });

    return map;
  }, [availableMonths, paidRegularRows]);

  const monthHistoryMap = useMemo(() => {
    const map = new Map();

    availableMonths.forEach((month) => {
      const studentMap = monthStudentMaps.get(month) || new Map();

      studentMap.forEach((student, studentNumber) => {
        if (!map.has(studentNumber)) {
          map.set(studentNumber, {
            studentNumber,
            studentName: student.studentName,
            periods: new Set(),
            firstPeriod: month,
            lastPeriod: month,
          });
        }

        const item = map.get(studentNumber);
        item.periods.add(month);

        if (month < item.firstPeriod) item.firstPeriod = month;
        if (month > item.lastPeriod) item.lastPeriod = month;
      });
    });

    return map;
  }, [availableMonths, monthStudentMaps]);

  const monthlyFlowRows = useMemo(() => {
    return availableMonths.map((currentMonth) => {
      const previousMonth = getPreviousMonthKey(currentMonth);
      const currentMap = monthStudentMaps.get(currentMonth) || new Map();
      const previousMap = monthStudentMaps.get(previousMonth) || new Map();

      const result = compareStudentMaps(
        currentMap,
        previousMap,
        monthHistoryMap,
        currentMonth,
        previousMonth
      );

      return {
        key: currentMonth,
        period: formatMonthLabel(currentMonth),
        ...result,
      };
    });
  }, [availableMonths, monthStudentMaps, monthHistoryMap]);

  const selectedFlow = useMemo(() => {
    if (viewMode === "Term-by-Term") {
      return termFlowRows.find((row) => row.key === selectedTerm) || termFlowRows[0];
    }

    return monthlyFlowRows.find((row) => row.key === selectedMonth) || monthlyFlowRows[0];
  }, [viewMode, termFlowRows, selectedTerm, monthlyFlowRows, selectedMonth]);

  const flowRows = viewMode === "Term-by-Term" ? termFlowRows : monthlyFlowRows;

  const filteredStudentRows = useMemo(() => {
    if (!selectedFlow) return [];

    if (selectedStatus === "All") {
        return selectedFlow.detailRows;
    }

    if (selectedStatus === "New / Returned") {
        return selectedFlow.detailRows.filter(
        (row) => row.status === "New" || row.status === "Returned"
        );
    }

    return selectedFlow.detailRows.filter((row) => row.status === selectedStatus);
  }, [selectedFlow, selectedStatus]);

  const lostByCourseRows = useMemo(() => {
    const map = new Map();

    selectedFlow?.detailRows
      ?.filter((row) => row.status === "Lost / Not Active")
      .forEach((row) => {
        const key = row.courseName || "Unknown";
        map.set(key, (map.get(key) || 0) + 1);
      });

    return Array.from(map.entries())
      .map(([key, lost]) => ({ key, lost }))
      .sort((a, b) => b.lost - a.lost)
      .slice(0, 10);
  }, [selectedFlow]);

  const newByCourseRows = useMemo(() => {
    const map = new Map();

    selectedFlow?.detailRows
      ?.filter((row) => row.status === "New" || row.status === "Returned")
      .forEach((row) => {
        const key = row.courseName || "Unknown";
        map.set(key, (map.get(key) || 0) + 1);
      });

    return Array.from(map.entries())
      .map(([key, gained]) => ({ key, gained }))
      .sort((a, b) => b.gained - a.gained)
      .slice(0, 10);
  }, [selectedFlow]);

  const flowChartRows = useMemo(() => {
    return flowRows.map((row) => ({
      period: row.period,
      stayed: row.stayed,
      newStudents: row.newStudents,
      returned: row.returned,
      lost: row.lost,
    }));
  }, [flowRows]);

  if (!selectedFlow) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          No paid regular student data found.
        </div>
      </div>
    );
  }

  const periodLabel = viewMode === "Term-by-Term" ? selectedTerm : formatMonthLabel(selectedMonth);

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#53C8E0] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Encode Education</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Student Retention Dashboard
              </h1>
              <p className="mt-2 text-sm text-white/85">
                Regular student movement: stayed, new, lost / not active, and returned.
              </p>
            </div>

            <div className="grid w-full max-w-3xl gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-white/90">
                  View By
                </span>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value)}
                  className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                >
                  <option>Term-by-Term</option>
                  <option>Month-by-Month</option>
                </select>
              </label>

              {viewMode === "Term-by-Term" ? (
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-white/90">
                    Select Term
                  </span>
                  <select
                    value={selectedTerm}
                    onChange={(e) => setSelectedTerm(e.target.value)}
                    className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                  >
                    {termNames.map((term) => (
                      <option key={term} value={term}>
                        {term}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-white/90">
                    Select Month
                  </span>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                  >
                    {availableMonths.map((month) => (
                      <option key={month} value={month}>
                        {formatMonthLabel(month)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-white/90">
                  Student Status
                </span>
                <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                    >
                    <option>All</option>
                    <option>Stayed</option>
                    <option>New / Returned</option>
                    <option>Lost / Not Active</option>
                    </select>
              </label>
            </div>
          </div>
        </header>

        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              title="Active Students"
              value={selectedFlow.activeStudents.toLocaleString()}
              subtitle={`Paid regular students in ${periodLabel}`}
              icon={Users}
            />

            <KpiCard
              title="Stayed"
              value={selectedFlow.stayed.toLocaleString()}
              subtitle={
                viewMode === "Term-by-Term"
                  ? "Active previous term and this term"
                  : "Active previous month and this month"
              }
              icon={Repeat}
            />

            <KpiCard
              title="New"
              value={selectedFlow.newStudents.toLocaleString()}
              subtitle="First active period in uploaded records"
              icon={UserPlus}
            />

            <KpiCard
              title="Returned"
              value={selectedFlow.returned.toLocaleString()}
              subtitle="Came back after a gap"
              icon={TrendingUp}
            />

            <KpiCard
              title="Lost / Not Active"
              value={selectedFlow.lost.toLocaleString()}
              subtitle="Active previous period, not active now"
              icon={UserMinus}
            />

            <KpiCard
              title="Retention Rate"
              value={formatPercent(selectedFlow.retentionRate)}
              subtitle="Stayed ÷ previous active students"
              icon={Percent}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <KpiCard
              title="Net Student Change"
              value={selectedFlow.netChange >= 0 ? `+${selectedFlow.netChange}` : selectedFlow.netChange}
              subtitle="New + returned - lost"
              icon={TrendingUp}
            />

            <KpiCard
              title="Previous Active Students"
              value={selectedFlow.previousActiveStudents.toLocaleString()}
              subtitle="Paid regular students in previous period"
              icon={Users}
            />

            <KpiCard
              title="Period Revenue"
              value={formatHKD(selectedFlow.revenue)}
              subtitle="Paid regular revenue in selected period"
              icon={TrendingUp}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Active Students Trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={flowRows.map((row) => ({
                  period: row.period,
                  activeStudents: row.activeStudents,
                }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="activeStudents"
                  name="Active Students"
                  stroke={BRAND_PRIMARY}
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Retention Rate Trend">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={flowRows.map((row) => ({
                  period: row.period,
                  retentionRate: Number((row.retentionRate * 100).toFixed(1)),
                }))}
                margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(value) => `${value}%`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="retentionRate"
                  name="Retention Rate"
                  stroke={BRAND_SECONDARY}
                  strokeWidth={3}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Student Flow by Period">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowChartRows} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="stayed" name="Stayed" stackId="a" fill={BRAND_PRIMARY} />
                <Bar dataKey="newStudents" name="New" stackId="a" fill={BRAND_SECONDARY} />
                <Bar dataKey="returned" name="Returned" stackId="a" fill="#94A3B8" />
                <Bar dataKey="lost" name="Lost / Not Active" fill="#CBD5E1" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Lost / Not Active by Course Name">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={lostByCourseRows}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 100, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="key" type="category" width={150} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="lost"
                  name="Lost / Not Active"
                  radius={[0, 8, 8, 0]}
                  fill={BRAND_SECONDARY}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="New + Returned by Course Name">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={newByCourseRows}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 100, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="key" type="category" width={150} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="gained"
                  name="New + Returned"
                  radius={[0, 8, 8, 0]}
                  fill={BRAND_PRIMARY}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">CEO Insights</h3>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>
                In <strong className="text-slate-900">{periodLabel}</strong>, there were{" "}
                <strong className="text-slate-900">{selectedFlow.activeStudents}</strong> active
                regular students.
              </p>

              <p>
                <strong className="text-slate-900">{selectedFlow.stayed}</strong> students stayed
                from the previous period, giving a retention rate of{" "}
                <strong className="text-slate-900">
                  {formatPercent(selectedFlow.retentionRate)}
                </strong>
                .
              </p>

              <p>
                The period had <strong className="text-slate-900">{selectedFlow.newStudents}</strong>{" "}
                new students, <strong className="text-slate-900">{selectedFlow.returned}</strong>{" "}
                returned students, and{" "}
                <strong className="text-slate-900">{selectedFlow.lost}</strong> students who were
                active last period but not active this period.
              </p>

              <p>
                Net student change was{" "}
                <strong className="text-slate-900">
                  {selectedFlow.netChange >= 0 ? `+${selectedFlow.netChange}` : selectedFlow.netChange}
                </strong>
                .
              </p>
            </div>
          </div>
        </section>

        <section>
          <TopTable
            title={`Student Movement Detail — ${filteredStudentRows.length} students`}
            rows={filteredStudentRows}
            columns={[
              { key: "studentName", label: "Student" },
              { key: "status", label: "Status" },
              {
                key: "currentRevenue",
                label: "Current Period Revenue",
                render: (row) => formatHKD(row.currentRevenue),
              },
              {
                key: "previousRevenue",
                label: "Previous Period Revenue",
                render: (row) => formatHKD(row.previousRevenue),
              },
              { key: "currentPaidLessons", label: "Current Paid Lessons" },
              { key: "previousPaidLessons", label: "Previous Paid Lessons" },
              { key: "courseName", label: "Course Name" },
              { key: "courseLevel", label: "Course Level" },
              { key: "staff", label: "Staff" },
              { key: "firstActivePeriod", label: "First Active Period" },
              { key: "lastActivePeriod", label: "Last Active Period" },
            ]}
          />
        </section>
      </div>
    </div>
  );
}