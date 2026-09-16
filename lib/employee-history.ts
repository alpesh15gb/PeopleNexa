export type EducationInput = {
  qualification: string;
  specialization: string | null;
  institution: string;
  board: string | null;
  completionYear: number | null;
  grade: string | null;
};

export type ExperienceInput = {
  employer: string;
  jobTitle: string;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  location: string | null;
  responsibilities: string | null;
};

function text(value: unknown, max: number): string | null | "invalid" {
  if (value == null || String(value).trim() === "") return null;
  const result = String(value).trim();
  return result.length <= max ? result : "invalid";
}

function date(value: unknown): Date | null | "invalid" {
  if (value == null || String(value).trim() === "") return null;
  const key = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "invalid";
  const result = new Date(`${key}T00:00:00.000Z`);
  return Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== key ? "invalid" : result;
}

export function employeeHistory(value: unknown): { education: EducationInput[]; experience: ExperienceInput[] } | { error: string } {
  if (value == null) return { education: [], experience: [] };
  if (typeof value !== "object" || Array.isArray(value)) return { error: "Education and experience details are invalid." };
  const source = value as { education?: unknown; experience?: unknown };
  const educationRows = source.education ?? [];
  const experienceRows = source.experience ?? [];
  if (!Array.isArray(educationRows) || !Array.isArray(experienceRows) || educationRows.length > 10 || experienceRows.length > 10) {
    return { error: "Add up to 10 education and 10 work experience records." };
  }
  const education: EducationInput[] = [];
  for (const row of educationRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "Education details are invalid." };
    const item = row as Record<string, unknown>;
    const qualification = text(item.qualification, 120);
    const institution = text(item.institution, 160);
    const specialization = text(item.specialization, 120);
    const board = text(item.board, 160);
    const grade = text(item.grade, 40);
    const year = item.completionYear == null || item.completionYear === "" ? null : Number(item.completionYear);
    if (!qualification || !institution || qualification === "invalid" || institution === "invalid" || specialization === "invalid" || board === "invalid" || grade === "invalid" || (year != null && (!Number.isInteger(year) || year < 1950 || year > new Date().getUTCFullYear() + 1))) {
      return { error: "Each education record needs a qualification, institution, and a valid completion year." };
    }
    education.push({ qualification, institution, specialization, board, completionYear: year, grade });
  }
  const experience: ExperienceInput[] = [];
  for (const row of experienceRows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { error: "Work experience details are invalid." };
    const item = row as Record<string, unknown>;
    const employer = text(item.employer, 160);
    const jobTitle = text(item.jobTitle, 120);
    const startDate = date(item.startDate);
    const isCurrent = item.isCurrent === true;
    const endDate = isCurrent ? null : date(item.endDate);
    const location = text(item.location, 120);
    const responsibilities = text(item.responsibilities, 2000);
    if (!employer || !jobTitle || !startDate || employer === "invalid" || jobTitle === "invalid" || startDate === "invalid" || endDate === "invalid" || location === "invalid" || responsibilities === "invalid" || (!isCurrent && !endDate) || (endDate && endDate < startDate)) {
      return { error: "Each work record needs employer, job title, start date, and a valid end date unless it is current." };
    }
    experience.push({ employer, jobTitle, startDate, endDate, isCurrent, location, responsibilities });
  }
  return { education, experience };
}
