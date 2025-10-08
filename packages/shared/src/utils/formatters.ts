/**
 * Utility functions for formatting data in the UI
 */

export const formatCurrency = (value: number, currency = 'GBP'): string => {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatPercentage = (value: number, decimals = 2): string => {
  return `${value.toFixed(decimals)}%`;
};

export const formatDate = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-GB');
};

export const formatDateTime = (date: Date | string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString('en-GB') + ' ' + dateObj.toLocaleTimeString('en-GB');
};

export const formatNumber = (value: number, decimals = 0): string => {
  return new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const formatCompactNumber = (value: number): string => {
  return new Intl.NumberFormat('en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

export const formatDaysToText = (days: number): string => {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days} days`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months > 1 ? 's' : ''}`;
  }
  const years = Math.floor(days / 365);
  return `${years} year${years > 1 ? 's' : ''}`;
};

export const formatRateChange = (currentRate: number, newRate: number): string => {
  const change = newRate - currentRate;
  if (change > 0) {
    return `⬆️ +${formatPercentage(change)}`;
  } else if (change < 0) {
    return `⬇️ ${formatPercentage(change)}`;
  } else {
    return '➡️ No change';
  }
};