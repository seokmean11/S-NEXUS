import { Card } from '@/components/ui/Card';
import type { ContributionCard } from '@/types';

interface ContributionCardsProps {
  cards: ContributionCard[];
}

export function ContributionCards({ cards }: ContributionCardsProps) {
  if (cards.length === 0) {
    return (
      <Card title="나의 기여도">
        <p className="empty-state">참여 중인 프로젝트의 기여도 정보가 없습니다.</p>
      </Card>
    );
  }

  return (
    <div className="contribution-grid">
      {cards.map((card) => (
        <Card key={card.projectId} title={card.projectName}>
          <div className="contribution-card">
            <div className="contribution-card__tracks">
              <TrackBar label="공모 수주" value={card.bidRatio} color="#3182F6" />
              <TrackBar label="설계 실행" value={card.designRatio} color="#00C853" />
              <TrackBar label="제작 실행" value={card.productionRatio} color="#FF6B00" />
            </div>
            <div className="contribution-card__total">
              <span>총 기여도</span>
              <strong>{card.totalContribution}%</strong>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function TrackBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="track-bar">
      <div className="track-bar__header">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="track-bar__bg">
        <div
          className="track-bar__fill"
          style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
