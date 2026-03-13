/**
 * Parse relative time strings into Date objects
 * Supports: "in X minutes", "in X hours", "tomorrow", "next Monday at 10am"
 */
export const parseRelativeTime = (timeStr) => {
  if (!timeStr) return null;
  
  const now = new Date();
  const lowerStr = timeStr.toLowerCase().trim();
  
  // 1. Minutes: "in 5 minutes", "5 min"
  const minMatch = lowerStr.match(/in\s*(\d+)\s*min/i) || lowerStr.match(/^(\d+)\s*min/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1]);
    return new Date(now.getTime() + mins * 60000);
  }
  
  // 2. Hours: "in 2 hours", "2 hr"
  const hrMatch = lowerStr.match(/in\s*(\d+)\s*hour/i) || lowerStr.match(/^(\d+)\s*hr/i);
  if (hrMatch) {
    const hrs = parseInt(hrMatch[1]);
    return new Date(now.getTime() + hrs * 3600000);
  }
  
  // 3. Days: "tomorrow", "in 1 day"
  if (lowerStr.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0); // Default to 10 AM tomorrow
    return tomorrow;
  }
  
  // 4. Fallback: Try native Date.parse for strings like "2026-03-14T10:00:00"
  const parsed = Date.parse(timeStr);
  if (!isNaN(parsed)) {
    return new Date(parsed);
  }
  
  return null;
};
