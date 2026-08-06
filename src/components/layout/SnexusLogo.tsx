/**
 * S-NEXUS 로그인 로고 — 첨부 원본 PNG 형태·색상 그대로 (투명 배경)
 */
export function SnexusLogo({ className }: { className?: string }) {
  return (
    <div className={`login-page__logo-wrap${className ? ` ${className}` : ''}`}>
      <img
        src="/s-nexus-logo-clear@2x.png"
        srcSet="/s-nexus-logo-clear.png 1x, /s-nexus-logo-clear@2x.png 2x, /s-nexus-logo-clear@3x.png 3x"
        alt="S-NEXUS"
        className="login-page__logo-img"
        width={408}
        height={117}
        decoding="sync"
        draggable={false}
      />
    </div>
  );
}
