import React, { useEffect, useMemo, useRef, useState } from "react";
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
  DollarSign,
  Users,
  Clock,
  Target,
  Download,
  CalendarDays,
  BookOpen,
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

  const parts = raw.split(/[\/\-]/).map((x) => x.trim());

  if (parts.length === 3) {
    const [a, b, c] = parts;
    const year = c.length === 2 ? `20${c}` : c;

    // Schooltracs commonly exports DD/MM/YYYY.
    const d = new Date(Number(year), Number(b) - 1, Number(a));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateKey(date) {
  if (!date) return "";

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

function getMonthKey(date) {
  if (!date) return "Unknown";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

function formatNumber(value) {
  return new Intl.NumberFormat("en-HK", {
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function normalizeCategory(value) {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();

  if (lower === "regular") return "Regular";
  if (lower === "elective" || lower === "camp") return "Elective";
  if (lower === "trial") return "Trial";
  if (lower === "competition") return "Competition";
  if (lower === "jurassicode" || lower === "jurassi code") return "JurassiCode";

  return raw || "Other";
}

function normalizeRow(row, index) {
  const date = parseDate(row.Date || row.date);
  const dateKey = formatDateKey(date);
  const paid = toNumber(row.Paid || row.paid);
  const durationRaw = toNumber(row.Duration || row.duration);
  const durationHours = durationRaw > 10 ? durationRaw / 60 : durationRaw;

  const courseCategory = normalizeCategory(row["Course Category"] || row.courseCategory);

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
    dateKey,
    monthKey: getMonthKey(date),
    weekKey: getWeekKey(date),
    paid,
    durationHours,
    courseCategory,
    courseName,
    courseLevel,
    studentNumber,
    studentName,
    branchName: String(row["Branch Name"] || "").trim() || "Unknown",
    staff: String(row.Staff || "Unknown").trim() || "Unknown",
    attendance: String(row.Attendance || "").trim() || "Empty",
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
        lessons: 0,
        lessonHours: 0,
        students: new Set(),
      });
    }

    const item = map.get(key);

    item.revenue += row.paid;

    if (row.paid > 0) {
      item.lessons += 1;
      item.lessonHours += row.durationHours;
      item.students.add(row.studentNumber);
    }
  });

  return Array.from(map.values()).map((item) => ({
    ...item,
    students: item.students.size,
    revenuePerStudent: item.students.size ? item.revenue / item.students.size : 0,
    revenuePerLessonHour: item.lessonHours ? item.revenue / item.lessonHours : 0,
  }));
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
                  key={`${row.key || "row"}-${index}`}
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

export default function RevenueDashboard() {
  const reportRef = useRef(null);

  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [startDate, setStartDate] = useState(formatDateKey(getFirstDayOfCurrentMonth()));
  const [endDate, setEndDate] = useState(formatDateKey(getLastDayOfCurrentMonth()));
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedCourseName, setSelectedCourseName] = useState("All");
  const [timeGrouping, setTimeGrouping] = useState("Daily");

  useEffect(() => {
    const entries = Object.entries(csvFiles);

    const allRows = entries.flatMap(([filePath, csvText]) => {
      const result = Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
      });

      return result.data.map((row, index) => normalizeRow(row, `${filePath}-${index}`));
    });

    const cleanedRows = allRows.filter((row) => row.date && row.dateKey);

    setRows(cleanedRows);

    const loadedFileNames = entries.map(([filePath]) => filePath.split("/").pop()).join(", ");
    setFileName(loadedFileNames || "No CSV files found");

    setStartDate(formatDateKey(getFirstDayOfCurrentMonth()));
    setEndDate(formatDateKey(getLastDayOfCurrentMonth()));
  }, []);

  const courseCategories = useMemo(() => {
    return ["All", ...Array.from(new Set(rows.map((row) => row.courseCategory))).sort()];
  }, [rows]);

  const courseNames = useMemo(() => {
    const sourceRows =
      selectedCategory === "All"
        ? rows
        : rows.filter((row) => row.courseCategory === selectedCategory);

    return ["All", ...Array.from(new Set(sourceRows.map((row) => row.courseName))).sort()];
  }, [rows, selectedCategory]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const dateMatch = row.dateKey >= startDate && row.dateKey <= endDate;
      const categoryMatch =
        selectedCategory === "All" || row.courseCategory === selectedCategory;
      const courseMatch =
        selectedCourseName === "All" || row.courseName === selectedCourseName;

      return dateMatch && categoryMatch && courseMatch;
    });
  }, [rows, startDate, endDate, selectedCategory, selectedCourseName]);

  const paidRows = useMemo(() => {
    return filteredRows.filter((row) => row.paid > 0);
  }, [filteredRows]);

  const summary = useMemo(() => {
    const totalRevenue = paidRows.reduce((sum, row) => sum + row.paid, 0);
    const totalStudents = new Set(paidRows.map((row) => row.studentNumber)).size;
    const totalLessons = paidRows.length;
    const totalLessonHours = paidRows.reduce((sum, row) => sum + row.durationHours, 0);

    return {
      totalRevenue,
      totalStudents,
      totalLessons,
      totalLessonHours,
      revenuePerStudent: totalStudents ? totalRevenue / totalStudents : 0,
      revenuePerLessonHour: totalLessonHours ? totalRevenue / totalLessonHours : 0,
      targetProgress: MONTHLY_TARGET ? totalRevenue / MONTHLY_TARGET : 0,
      remainingToTarget: Math.max(MONTHLY_TARGET - totalRevenue, 0),
    };
  }, [paidRows]);

  const categoryRevenue = useMemo(() => {
    const categories = {
      Regular: 0,
      Elective: 0,
      Trial: 0,
      Competition: 0,
      JurassiCode: 0,
      Other: 0,
    };

    paidRows.forEach((row) => {
      if (row.courseCategory === "Regular") {
        categories.Regular += row.paid;
      } else if (row.courseCategory === "Elective") {
        categories.Elective += row.paid;
      } else if (row.courseCategory === "Trial") {
        categories.Trial += row.paid;
      } else if (row.courseCategory === "Competition") {
        categories.Competition += row.paid;
      } else if (row.courseCategory === "JurassiCode") {
        categories.JurassiCode += row.paid;
      } else {
        categories.Other += row.paid;
      }
    });

    return categories;
  }, [paidRows]);

  const trendRows = useMemo(() => {
    let keyFn = (row) => row.dateKey;

    if (timeGrouping === "Weekly") {
      keyFn = (row) => row.weekKey;
    }

    if (timeGrouping === "Monthly") {
      keyFn = (row) => row.monthKey;
    }

    return groupRows(paidRows, keyFn)
      .sort((a, b) => String(a.key).localeCompare(String(b.key)))
      .map((row) => ({
        period: row.key,
        revenue: Math.round(row.revenue),
        students: row.students,
        lessons: row.lessons,
      }));
  }, [paidRows, timeGrouping]);

  const categoryRows = useMemo(() => {
    return groupRows(paidRows, (row) => row.courseCategory).sort(
      (a, b) => b.revenue - a.revenue
    );
  }, [paidRows]);

  const courseNameRows = useMemo(() => {
    return groupRows(paidRows, (row) => row.courseName).sort(
      (a, b) => b.revenue - a.revenue
    );
  }, [paidRows]);

  const staffRows = useMemo(() => {
    return groupRows(paidRows, (row) => row.staff).sort((a, b) => b.revenue - a.revenue);
  }, [paidRows]);

  async function handleDownloadPdf() {
    if (!reportRef.current) return;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(reportRef.current, {
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

      pdf.save(`encode-earned-revenue-${startDate}-to-${endDate}.pdf`);
    } catch (error) {
      console.error(error);
      alert(
        "PDF download failed. Please make sure html2canvas and jspdf are installed: npm install html2canvas jspdf"
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div ref={reportRef} className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-3xl bg-[#53C8E0] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-medium text-white/80">Encode Education</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">
                Earned Revenue Dashboard
              </h1>
              <p className="mt-2 text-sm text-white/85">
                Earned revenue from Schooltracs lesson records. Revenue is calculated from{" "}
                <strong>Paid</strong> by lesson date.
              </p>
              <p className="mt-1 text-xs text-white/75">Loaded files: {fileName}</p>
            </div>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#0E8FA4] shadow-sm hover:bg-white/90"
            >
              <Download size={18} />
              Download PDF
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-600">
                Start Date
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#53C8E0]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-600">End Date</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#53C8E0]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-600">
                Course Category
              </span>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setSelectedCourseName("All");
                }}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#53C8E0]"
              >
                {courseCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-600">
                Course Name
              </span>
              <select
                value={selectedCourseName}
                onChange={(e) => setSelectedCourseName(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#53C8E0]"
              >
                {courseNames.map((courseName) => (
                  <option key={courseName}>{courseName}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-600">
                Time Grouping
              </span>
              <select
                value={timeGrouping}
                onChange={(e) => setTimeGrouping(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#53C8E0]"
              >
                <option>Daily</option>
                <option>Weekly</option>
                <option>Monthly</option>
              </select>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Total Revenue"
              value={formatHKD(summary.totalRevenue)}
              subtitle="Earned revenue from Paid"
              icon={DollarSign}
            />

            <KpiCard
              title="Revenue / Student"
              value={formatHKD(summary.revenuePerStudent)}
              subtitle={`${formatNumber(summary.totalStudents)} unique students`}
              icon={Users}
            />

            <KpiCard
              title="Revenue / Lesson Hour"
              value={formatHKD(summary.revenuePerLessonHour)}
              subtitle={`${summary.totalLessonHours.toFixed(1)} lesson hours`}
              icon={Clock}
            />

            <KpiCard
              title="Monthly Target Progress"
              value={formatPercent(summary.targetProgress)}
              subtitle={`${formatHKD(summary.totalRevenue)} / ${formatHKD(MONTHLY_TARGET)}`}
              icon={Target}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              title="Regular Revenue"
              value={formatHKD(categoryRevenue.Regular)}
              subtitle="Regular class earned revenue"
              icon={BookOpen}
            />

            <KpiCard
              title="Elective Revenue"
              value={formatHKD(categoryRevenue.Elective)}
              subtitle="Camp / elective earned revenue"
              icon={BookOpen}
            />

            <KpiCard
              title="Trial Revenue"
              value={formatHKD(categoryRevenue.Trial)}
              subtitle="Trial lesson earned revenue"
              icon={BookOpen}
            />

            <KpiCard
              title="Competition Revenue"
              value={formatHKD(categoryRevenue.Competition)}
              subtitle="Competition class earned revenue"
              icon={BookOpen}
            />

            <KpiCard
              title="JurassiCode Revenue"
              value={formatHKD(categoryRevenue.JurassiCode)}
              subtitle="JurassiCode earned revenue"
              icon={BookOpen}
            />

            <KpiCard
              title="Other Revenue"
              value={formatHKD(categoryRevenue.Other)}
              subtitle="Unmatched course category"
              icon={BookOpen}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={`Revenue Trend by ${timeGrouping}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendRows} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
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

          <ChartCard title="Revenue by Course Category">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryRows}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 80, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis dataKey="key" type="category" width={120} tick={{ fontSize: 12 }} />
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

        <section className="grid gap-6 lg:grid-cols-2">
          <ChartCard title="Top Course Names by Revenue">
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

          <ChartCard title="Revenue by Staff">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={staffRows.slice(0, 10)}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 80, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <YAxis dataKey="key" type="category" width={120} tick={{ fontSize: 12 }} />
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

        <section className="grid gap-6 lg:grid-cols-2">
          <TopTable
            title="Course Category Performance"
            rows={categoryRows}
            columns={[
              { key: "key", label: "Course Category" },
              { key: "revenue", label: "Revenue", render: (row) => formatHKD(row.revenue) },
              { key: "students", label: "Students" },
              { key: "lessons", label: "Paid Lessons" },
              {
                key: "revenuePerStudent",
                label: "Revenue / Student",
                render: (row) => formatHKD(row.revenuePerStudent),
              },
              {
                key: "revenuePerLessonHour",
                label: "Revenue / Lesson Hour",
                render: (row) => formatHKD(row.revenuePerLessonHour),
              },
            ]}
          />

          <TopTable
            title="Top Course Name Performance"
            rows={courseNameRows.slice(0, 20)}
            columns={[
              { key: "key", label: "Course Name" },
              { key: "revenue", label: "Revenue", render: (row) => formatHKD(row.revenue) },
              { key: "students", label: "Students" },
              { key: "lessons", label: "Paid Lessons" },
              {
                key: "revenuePerStudent",
                label: "Revenue / Student",
                render: (row) => formatHKD(row.revenuePerStudent),
              },
              {
                key: "revenuePerLessonHour",
                label: "Revenue / Lesson Hour",
                render: (row) => formatHKD(row.revenuePerLessonHour),
              },
            ]}
          />
        </section>
      </div>
    </div>
  );
}