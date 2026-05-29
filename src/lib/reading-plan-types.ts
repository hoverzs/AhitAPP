export interface ReadingPlanDay {
  dayNumber: number;
  verseReference: string;
  themeCategory: string;
  verseText: string;
  imagePromptSubject: string;
  weekNumber: number;
  weekTheme: string;
}

export interface ReadingPlanWeek {
  weekNumber: number;
  theme: string;
  themeEn: string;
  days: Pick<ReadingPlanDay, "dayNumber" | "verseReference" | "themeCategory">[];
}

export interface ReadingPlan {
  title: string;
  generatedAt: string;
  weeks: ReadingPlanWeek[];
  days: ReadingPlanDay[];
}

export interface GeminiReadingPlanResponse {
  title: string;
  weeks: {
    weekNumber: number;
    theme: string;
    themeEn: string;
    days: {
      dayNumber: number;
      verseReference: string;
      themeCategory: string;
      verseText: string;
      imagePromptSubject: string;
    }[];
  }[];
}
