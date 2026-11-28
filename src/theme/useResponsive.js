import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { layout } from './tokens';

/**
 * Responsive helper used across screens. Keeps content readable on very
 * small Android devices while allowing comfortable tablet/web layouts.
 *
 * The returned shape is intentionally backwards compatible: screens rely on
 * `horizontalPadding`, `columns`, `gutter`, `contentWidth`, `isSmall`,
 * `isCompact` and `isTablet`.
 */
export default function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();

  return useMemo(() => {
    const isSmall = width < 360;
    const isCompact = width < 390;
    const isTablet = width >= 640;
    const isWide = width >= 820;
    const horizontalPadding = isSmall
      ? layout.screenPaddingCompact
      : isTablet
        ? 32
        : layout.screenPadding;
    // Never let content stretch past a comfortable reading measure on web or
    // tablets; screens centre this width via `maxContentWidth`.
    const maxContentWidth = layout.contentMaxWidth;
    const contentWidth = Math.min(width - horizontalPadding * 2, maxContentWidth);
    const cardColumns = isWide ? 3 : isTablet ? 2 : 1;

    return {
      width,
      height,
      fontScale,
      isSmall,
      isCompact,
      isTablet,
      isWide,
      horizontalPadding,
      contentWidth,
      maxContentWidth,
      columns: isSmall ? 1 : 2,
      cardColumns,
      gutter: isSmall ? 10 : isTablet ? 16 : 12,
    };
  }, [width, height, fontScale]);
}
