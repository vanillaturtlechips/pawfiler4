/**
 * 반응형 브레이크포인트
 * 
 * xs: 320px ~ 639px (모바일)
 * sm: 640px ~ 767px (큰 모바일)
 * md: 768px ~ 1023px (태블릿)
 * lg: 1024px ~ 1279px (작은 노트북)
 * xl: 1280px ~ 1535px (노트북)
 * 2xl: 1536px ~ 1919px (큰 노트북)
 * 3xl: 1920px+ (데스크톱)
 */

export const breakpoints = {
  xs: 320,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
  '3xl': 1920,
} as const;

export const containerMaxWidths = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1400px',
  '3xl': '1600px',
} as const;
