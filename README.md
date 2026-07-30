# 프로젝트 성과 및 기여도 관리 대시보드

사내 프로젝트 성과·기여도를 권한별로 관리하는 React/TypeScript MVP입니다.

## 실행 방법

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

## 권한 모드 (우측 상단 스위처)

| 권한 | 데이터 범위 | 주요 기능 |
|------|------------|----------|
| 개발관리자 | 전사 | 프로젝트 CRUD, PPM 동기화, 인력 배분 |
| 경영관리 | 전사 (Read-only) | PDF 보고서 출력 |
| 사업본부장 | 소속 사업부 | 열람만 |
| 팀장 | 소속 팀 | PM 3-Track 인력 배분 |
| 일반 팀원 | 참여 PJT | 기여도 카드 |

## 핵심 기능

1. **5단계 권한 필터링** — Role별 데이터 Scope 자동 적용
2. **Admin 마스터 관리** — 프로젝트 등록/수정, PPM 동기화
3. **3-Track 인력 배분** — 공모/설계/제작 각 100% 검증
4. **자금·예산 패널** — Mock 데이터 + 3종 리스크 경고 배너
5. **PDF 출력** — 경영관리 권한, `@media print` A4 레이아웃
6. **Error Boundary** — App/Route/페이지 단위 백지 화면 방지

## 기술 스택

- Vite + React 18 + TypeScript
- React Router v6
- Context API (전역 상태)
- CSS (Toss 스타일 Card UI)

## 프로젝트 구조

```
src/
├── components/   # UI, Layout, Dashboard, Admin, Allocation, Budget
├── context/      # AppContext (권한, 프로젝트, 배분 상태)
├── data/         # Mock 데이터
├── pages/        # Dashboard, Admin, Allocation
├── types/        # TypeScript 타입
└── utils/        # 권한 필터링 유틸
```
