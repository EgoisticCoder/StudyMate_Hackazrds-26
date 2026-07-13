/**
 * Fixed weekly skeleton with hourly time blocks — merged with AI output.
 * Generates a full 7AM-10PM grid so the AI fills actual study hours.
 */
export function buildTimetablePromptBlock(studentProfile: {
  daily_study_mins: number;
  peak_study_time: string;
  board: string;
  class: number;
}): string {
  // Generate all 1-hour time blocks from 7AM to 10PM
  const timeBlocks: string[] = [];
  for (let h = 7; h <= 21; h++) {
    const start = `${String(h).padStart(2, '0')}:00`;
    const end = `${String(h + 1).padStart(2, '0')}:00`;
    timeBlocks.push(`${start}-${end}`);
  }

  const timeRows = timeBlocks.map(t => `| ${t} |        |         |           |          |        |          |        |`).join('\n');

  return `
TIMETABLE TEMPLATE — You MUST generate a proper weekly grid with hourly time slots.
Peak study time: ${studentProfile.peak_study_time}
Total study budget on school days: ~${studentProfile.daily_study_mins} minutes (split into 2–4 blocks).
Weekend: add one longer block for weak subjects.

OUTPUT FORMAT — Use this exact table structure (fill subjects into appropriate cells):

| Time          | Monday     | Tuesday    | Wednesday  | Thursday   | Friday     | Saturday   | Sunday     |
|---------------|------------|------------|------------|------------|------------|------------|------------|
${timeRows}

RULES FOR FILLING THE TABLE:
1. Most cells should be EMPTY (leave blank) — students only study 2-4 hours/day, not all day.
2. Fill in study sessions in the cells that match their peak time window.
3. School hours (08:00-15:00 on weekdays) should contain "School" or be blank.
4. Each filled cell must contain: Subject name + brief topic (e.g., "Physics: Optics Ch.10" or "Maths: Quadratic Eqns")
5. Allocate MORE time to weak subjects than strong subjects.
6. Include breaks/rest periods marked as "Break" or "Rest".
7. Weekend can have more study blocks than weekdays.
8. Name exact chapters from the ${studentProfile.board} syllabus for Class ${studentProfile.class}.
9. After the table, include "## Weekly Focus" section with 3-5 bullet points on priority chapters.
10. Use markdown formatting: headings (#), bold (**), bullet points (-), and the table (|).
`.trim();
}

/**
 * Returns the list of all time slots used in the grid.
 */
export function getTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 21; h++) {
    const start = `${String(h).padStart(2, '0')}:00`;
    const end = `${String(h + 1).padStart(2, '0')}:00`;
    slots.push(`${start}-${end}`);
  }
  return slots;
}
