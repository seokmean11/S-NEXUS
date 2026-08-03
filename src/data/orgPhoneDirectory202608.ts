/* eslint-disable */
/** Auto-generated from 내선전화표(2026.08) — affiliate orgs excluded */
import type { Division, Employee, ExecutiveOffice, Team } from '@/types';

export const PHONE_DIRECTORY_ORG_META = {
  "source": "내선전화표(2026.08, 계열사 제외)",
  "generatedAt": "2026-08-03T22:57:55.041Z",
  "parseVersion": 3,
  "stats": {
    "divisions": 6,
    "teams": 17,
    "employees": 164,
    "executives": 17
  }
} as const;

export const PHONE_DIRECTORY_EXECUTIVE_OFFICE: ExecutiveOffice = {
  "admins": [
    {
      "id": "exec-박기석",
      "name": "박기석",
      "rank": "회장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-김승태",
      "name": "김승태",
      "rank": "부회장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-박대민",
      "name": "박대민",
      "rank": "부회장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-남경우",
      "name": "남경우",
      "rank": "부사장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-이용석",
      "name": "이용석",
      "rank": "부사장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-신강준",
      "name": "신강준",
      "rank": "전무",
      "accessRole": "경영진"
    },
    {
      "id": "exec-차중호",
      "name": "차중호",
      "rank": "전무",
      "accessRole": "경영진"
    },
    {
      "id": "exec-신상면",
      "name": "신상면",
      "rank": "상무",
      "accessRole": "경영진"
    },
    {
      "id": "exec-정형철",
      "name": "정형철",
      "rank": "상무",
      "accessRole": "경영진"
    },
    {
      "id": "exec-최광효",
      "name": "최광효",
      "rank": "상무보",
      "accessRole": "경영진"
    },
    {
      "id": "exec-정우중",
      "name": "정우중",
      "rank": "상무보",
      "accessRole": "경영진"
    },
    {
      "id": "exec-하윤성",
      "name": "하윤성",
      "rank": "실장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-한용철",
      "name": "한용철",
      "rank": "실장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-김성훈",
      "name": "김성훈",
      "rank": "실장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-최준우",
      "name": "최준우",
      "rank": "실장",
      "accessRole": "경영진"
    },
    {
      "id": "exec-이동헌",
      "name": "이동헌",
      "rank": "감사",
      "accessRole": "경영진"
    },
    {
      "id": "exec-김빛나",
      "name": "김빛나",
      "rank": "선임",
      "accessRole": "경영진"
    }
  ]
};

export const PHONE_DIRECTORY_DIVISIONS: Division[] = [
  {
    "id": "div-exec",
    "name": "임원실"
  },
  {
    "id": "div-plan",
    "name": "경영기획본부",
    "headName": "남경우",
    "headRank": "본부장"
  },
  {
    "id": "div-os",
    "name": "해외사업실",
    "headName": "정형철",
    "headRank": "사업실장"
  },
  {
    "id": "div-ex",
    "name": "전시사업본부",
    "headName": "차중호",
    "headRank": "본부장"
  },
  {
    "id": "div-in",
    "name": "인테리어사업본부",
    "headName": "이용석",
    "headRank": "본부장"
  },
  {
    "id": "div-nm",
    "name": "뉴미디어사업실",
    "headName": "신강준",
    "headRank": "사업실장"
  }
];

export const PHONE_DIRECTORY_TEAMS: Team[] = [
  {
    "id": "team-div-exec-임원실",
    "name": "임원실",
    "divisionId": "div-exec",
    "headName": "최준우",
    "headRank": "실장"
  },
  {
    "id": "team-div-plan-경영지원팀",
    "name": "경영지원팀",
    "divisionId": "div-plan",
    "headName": "최광효",
    "headRank": "실장"
  },
  {
    "id": "team-div-plan-재경팀",
    "name": "재경팀",
    "divisionId": "div-plan",
    "headName": "김희천",
    "headRank": "팀장"
  },
  {
    "id": "team-div-plan-사업관리팀",
    "name": "사업관리팀",
    "divisionId": "div-plan",
    "headName": "최준우",
    "headRank": "팀장"
  },
  {
    "id": "team-div-os-해외영업팀",
    "name": "해외영업팀",
    "divisionId": "div-os",
    "headName": "김성훈",
    "headRank": "실장"
  },
  {
    "id": "team-div-os-해외디자인팀",
    "name": "해외디자인팀",
    "divisionId": "div-os",
    "headName": "이한솔",
    "headRank": "팀장"
  },
  {
    "id": "team-div-ex-전시디자인1팀",
    "name": "전시디자인1팀",
    "divisionId": "div-ex",
    "headName": "이수연",
    "headRank": "팀장"
  },
  {
    "id": "team-div-ex-전시디자인2팀",
    "name": "전시디자인2팀",
    "divisionId": "div-ex",
    "headName": "박병준",
    "headRank": "팀장"
  },
  {
    "id": "team-div-ex-전시컨설팅팀",
    "name": "전시컨설팅팀",
    "divisionId": "div-ex",
    "headName": "정우중",
    "headRank": "팀장"
  },
  {
    "id": "team-div-ex-cx디자인팀",
    "name": "CX디자인팀",
    "divisionId": "div-ex",
    "headName": "남영라",
    "headRank": "팀장"
  },
  {
    "id": "team-div-ex-제작연출팀",
    "name": "제작연출팀",
    "divisionId": "div-ex",
    "headName": "강경묵",
    "headRank": "팀장"
  },
  {
    "id": "team-div-in-인테리어디자인팀",
    "name": "인테리어디자인팀",
    "divisionId": "div-in",
    "headName": "이세나",
    "headRank": "팀장"
  },
  {
    "id": "team-div-in-사업1팀",
    "name": "사업1팀",
    "divisionId": "div-in",
    "headName": "최윤영",
    "headRank": "팀장"
  },
  {
    "id": "team-div-in-사업2팀",
    "name": "사업2팀",
    "divisionId": "div-in"
  },
  {
    "id": "team-div-in-사업3팀",
    "name": "사업3팀",
    "divisionId": "div-in",
    "headName": "박명호",
    "headRank": "팀장"
  },
  {
    "id": "team-div-nm-문화기술연구소",
    "name": "문화기술연구소",
    "divisionId": "div-nm",
    "headName": "최정환",
    "headRank": "실장"
  },
  {
    "id": "team-div-nm-스튜디오스페이스타임",
    "name": "스튜디오스페이스타임",
    "divisionId": "div-nm",
    "headName": "박태하",
    "headRank": "팀장"
  }
];

export const PHONE_DIRECTORY_EMPLOYEES: Employee[] = [
  {
    "id": "emp-구본영-경영지원팀",
    "name": "구본영",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김미소-경영지원팀",
    "name": "김미소",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김빛나-경영지원팀",
    "name": "김빛나",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-남경우-경영지원팀",
    "name": "남경우",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "본부장",
    "accessRole": "본부장"
  },
  {
    "id": "emp-손다빈-경영지원팀",
    "name": "손다빈",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-전영식-경영지원팀",
    "name": "전영식",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-최광효-경영지원팀",
    "name": "최광효",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-최석환-경영지원팀",
    "name": "최석환",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-최윤선-경영지원팀",
    "name": "최윤선",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-한용철-경영지원팀",
    "name": "한용철",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-경영지원팀",
    "teamName": "경영지원팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-박규태-사업관리팀",
    "name": "박규태",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-박대민-사업관리팀",
    "name": "박대민",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "부회장",
    "accessRole": "경영진"
  },
  {
    "id": "emp-박미란-사업관리팀",
    "name": "박미란",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-박정현-사업관리팀",
    "name": "박정현",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-박주연-사업관리팀",
    "name": "박주연",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-박진우-사업관리팀",
    "name": "박진우",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-서석민-사업관리팀",
    "name": "서석민",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "개발관리자",
    "accessRole": "개발자"
  },
  {
    "id": "emp-윤다연-사업관리팀",
    "name": "윤다연",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-윤보라-사업관리팀",
    "name": "윤보라",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-이우택-사업관리팀",
    "name": "이우택",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-지상민-사업관리팀",
    "name": "지상민",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-최준우-사업관리팀",
    "name": "최준우",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-하윤성-사업관리팀",
    "name": "하윤성",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-사업관리팀",
    "teamName": "사업관리팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-김희천-재경팀",
    "name": "김희천",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-재경팀",
    "teamName": "재경팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-윤상운-재경팀",
    "name": "윤상운",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-재경팀",
    "teamName": "재경팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-장현형-재경팀",
    "name": "장현형",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-재경팀",
    "teamName": "재경팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-정유진-재경팀",
    "name": "정유진",
    "divisionId": "div-plan",
    "divisionName": "경영기획본부",
    "teamId": "team-div-plan-재경팀",
    "teamName": "재경팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-고재만-문화기술연구소",
    "name": "고재만",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-문효정-문화기술연구소",
    "name": "문효정",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-서문현-문화기술연구소",
    "name": "서문현",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-신강준-문화기술연구소",
    "name": "신강준",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "사업실장",
    "accessRole": "본부장"
  },
  {
    "id": "emp-안소영-문화기술연구소",
    "name": "안소영",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-양성준-문화기술연구소",
    "name": "양성준",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-오윤택-문화기술연구소",
    "name": "오윤택",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이기명-문화기술연구소",
    "name": "이기명",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-장민호-문화기술연구소",
    "name": "장민호",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-정동영-문화기술연구소",
    "name": "정동영",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-최정환-문화기술연구소",
    "name": "최정환",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-한인애-문화기술연구소",
    "name": "한인애",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-문화기술연구소",
    "teamName": "문화기술연구소",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-강소영-스튜디오스페이스타임",
    "name": "강소영",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김민지-스튜디오스페이스타임",
    "name": "김민지",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김정훈-스튜디오스페이스타임",
    "name": "김정훈",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김준호-스튜디오스페이스타임",
    "name": "김준호",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김현정-스튜디오스페이스타임",
    "name": "김현정",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김희주-스튜디오스페이스타임",
    "name": "김희주",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-노영경-스튜디오스페이스타임",
    "name": "노영경",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-박태하-스튜디오스페이스타임",
    "name": "박태하",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-양희태-스튜디오스페이스타임",
    "name": "양희태",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-유정금-스튜디오스페이스타임",
    "name": "유정금",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이범석-스튜디오스페이스타임",
    "name": "이범석",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이정현-스튜디오스페이스타임",
    "name": "이정현",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-전소민-스튜디오스페이스타임",
    "name": "전소민",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-정나리-스튜디오스페이스타임",
    "name": "정나리",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-정소라-스튜디오스페이스타임",
    "name": "정소라",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-정은진-스튜디오스페이스타임",
    "name": "정은진",
    "divisionId": "div-nm",
    "divisionName": "뉴미디어사업실",
    "teamId": "team-div-nm-스튜디오스페이스타임",
    "teamName": "스튜디오스페이스타임",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-문준성-사업1팀",
    "name": "문준성",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-성보강-사업1팀",
    "name": "성보강",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-안제욱-사업1팀",
    "name": "안제욱",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-유승환-사업1팀",
    "name": "유승환",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-유엄종-사업1팀",
    "name": "유엄종",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-이동순-사업1팀",
    "name": "이동순",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-최윤영-사업1팀",
    "name": "최윤영",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-최현서-사업1팀",
    "name": "최현서",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-황민환-사업1팀",
    "name": "황민환",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업1팀",
    "teamName": "사업1팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-강민규-사업2팀",
    "name": "강민규",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-김동해-사업2팀",
    "name": "김동해",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김성구-사업2팀",
    "name": "김성구",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-손현정-사업2팀",
    "name": "손현정",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-윤성환-사업2팀",
    "name": "윤성환",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-이상윤-사업2팀",
    "name": "이상윤",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-제량규-사업2팀",
    "name": "제량규",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-허지영-사업2팀",
    "name": "허지영",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-황정욱-사업2팀",
    "name": "황정욱",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업2팀",
    "teamName": "사업2팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김학연-사업3팀",
    "name": "김학연",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업3팀",
    "teamName": "사업3팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-박명호-사업3팀",
    "name": "박명호",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업3팀",
    "teamName": "사업3팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-임균택-사업3팀",
    "name": "임균택",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업3팀",
    "teamName": "사업3팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-전대경-사업3팀",
    "name": "전대경",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업3팀",
    "teamName": "사업3팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-전영일-사업3팀",
    "name": "전영일",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-사업3팀",
    "teamName": "사업3팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-고빛남-인테리어디자인팀",
    "name": "고빛남",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김소영2-인테리어디자인팀",
    "name": "김소영2",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김종현-인테리어디자인팀",
    "name": "김종현",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김한희-인테리어디자인팀",
    "name": "김한희",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-노희태-인테리어디자인팀",
    "name": "노희태",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-박예진-인테리어디자인팀",
    "name": "박예진",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-송서희-인테리어디자인팀",
    "name": "송서희",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-신상면-인테리어디자인팀",
    "name": "신상면",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "상무",
    "accessRole": "경영진"
  },
  {
    "id": "emp-신주현-인테리어디자인팀",
    "name": "신주현",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이세나-인테리어디자인팀",
    "name": "이세나",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-이용석-인테리어디자인팀",
    "name": "이용석",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "본부장",
    "accessRole": "본부장"
  },
  {
    "id": "emp-조해영-인테리어디자인팀",
    "name": "조해영",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-최도일-인테리어디자인팀",
    "name": "최도일",
    "divisionId": "div-in",
    "divisionName": "인테리어사업본부",
    "teamId": "team-div-in-인테리어디자인팀",
    "teamName": "인테리어디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김빛나-임원실",
    "name": "김빛나",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김성훈-임원실",
    "name": "김성훈",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-김승태-임원실",
    "name": "김승태",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "부회장",
    "accessRole": "경영진"
  },
  {
    "id": "emp-남경우-임원실",
    "name": "남경우",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "부사장",
    "accessRole": "경영진"
  },
  {
    "id": "emp-박기석-임원실",
    "name": "박기석",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "회장",
    "accessRole": "경영진"
  },
  {
    "id": "emp-박대민-임원실",
    "name": "박대민",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "부회장",
    "accessRole": "경영진"
  },
  {
    "id": "emp-신강준-임원실",
    "name": "신강준",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "전무",
    "accessRole": "경영진"
  },
  {
    "id": "emp-신상면-임원실",
    "name": "신상면",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "상무",
    "accessRole": "경영진"
  },
  {
    "id": "emp-이동헌-임원실",
    "name": "이동헌",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "감사",
    "accessRole": "경영진"
  },
  {
    "id": "emp-이용석-임원실",
    "name": "이용석",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "부사장",
    "accessRole": "경영진"
  },
  {
    "id": "emp-정우중-임원실",
    "name": "정우중",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "상무보",
    "accessRole": "경영진"
  },
  {
    "id": "emp-정형철-임원실",
    "name": "정형철",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "상무",
    "accessRole": "경영진"
  },
  {
    "id": "emp-차중호-임원실",
    "name": "차중호",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "전무",
    "accessRole": "경영진"
  },
  {
    "id": "emp-최광효-임원실",
    "name": "최광효",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "상무보",
    "accessRole": "경영진"
  },
  {
    "id": "emp-최준우-임원실",
    "name": "최준우",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-하윤성-임원실",
    "name": "하윤성",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-한용철-임원실",
    "name": "한용철",
    "divisionId": "div-exec",
    "divisionName": "임원실",
    "teamId": "team-div-exec-임원실",
    "teamName": "임원실",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-방효선-전시디자인1팀",
    "name": "방효선",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인1팀",
    "teamName": "전시디자인1팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-신혜진-전시디자인1팀",
    "name": "신혜진",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인1팀",
    "teamName": "전시디자인1팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-이수연-전시디자인1팀",
    "name": "이수연",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인1팀",
    "teamName": "전시디자인1팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-이옥희-전시디자인1팀",
    "name": "이옥희",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인1팀",
    "teamName": "전시디자인1팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-차중호-전시디자인1팀",
    "name": "차중호",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인1팀",
    "teamName": "전시디자인1팀",
    "role": "본부장",
    "accessRole": "본부장"
  },
  {
    "id": "emp-곽우희-전시디자인2팀",
    "name": "곽우희",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-노양미-전시디자인2팀",
    "name": "노양미",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-박병준-전시디자인2팀",
    "name": "박병준",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-박연진-전시디자인2팀",
    "name": "박연진",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-안재선-전시디자인2팀",
    "name": "안재선",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-정푸른-전시디자인2팀",
    "name": "정푸른",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-최광식-전시디자인2팀",
    "name": "최광식",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시디자인2팀",
    "teamName": "전시디자인2팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-강양미-전시컨설팅팀",
    "name": "강양미",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김대현-전시컨설팅팀",
    "name": "김대현",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김은정-전시컨설팅팀",
    "name": "김은정",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-방화열-전시컨설팅팀",
    "name": "방화열",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-양정원-전시컨설팅팀",
    "name": "양정원",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-정우중-전시컨설팅팀",
    "name": "정우중",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-최민석-전시컨설팅팀",
    "name": "최민석",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-한나라-전시컨설팅팀",
    "name": "한나라",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-한민지-전시컨설팅팀",
    "name": "한민지",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-한지명-전시컨설팅팀",
    "name": "한지명",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-전시컨설팅팀",
    "teamName": "전시컨설팅팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-강경묵-제작연출팀",
    "name": "강경묵",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-김영진-제작연출팀",
    "name": "김영진",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김종호-제작연출팀",
    "name": "김종호",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김현주-제작연출팀",
    "name": "김현주",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-문기철-제작연출팀",
    "name": "문기철",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-신진우-제작연출팀",
    "name": "신진우",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-이찬식-제작연출팀",
    "name": "이찬식",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-이호직-제작연출팀",
    "name": "이호직",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-제작연출팀",
    "teamName": "제작연출팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-고동우-cx디자인팀",
    "name": "고동우",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-cx디자인팀",
    "teamName": "CX디자인팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-남영라-cx디자인팀",
    "name": "남영라",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-cx디자인팀",
    "teamName": "CX디자인팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-이재영-cx디자인팀",
    "name": "이재영",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-cx디자인팀",
    "teamName": "CX디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이태림-cx디자인팀",
    "name": "이태림",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-cx디자인팀",
    "teamName": "CX디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이혜린-cx디자인팀",
    "name": "이혜린",
    "divisionId": "div-ex",
    "divisionName": "전시사업본부",
    "teamId": "team-div-ex-cx디자인팀",
    "teamName": "CX디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김건주-해외디자인팀",
    "name": "김건주",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-김소영-해외디자인팀",
    "name": "김소영",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-박민정-해외디자인팀",
    "name": "박민정",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-유지영-해외디자인팀",
    "name": "유지영",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이의곤-해외디자인팀",
    "name": "이의곤",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이정민-해외디자인팀",
    "name": "이정민",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이한나-해외디자인팀",
    "name": "이한나",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-이한솔-해외디자인팀",
    "name": "이한솔",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-장소희-해외디자인팀",
    "name": "장소희",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-파밀라-해외디자인팀",
    "name": "파밀라",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외디자인팀",
    "teamName": "해외디자인팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-강준석-해외영업팀",
    "name": "강준석",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "팀장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-강한빛-해외영업팀",
    "name": "강한빛",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "책임",
    "accessRole": "직원"
  },
  {
    "id": "emp-고길미-해외영업팀",
    "name": "고길미",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-김규린-해외영업팀",
    "name": "김규린",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "사원",
    "accessRole": "직원"
  },
  {
    "id": "emp-김성훈-해외영업팀",
    "name": "김성훈",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "실장",
    "accessRole": "팀장"
  },
  {
    "id": "emp-김영지-해외영업팀",
    "name": "김영지",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "선임",
    "accessRole": "직원"
  },
  {
    "id": "emp-나디아-해외영업팀",
    "name": "나디아",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "인턴",
    "accessRole": "직원"
  },
  {
    "id": "emp-박상준-해외영업팀",
    "name": "박상준",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-선우승진-해외영업팀",
    "name": "선우승진",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "수석",
    "accessRole": "직원"
  },
  {
    "id": "emp-정형철-해외영업팀",
    "name": "정형철",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "사업실장",
    "accessRole": "본부장"
  },
  {
    "id": "emp-조가영-해외영업팀",
    "name": "조가영",
    "divisionId": "div-os",
    "divisionName": "해외사업실",
    "teamId": "team-div-os-해외영업팀",
    "teamName": "해외영업팀",
    "role": "선임",
    "accessRole": "직원"
  }
];
