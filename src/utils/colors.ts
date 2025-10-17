export const DEFAULT_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1E2', // Sky Blue
  '#F8B88B', // Peach
  '#ABEBC6', // Light Green
  '#FAD7A0', // Tan
  '#D7BDE2', // Lavender
];

export const getNextColor = (usedColors: string[]): string => {
  const availableColors = DEFAULT_COLORS.filter(color => !usedColors.includes(color));
  if (availableColors.length > 0) {
    return availableColors[0];
  }
  // If all default colors are used, generate a random color
  return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
};
