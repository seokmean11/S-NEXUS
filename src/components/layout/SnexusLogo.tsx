/**
 * S-NEXUS 로그인 로고 — 첨부 원본 PNG 형태·색상 그대로 (투명 배경)
 */
export function SnexusLogo({ className }: { className?: string }) {
  return (
    <div className={`login-page__logo-wrap${className ? ` ${className}` : ''}`}>
      <img
        src="/s-nexus-logo-clear.png"
        srcSet="/s-nexus-logo-clear.png 408w, /s-nexus-logo-clear@2x.png 816w, /s-nexus-logo-clear@3x.png 1224w"
        sizes="408px"
        alt="S-NEXUS"
        className="login-page__logo-img"
        width={408}
        height={117}
        decoding="sync"
        fetchPriority="high"
        draggable={false}
      />
    </div>
  );
}
