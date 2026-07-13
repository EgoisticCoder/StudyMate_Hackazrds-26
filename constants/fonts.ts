// Font family constants for StudyMate AI redesign
// Uses @expo-google-fonts packages for cross-platform font loading

// Font family names — these match the export names from @expo-google-fonts
export const Fonts = {
  // Display font — Plus Jakarta Sans (headings, stat values)
  display: 'PlusJakartaSans_600SemiBold',
  displayMedium: 'PlusJakartaSans_500Medium',

  // Body font — Inter (body text, labels, captions)
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
} as const;

// Fallback: when fonts haven't loaded yet, use system defaults
export const FontFallback = {
  display: undefined, // system default
  displayMedium: undefined,
  body: undefined,
  bodyMedium: undefined,
} as const;
