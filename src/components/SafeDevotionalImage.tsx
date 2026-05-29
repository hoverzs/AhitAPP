import Image from "next/image";
interface SafeDevotionalImageProps {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  onError?: () => void;
}

/** Helyi (/…) képek: next/image. Pexels és egyéb távoli URL: közvetlen img (CDN, nincs szerveroldali proxy). */
export function SafeDevotionalImage({
  src,
  alt,
  className = "",
  fill,
  priority,
  sizes,
  onError,
}: SafeDevotionalImageProps) {
  const isLocal = src.startsWith("/") && !src.startsWith("//");

  if (isLocal) {
    return (
      <Image
        src={src}
        alt={alt}
        fill={fill}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        sizes={sizes}
        className={className}
        onError={onError}
      />
    );
  }

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onError={onError}
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={onError}
      className={className}
    />
  );
}
