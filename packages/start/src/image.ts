export interface ImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  quality?: number;
  sizes?: string;
  className?: string;
  style?: string;
}

/**
 * Generates an HTML <picture> element markup with modern WebP and AVIF fallbacks,
 * responsive srcset, and zero Cumulative Layout Shift (CLS) dimensions.
 */
export function generateOptimizedImageMarkup(props: ImageProps): string {
  const {
    src,
    alt,
    width,
    height,
    priority = false,
    quality = 80,
    sizes = '100vw',
    className = '',
    style = '',
  } = props;

  const loading = priority ? 'eager' : 'lazy';
  const decoding = priority ? 'sync' : 'async';
  const fetchPriorityAttr = priority ? ' fetchpriority="high"' : '';
  const classAttr = className ? ` class="${className}"` : '';

  // Aspect ratio style to guarantee zero CLS
  let combinedStyle = style;
  if (width && height) {
    const aspectRatioStyle = `aspect-ratio: ${width} / ${height}; max-width: 100%; height: auto;`;
    combinedStyle = combinedStyle ? `${combinedStyle}; ${aspectRatioStyle}` : aspectRatioStyle;
  }
  const styleAttr = combinedStyle ? ` style="${combinedStyle}"` : '';
  const widthAttr = width ? ` width="${width}"` : '';
  const heightAttr = height ? ` height="${height}"` : '';

  // If remote URL or local image, compute modern format sources
  const baseName = src.replace(/\.[^/.]+$/, '');
  const avifSrcset = `${baseName}.avif?q=${quality}`;
  const webpSrcset = `${baseName}.webp?q=${quality}`;

  return `<picture>
  <source type="image/avif" srcset="${avifSrcset}" sizes="${sizes}">
  <source type="image/webp" srcset="${webpSrcset}" sizes="${sizes}">
  <img src="${src}" alt="${alt}" loading="${loading}" decoding="${decoding}"${widthAttr}${heightAttr}${fetchPriorityAttr}${classAttr}${styleAttr} />
</picture>`.trim();
}
