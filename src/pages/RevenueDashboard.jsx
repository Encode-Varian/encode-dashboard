import React, { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import {
  Upload,
  TrendingUp,
  Users,
  Clock,
  DollarSign,
  Target,
  FileText,
  Download,
} from "lucide-react";

const MONTHLY_TARGET = 150000;
const BRAND_PRIMARY = "#53C8E0";
const BRAND_SECONDARY = "#F7941D";

const csvFiles = import.meta.glob("../data/schooltracs/*.csv", {
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

    // Assumes Schooltracs usually exports DD/MM/YYYY.
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

function getFirstDayOfCurrentMonth() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
}

function getLastDayOfCurrentMonth() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth() + 1, 0);
}

function monthKey(date) {
  if (!date) return "Unknown";

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");

  return `${y}-${m}`;
}

function weekKey(date) {
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

function cleanAttendance(value) {
  const raw = String(value || "").trim();

  if (!raw) return "Empty";

  const lower = raw.toLowerCase();

  if (lower === "present") return "Present";
  if (lower === "leave") return "Leave";
  if (lower === "sick") return "Sick";
  if (lower === "absent") return "Absent";

  return raw;
}

function normalizeRow(row, index) {
  const date = parseDate(row.Date || row.date);
  const paid = toNumber(row.Paid || row.paid);
  const durationRaw = toNumber(row.Duration || row.duration);

  // If duration is larger than 10, assume it is minutes.
  // Example: 90 becomes 1.5 hours.
  // If duration is 1.5, keep it as hours.
  const durationHours = durationRaw > 10 ? durationRaw / 60 : durationRaw;

  const attendanceStatus = cleanAttendance(row.Attendance || row.attendance);

  const courseCategory =
    String(row["Course Category"] || row.courseCategory || "Uncategorized").trim() ||
    "Uncategorized";

  const courseName =
    String(row["Course Name"] || row.courseName || "Unknown Course").trim() ||
    "Unknown Course";

  const studentNumber = String(
    row["Student Number"] || row.studentNumber || row["Student Name"] || `row-${index}`
  ).trim();

  return {
    id: index,
    studentName: String(row["Student Name"] || "").trim(),
    branchName: String(row["Branch Name"] || "").trim(),
    studentNumber,
    courseCategory,
    courseName,
    coursePair: `${courseCategory} / ${courseName}`,
    courseLevel: String(row["Course Level"] || "").trim() || "Unknown",
    date,
    dateKey: formatDateKey(date),
    monthKey: monthKey(date),
    weekKey: weekKey(date),
    startTime: row["Start Time"] || "",
    endTime: row["End Time"] || "",
    durationHours,
    staff: String(row.Staff || "Unknown").trim() || "Unknown",
    attendanceStatus,
    paid,
    receiptNumber: String(row["Receipt Number"] || "").trim(),
  };
}

function groupSum(rows, keyFn) {
  const map = new Map();

  rows.forEach((row) => {
    const key = keyFn(row);

    if (!map.has(key)) {
      map.set(key, {
        key,
        revenue: 0,
        hours: 0,
        lessonCount: 0,
        students: new Set(),
      });
    }

    const item = map.get(key);

    item.revenue += row.paid;
    item.hours += row.durationHours;
    item.lessonCount += 1;
    item.students.add(row.studentNumber);
  });

  return Array.from(map.values()).map((item) => ({
    ...item,
    studentCount: item.students.size,
    revenuePerHour: item.hours ? item.revenue / item.hours : 0,
    revenuePerStudent: item.students.size ? item.revenue / item.students.size : 0,
  }));
}

function getUnique(rows, key) {
  return ["All", ...Array.from(new Set(rows.map((row) => row[key]).filter(Boolean))).sort()];
}

function KpiCard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>

        {Icon && (
          <div className="rounded-xl bg-[#53C8E0]/15 p-3 text-[#0E8FA4]">
            <Icon size={22} />
          </div>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#53C8E0]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateInput({ label, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-[#53C8E0]"
      />
    </label>
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
                  No data available for the selected filters.
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={`${row.key}-${idx}`} className="border-b border-slate-100 last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3 text-slate-700">
                      {col.render ? col.render(row, idx) : row[col.key]}
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

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-slate-900">{title}</h3>
      <div className="h-80">{children}</div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#53C8E0]/15 text-[#0E8FA4]">
        <Upload size={28} />
      </div>

      <h2 className="text-xl font-bold text-slate-900">Upload your Schooltracs CSV</h2>

      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
        This dashboard uses lesson date and the Paid column as earned revenue. It supports daily,
        weekly, and monthly views, course ranking, and staff allocation analysis.
      </p>
    </div>
  );
}

export default function RevenueDashboard() {
  const dashboardRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [viewBy, setViewBy] = useState("Monthly");
  const [courseCategory, setCourseCategory] = useState("All");
  const [courseName, setCourseName] = useState("All");
  const [staff, setStaff] = useState("All");
  const [attendance, setAttendance] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const entries = Object.entries(csvFiles);

    if (!entries.length) {
      return;
    }

    const allRows = entries.flatMap(([filePath, csvText]) => {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      return result.data.map((row, index) => {
        return normalizeRow(row, `${filePath}-${index}`);
      });
    });

    const normalized = allRows.filter((row) => row.date && row.dateKey !== "Unknown");

    setRows(normalized);

    const loadedFileNames = entries
      .map(([filePath]) => filePath.split("/").pop())
      .join(", ");

    setFileName(loadedFileNames);

    setStartDate(formatDateKey(getFirstDayOfCurrentMonth()));
    setEndDate(formatDateKey(getLastDayOfCurrentMonth()));
  }, []);

  async function handleDownloadPdf() {
    if (!dashboardRef.current || !rows.length) return;

    const canvas = await html2canvas(dashboardRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#f8fafc",
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const dateLabel = new Date().toISOString().slice(0, 10);
    pdf.save(`encode-earned-revenue-dashboard-${dateLabel}.pdf`);
  }

  function handleFiles(files) {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;

    setFileName(selectedFiles.map((file) => file.name).join(", "));

    Promise.all(
      selectedFiles.map(
        (file) =>
          new Promise((resolve, reject) => {
            Papa.parse(file, {
              header: true,
              skipEmptyLines: true,
              complete: (result) => resolve(result.data),
              error: reject,
            });
          })
      )
    ).then((allData) => {
      const combined = allData.flat();

      const normalized = combined
        .map(normalizeRow)
        .filter((row) => row.date && row.dateKey !== "Unknown");

      setRows(normalized);

      if (normalized.length) {
        const dates = normalized.map((row) => row.date).sort((a, b) => a - b);
        setStartDate(formatDateKey(dates[0]));
        setEndDate(formatDateKey(dates[dates.length - 1]));
      }
    });
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (startDate && row.dateKey < startDate) return false;
      if (endDate && row.dateKey > endDate) return false;
      if (courseCategory !== "All" && row.courseCategory !== courseCategory) return false;
      if (courseName !== "All" && row.courseName !== courseName) return false;
      if (staff !== "All" && row.staff !== staff) return false;
      if (attendance !== "All" && row.attendanceStatus !== attendance) return false;

      return true;
    });
  }, [rows, startDate, endDate, courseCategory, courseName, staff, attendance]);

  const courseCategoryOptions = useMemo(() => getUnique(rows, "courseCategory"), [rows]);

  const courseNameOptions = useMemo(() => {
    const base =
      courseCategory === "All" ? rows : rows.filter((row) => row.courseCategory === courseCategory);

    return getUnique(base, "courseName");
  }, [rows, courseCategory]);

  const staffOptions = useMemo(() => getUnique(rows, "staff"), [rows]);
  const attendanceOptions = useMemo(() => getUnique(rows, "attendanceStatus"), [rows]);

  const summary = useMemo(() => {
    const revenue = filteredRows.reduce((sum, row) => sum + row.paid, 0);
    const hours = filteredRows.reduce((sum, row) => sum + row.durationHours, 0);
    const students = new Set(filteredRows.map((row) => row.studentNumber)).size;

    return {
      revenue,
      hours,
      students,
      targetProgress: revenue / MONTHLY_TARGET,
      revenuePerStudent: students ? revenue / students : 0,
      revenuePerHour: hours ? revenue / hours : 0,
    };
  }, [filteredRows]);

  const trendData = useMemo(() => {
    const keyFn = (row) => {
      if (viewBy === "Daily") return row.dateKey;
      if (viewBy === "Weekly") return row.weekKey;
      return row.monthKey;
    };

    return groupSum(filteredRows, keyFn)
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map((item) => ({
        period: item.key,
        revenue: Math.round(item.revenue),
        target: viewBy === "Monthly" ? MONTHLY_TARGET : undefined,
      }));
  }, [filteredRows, viewBy]);

  const categoryData = useMemo(() => {
    return groupSum(filteredRows, (row) => row.courseCategory)
      .sort((a, b) => b.revenue - a.revenue)
      .map((item) => ({
        name: item.key,
        revenue: Math.round(item.revenue),
      }));
  }, [filteredRows]);

  const coursePairRows = useMemo(() => {
    return groupSum(filteredRows, (row) => row.coursePair)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [filteredRows]);

  const staffRows = useMemo(() => {
    return groupSum(filteredRows, (row) => row.staff)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 12);
  }, [filteredRows]);

  const topCourse = coursePairRows[0];

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div ref={dashboardRef} className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 rounded-3xl bg-[#53C8E0] p-6 text-white shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Encode Education</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Earned Revenue Dashboard
            </h1>
            <p className="mt-2 text-sm text-white/85">
              Lesson-date revenue view based on Schooltracs CSV. Paid amount is treated as earned
              revenue.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!rows.length}
              className="flex items-center justify-center gap-3 rounded-2xl bg-[#F7941D] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={18} />
              Download PDF
            </button>
          </div>
        </header>

        {fileName && (
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <FileText size={18} className="text-[#0E8FA4]" />
            Loaded: <span className="font-semibold text-slate-900">{fileName}</span>
            <span className="ml-auto">{rows.length.toLocaleString()} lesson rows</span>
          </div>
        )}

        {!rows.length ? (
          <EmptyState />
        ) : (
          <>
            <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3 lg:grid-cols-7">
              <DateInput label="Start Date" value={startDate} onChange={setStartDate} />
              <DateInput label="End Date" value={endDate} onChange={setEndDate} />

              <Select
                label="View By"
                value={viewBy}
                onChange={setViewBy}
                options={["Daily", "Weekly", "Monthly"]}
              />

              <Select
                label="Category"
                value={courseCategory}
                onChange={(v) => {
                  setCourseCategory(v);
                  setCourseName("All");
                }}
                options={courseCategoryOptions}
              />

              <Select
                label="Course"
                value={courseName}
                onChange={setCourseName}
                options={courseNameOptions}
              />

              <Select label="Staff" value={staff} onChange={setStaff} options={staffOptions} />

              <Select
                label="Attendance"
                value={attendance}
                onChange={setAttendance}
                options={attendanceOptions}
              />
            </section>

            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <KpiCard
                title="Earned Revenue"
                value={formatHKD(summary.revenue)}
                subtitle={`${filteredRows.length.toLocaleString()} lessons`}
                icon={DollarSign}
              />

              <KpiCard
                title="Target Progress"
                value={formatPercent(summary.targetProgress)}
                subtitle={`${formatHKD(summary.revenue)} / ${formatHKD(MONTHLY_TARGET)}`}
                icon={Target}
              />

              <KpiCard
                title="Scheduled Students"
                value={summary.students.toLocaleString()}
                subtitle="Distinct student numbers"
                icon={Users}
              />

              <KpiCard
                title="Revenue / Student"
                value={formatHKD(summary.revenuePerStudent)}
                subtitle="Earned revenue ÷ students"
                icon={TrendingUp}
              />

              <KpiCard
                title="Revenue / Lesson Hour"
                value={formatHKD(summary.revenuePerHour)}
                subtitle={`${summary.hours.toFixed(1)} total hours`}
                icon={Clock}
              />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <ChartCard title={`Earned Revenue Trend — ${viewBy}`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={trendData}
                      margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                      <Tooltip formatter={(value) => formatHKD(value)} />
                      <Legend />

                      <Bar
                        dataKey="revenue"
                        name="Earned Revenue"
                        radius={[8, 8, 0, 0]}
                        fill={BRAND_PRIMARY}
                      />

                      {viewBy === "Monthly" && (
                        <Line
                          type="monotone"
                          dataKey="target"
                          name="Monthly Target"
                          strokeWidth={2}
                          dot={false}
                          stroke={BRAND_SECONDARY}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ChartCard title="Revenue by Course Category">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={categoryData}
                    layout="vertical"
                    margin={{ top: 10, right: 20, left: 40, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => formatHKD(value)} />

                    <Bar
                      dataKey="revenue"
                      name="Earned Revenue"
                      radius={[0, 8, 8, 0]}
                      fill={BRAND_PRIMARY}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </section>

            <section>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900">CEO Insights</h3>

                <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                  <p>
                    Earned revenue for the selected period is{" "}
                    <strong className="text-slate-900">{formatHKD(summary.revenue)}</strong>,
                    equal to{" "}
                    <strong className="text-slate-900">
                      {formatPercent(summary.targetProgress)}
                    </strong>{" "}
                    of the HK$150,000 monthly target.
                  </p>

                  <p>
                    The dashboard found{" "}
                    <strong className="text-slate-900">{summary.students}</strong> scheduled
                    students and{" "}
                    <strong className="text-slate-900">{summary.hours.toFixed(1)}</strong> lesson
                    hours, giving revenue per lesson hour of{" "}
                    <strong className="text-slate-900">
                      {formatHKD(summary.revenuePerHour)}
                    </strong>
                    .
                  </p>

                  {topCourse ? (
                    <p>
                      The highest revenue Course Category + Course Name pair is{" "}
                      <strong className="text-slate-900">{topCourse.key}</strong>, generating{" "}
                      <strong className="text-slate-900">{formatHKD(topCourse.revenue)}</strong>.
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <TopTable
                title="Top Course Category + Course Name Pairs"
                rows={coursePairRows}
                columns={[
                  { key: "rank", label: "Rank", render: (_, idx) => idx + 1 },
                  { key: "key", label: "Course Pair" },
                  { key: "revenue", label: "Revenue", render: (row) => formatHKD(row.revenue) },
                  { key: "studentCount", label: "Students" },
                  { key: "hours", label: "Hours", render: (row) => row.hours.toFixed(1) },
                  {
                    key: "revenuePerHour",
                    label: "Revenue / Hour",
                    render: (row) => formatHKD(row.revenuePerHour),
                  },
                  { key: "lessonCount", label: "Lessons" },
                ]}
              />

              <TopTable
                title="Revenue by Teaching Allocation"
                rows={staffRows}
                columns={[
                  { key: "rank", label: "Rank", render: (_, idx) => idx + 1 },
                  { key: "key", label: "Staff" },
                  { key: "revenue", label: "Revenue", render: (row) => formatHKD(row.revenue) },
                  { key: "studentCount", label: "Students" },
                  { key: "hours", label: "Hours", render: (row) => row.hours.toFixed(1) },
                  {
                    key: "revenuePerHour",
                    label: "Revenue / Hour",
                    render: (row) => formatHKD(row.revenuePerHour),
                  },
                  { key: "lessonCount", label: "Lessons" },
                ]}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}