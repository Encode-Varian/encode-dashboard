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
} from "recharts";
import {
  Target,
  DollarSign,
  Users,
  CalendarDays,
  TrendingUp,
  Clock,
  GraduationCap,
} from "lucide-react";

const BRAND_PRIMARY = "#53C8E0";
const BRAND_SECONDARY = "#F7941D";

const schooltracsCsvFiles = import.meta.glob("../data/schooltracs/*.csv", {
  query: "?raw",
  import: "default",
  eager: true,
});

const campPresetCsvFile = import.meta.glob("../data/camp-presets.csv", {
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

  // Handles values like 10:00:00, 10:00, or Excel-style text.
  return raw.slice(0, 5);
}

function normalizeSchooltracsRow(row, index) {
  const date = parseDate(row.Date || row.date);
  const paid = toNumber(row.Paid || row.paid);

  const courseCategory =
    String(row["Course Category"] || row.courseCategory || "").trim() || "Uncategorized";

  const courseName =
    String(row["Course Name"] || row.courseName || "Unknown Course").trim() || "Unknown Course";

  const courseLevel =
    String(row["Course Level"] || row.courseLevel || "Unknown").trim() || "Unknown";

  const studentNumber = String(
    row["Student Number"] || row.studentNumber || row["Student Name"] || `row-${index}`
  ).trim();

  const startTime = normalizeTime(row["Start Time"] || row.startTime);

  return {
    id: index,
    date,
    dateKey: formatDateKey(date),
    paid,
    courseCategory,
    courseName,
    courseLevel,
    studentNumber,
    startTime,
    staff: String(row.Staff || "Unknown").trim() || "Unknown",
    sessionKey: `${formatDateKey(date)}|${startTime}|${courseName}|${courseLevel}`,
  };
}

function normalizeCampPreset(row, index) {
  return {
    id: index,
    campName: String(row["Camp Name"] || "").trim(),
    startDate: String(row["Start Date"] || "").trim(),
    endDate: String(row["End Date"] || "").trim(),
    revenueTarget: toNumber(row["Revenue Target"]),
  };
}

function groupCampRows(rows, keyFn) {
  const map = new Map();

  rows.forEach((row) => {
    const key = keyFn(row);

    if (!map.has(key)) {
      map.set(key, {
        key,
        revenue: 0,
        totalCamps: 0,
        students: new Set(),
        sessions: new Set(),
      });
    }

    const item = map.get(key);

    item.revenue += row.paid;

    if (row.paid > 0) {
      item.totalCamps += 1;
    }

    item.students.add(row.studentNumber);
    item.sessions.add(row.sessionKey);
  });

  return Array.from(map.values()).map((item) => ({
    ...item,
    encoders: item.students.size,
    classSessions: item.sessions.size,
    averageCampRevenue: item.totalCamps ? item.revenue / item.totalCamps : 0,
    averageClassSize: item.sessions.size ? item.totalCamps / item.sessions.size : 0,
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

      <div>
        <p className="text-sm font-semibold leading-5 text-slate-500">{title}</p>
        <p className="mt-3 break-words text-2xl font-bold leading-tight text-slate-900">
          {value}
        </p>
        {subtitle && (
          <p className="mt-2 text-sm leading-5 text-slate-500">{subtitle}</p>
        )}
      </div>
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
                <tr key={`${row.key}-${index}`} className="border-b border-slate-100 last:border-0">
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

export default function CampDashboard() {
  const [rows, setRows] = useState([]);
  const [campPresets, setCampPresets] = useState([]);
  const [selectedCampName, setSelectedCampName] = useState("");

  useEffect(() => {
    const schooltracsEntries = Object.entries(schooltracsCsvFiles);

    const allRows = schooltracsEntries.flatMap(([filePath, csvText]) => {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      return result.data.map((row, index) => {
        return normalizeSchooltracsRow(row, `${filePath}-${index}`);
      });
    });

    const cleanedRows = allRows.filter((row) => row.date && row.dateKey !== "Unknown");
    setRows(cleanedRows);

    const presetEntries = Object.entries(campPresetCsvFile);
    const presetText = presetEntries[0]?.[1];

    if (presetText) {
      const result = Papa.parse(presetText, {
        header: true,
        skipEmptyLines: true,
      });

      const presets = result.data
        .map(normalizeCampPreset)
        .filter((preset) => preset.campName && preset.startDate && preset.endDate);

      setCampPresets(presets);

      if (presets.length) {
        setSelectedCampName(presets[0].campName);
      }
    }
  }, []);

  const selectedCamp = useMemo(() => {
    return campPresets.find((camp) => camp.campName === selectedCampName) || campPresets[0];
  }, [campPresets, selectedCampName]);

  const campRows = useMemo(() => {
    if (!selectedCamp) return [];

    return rows.filter((row) => {
      const isInDateRange =
        row.dateKey >= selectedCamp.startDate && row.dateKey <= selectedCamp.endDate;

      const isCampCategory = row.courseCategory.toLowerCase() === "elective";

      return isInDateRange && isCampCategory;
    });
  }, [rows, selectedCamp]);

  const paidCampRows = useMemo(() => {
    return campRows.filter((row) => row.paid > 0);
  }, [campRows]);

  const summary = useMemo(() => {
    const campRevenue = paidCampRows.reduce((sum, row) => sum + row.paid, 0);
    const totalCamps = paidCampRows.length;
    const encoders = new Set(paidCampRows.map((row) => row.studentNumber)).size;
    const classSessions = new Set(paidCampRows.map((row) => row.sessionKey)).size;
    const revenueTarget = selectedCamp?.revenueTarget || 0;
    const remaining = Math.max(revenueTarget - campRevenue, 0);

    return {
      campRevenue,
      revenueTarget,
      targetProgress: revenueTarget ? campRevenue / revenueTarget : 0,
      remaining,
      totalCamps,
      encoders,
      averageCampRevenue: totalCamps ? campRevenue / totalCamps : 0,
      averageClassSize: classSessions ? totalCamps / classSessions : 0,
      classSessions,
    };
  }, [paidCampRows, selectedCamp]);

  const topicRows = useMemo(() => {
    return groupCampRows(paidCampRows, (row) => row.courseName).sort(
      (a, b) => b.revenue - a.revenue
    );
  }, [paidCampRows]);

  const timeSlotRows = useMemo(() => {
    return groupCampRows(paidCampRows, (row) => row.startTime).sort((a, b) =>
      String(a.key).localeCompare(String(b.key))
    );
  }, [paidCampRows]);

  const courseLevelRows = useMemo(() => {
    return groupCampRows(paidCampRows, (row) => row.courseLevel).sort(
      (a, b) => b.revenue - a.revenue
    );
  }, [paidCampRows]);

  const staffRows = useMemo(() => {
    return groupCampRows(paidCampRows, (row) => row.staff).sort(
      (a, b) => b.revenue - a.revenue
    );
  }, [paidCampRows]);

  const topTopic = topicRows[0];
  const topTimeSlot = [...timeSlotRows].sort((a, b) => b.totalCamps - a.totalCamps)[0];
  const topLevel = courseLevelRows[0];
  const topStaff = staffRows[0];

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#53C8E0] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Encode Education</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Camp Dashboard</h1>
              <p className="mt-2 text-sm text-white/85">
                Revenue-only dashboard for camp / elective periods.
              </p>
            </div>

            <div className="w-full max-w-md">
              <label className="mb-1 block text-sm font-semibold text-white/90">
                Select Camp
              </label>

              <select
                value={selectedCampName}
                onChange={(e) => setSelectedCampName(e.target.value)}
                className="w-full rounded-xl border border-white/30 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
              >
                {campPresets.map((camp) => (
                  <option key={camp.campName} value={camp.campName}>
                    {camp.campName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {!selectedCamp ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
            No camp presets found. Please create <strong>src/data/camp-presets.csv</strong>.
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">Selected Camp</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {selectedCamp.campName}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Camp Period</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {selectedCamp.startDate} to {selectedCamp.endDate}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-500">Revenue Target</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {formatHKD(selectedCamp.revenueTarget)}
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                    <KpiCard
                    title="Camp Revenue"
                    value={formatHKD(summary.campRevenue)}
                    subtitle="Earned revenue from paid camp lessons"
                    icon={DollarSign}
                    />

                    <KpiCard
                    title="Target Progress"
                    value={formatPercent(summary.targetProgress)}
                    subtitle={`${formatHKD(summary.campRevenue)} / ${formatHKD(summary.revenueTarget)}`}
                    icon={Target}
                    />

                    <KpiCard
                    title="Remaining"
                    value={formatHKD(summary.remaining)}
                    subtitle="Revenue needed to hit target"
                    icon={TrendingUp}
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <KpiCard
                    title="Total Camps"
                    value={summary.totalCamps.toLocaleString()}
                    subtitle="Paid camp lesson rows"
                    icon={CalendarDays}
                    />

                    <KpiCard
                    title="Total Encoders"
                    value={summary.encoders.toLocaleString()}
                    subtitle="Unique students"
                    icon={Users}
                    />

                    <KpiCard
                    title="Avg Camp Revenue"
                    value={formatHKD(summary.averageCampRevenue)}
                    subtitle="Revenue ÷ total camps"
                    icon={DollarSign}
                    />

                    <KpiCard
                    title="Avg Class Size"
                    value={summary.averageClassSize.toFixed(2)}
                    subtitle={`${summary.classSessions} class sessions`}
                    icon={GraduationCap}
                    />
                </div>
                </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Revenue by Camp Topic">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topicRows.slice(0, 10)}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 80, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis dataKey="key" type="category" width={130} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatHKD(value)} />
                    <Legend />
                    <Bar
                      dataKey="revenue"
                      name="Camp Revenue"
                      radius={[0, 8, 8, 0]}
                      fill={BRAND_PRIMARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Popular Time Slots">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSlotRows} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="key" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="totalCamps"
                      name="Paid Camp Lessons"
                      radius={[8, 8, 0, 0]}
                      fill={BRAND_PRIMARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Revenue by Course Level">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={courseLevelRows.slice(0, 10)}
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
                      name="Camp Revenue"
                      radius={[0, 8, 8, 0]}
                      fill={BRAND_SECONDARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

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
                      name="Camp Revenue"
                      radius={[0, 8, 8, 0]}
                      fill={BRAND_SECONDARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">Camp Insights</h3>

                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                  <p>
                    <strong className="text-slate-900">{selectedCamp.campName}</strong> has generated{" "}
                    <strong className="text-slate-900">{formatHKD(summary.campRevenue)}</strong>,
                    reaching{" "}
                    <strong className="text-slate-900">
                      {formatPercent(summary.targetProgress)}
                    </strong>{" "}
                    of the{" "}
                    <strong className="text-slate-900">
                      {formatHKD(summary.revenueTarget)}
                    </strong>{" "}
                    target.
                  </p>

                  <p>
                    Remaining revenue needed is{" "}
                    <strong className="text-slate-900">{formatHKD(summary.remaining)}</strong>.
                  </p>

                  {topTopic ? (
                    <p>
                      The strongest camp topic is{" "}
                      <strong className="text-slate-900">{topTopic.key}</strong>, generating{" "}
                      <strong className="text-slate-900">{formatHKD(topTopic.revenue)}</strong>.
                    </p>
                  ) : null}

                  {topTimeSlot ? (
                    <p>
                      The most popular time slot is{" "}
                      <strong className="text-slate-900">{topTimeSlot.key}</strong>, with{" "}
                      <strong className="text-slate-900">{topTimeSlot.totalCamps}</strong> paid camp
                      lessons.
                    </p>
                  ) : null}

                  {topLevel ? (
                    <p>
                      The strongest course level is{" "}
                      <strong className="text-slate-900">{topLevel.key}</strong>, generating{" "}
                      <strong className="text-slate-900">{formatHKD(topLevel.revenue)}</strong>.
                    </p>
                  ) : null}

                  {topStaff ? (
                    <p>
                      The highest revenue teaching allocation is{" "}
                      <strong className="text-slate-900">{topStaff.key}</strong>, generating{" "}
                      <strong className="text-slate-900">{formatHKD(topStaff.revenue)}</strong>.
                    </p>
                  ) : null}

                  <p>
                    Average class size is{" "}
                    <strong className="text-slate-900">
                      {summary.averageClassSize.toFixed(2)}
                    </strong>
                    . This helps you evaluate whether the camp schedule is using classroom and
                    instructor capacity efficiently.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <TopTable
                title="Camp Topic Performance"
                rows={topicRows}
                columns={[
                  { key: "rank", label: "Rank", render: (_, index) => index + 1 },
                  { key: "key", label: "Course Name" },
                  { key: "revenue", label: "Revenue", render: (row) => formatHKD(row.revenue) },
                  {
                    key: "share",
                    label: "% of Camp Revenue",
                    render: (row) =>
                      summary.campRevenue ? formatPercent(row.revenue / summary.campRevenue) : "—",
                  },
                  { key: "totalCamps", label: "Total Camps" },
                  { key: "encoders", label: "Encoders" },
                  {
                    key: "averageCampRevenue",
                    label: "Avg Revenue",
                    render: (row) => formatHKD(row.averageCampRevenue),
                  },
                ]}
              />

              <TopTable
                title="Time Slot Performance"
                rows={timeSlotRows}
                columns={[
                  { key: "key", label: "Start Time" },
                  { key: "totalCamps", label: "Total Camps" },
                  { key: "revenue", label: "Revenue", render: (row) => formatHKD(row.revenue) },
                  { key: "encoders", label: "Encoders" },
                  {
                    key: "averageClassSize",
                    label: "Avg Class Size",
                    render: (row) => row.averageClassSize.toFixed(2),
                  },
                ]}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}