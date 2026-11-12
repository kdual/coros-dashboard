# COROS 한국어 러닝 대시보드

러닝 거리, 페이스, 훈련 부하, 수면과 회복을 확인하는 개인용 대시보드입니다. 데스크톱은 왼쪽 메뉴, 모바일은 하단 메뉴를 사용합니다. 라이트·다크·시스템 테마를 지원합니다.

## 지금 열기

- [GitHub Pages 예시 대시보드](https://kdual.github.io/coros-dashboard/)에서는 합성 기록을 사용합니다. 화면 위에 **예시 데이터**가 표시됩니다.
- 이 작업의 로컬 결과 폴더는 빌드를 포함합니다. Windows에서 **start-dashboard.cmd**를 실행하고 [개인 대시보드](http://127.0.0.1:4178/)에 접속한 뒤 터미널의 실행 비밀번호를 입력하세요. 작업과 같은 컴퓨터·Windows 사용자라면 준비된 COROS 기록을 읽습니다.
- GitHub에서 새로 내려받은 소스는 아래 명령으로 빌드합니다. Node.js 24 LTS를 권장합니다.

```sh
npm ci
npm run build
node server/start.mjs
```

예시 데이터를 개발 모드로 열려면 `npm run dev`를 실행합니다. 공개 모드와 개인 모드는 같은 UI를 사용합니다. 개인 서버는 이 컴퓨터의 루프백에서만 접근할 수 있습니다. 모바일 기기에서 Pages를 열면 예시 화면이 나옵니다.

## 화면

| 메뉴 | 제공 기능 |
| --- | --- |
| 대시보드 | 이번 주 거리, 선택 기간 페이스·부하, 최근 회복·수면 점수·HRV, 시간대별 수면 단계, 주간 캘린더·목표, 최근 러닝 |
| 운동 기록 | 기간·날짜·유형·검색·정렬, 랩, 기록 비교, GPS 좌표 기반 경로, 페이스·심박·케이던스 시계열 |
| 훈련 분석 | 거리의 주·월·연 집계, 세션 부하, COROS 단기·장기 부하, VO₂max·역치 페이스·훈련 효과·심박 구간·예측 기록, 한국어 규칙 기반 요약 |
| 건강·회복 | 7일·30일 및 공통 기간 추이, 수면 점수·지속 시간·단계별 시간 또는 비율, HRV·안정시 심박·스트레스·회복률 |
| 운동 계획 | 주·월 캘린더, 계획·완료 운동, 휴식 일정, 목표 설정, 일정 추가·상세·삭제. COROS 원본과 웹앱 계획의 출처 표시 |

수면·회복 카드는 최근 측정일을 사용합니다. 주간 거리는 한국 시간 월요일부터 기준일까지입니다. 평균 페이스는 러닝 중 거리와 시간이 모두 있는 세션의 시간 합계를 거리 합계로 나눈 값입니다. 합계와 목표 달성률, 기간 간 변화는 앱 계산이며 체력 예측값은 공급자에서 읽습니다. 회복 게이지 설명은 표시용 구간(80%, 50%)입니다. 외부 AI에 건강 데이터를 보내지 않습니다.

## 개인 기록과 갱신

1. 시계를 COROS 앱과 동기화합니다.
2. 개인 서버에 로그인하고 **데이터 관리 → COROS 자동 동기화 연결**에서 직접 OAuth를 승인합니다. 작업에 사용한 대화 커넥터와 웹앱은 각각 권한을 받습니다.
3. 실행 중인 서버는 15분 간격으로 공식 MCP를 조회합니다. 수동 새로고침도 지원합니다. 서버를 재시작하면 OAuth를 다시 승인합니다. 배포 워크플로는 운동 데이터를 조회하지 않습니다.
4. FIT 파일은 COROS 앱의 운동 내보내기에서 준비합니다. 개인 모드의 **데이터 관리 → FIT 파일 가져오기**에서 여러 파일을 선택할 수 있습니다. 브라우저에서 직접 읽으며 탭을 새로고침하면 가져온 세션이 사라집니다. 시계 원본에 쓰지 않습니다.
5. **연결 해제 및 개인 데이터 삭제**는 이 서버의 토큰·캐시·웹앱 계획을 삭제합니다. 로그아웃은 조회 세션만 종료합니다.

MCP 초기 조회 범위는 운동 최근 90일 최대 100건, 건강 최근 30일입니다. 기간 필터는 확보한 기록에 적용됩니다. 시간대별 수면 단계, 심박 구간 시간, GPS·시계열 등 원본이 없을 때는 **데이터 없음**을 표시합니다. 실제 FIT나 MCP 상세 조회에서 받은 필드만 사용합니다. 상세 FIT 제공 여부는 계정·지원 유형·호출 한도에 따라 달라집니다. 서버의 권한·저장 구조·지원 필드는 [개인 서버 설명](server/README.md)에 있습니다.

## 배포

`.github/workflows/pages.yml`은 main 푸시 또는 수동 실행에서 `npm ci`와 프로덕션 빌드를 수행하고 `dist/`만 게시합니다. 다른 계정에서 재배포할 때는 저장소의 **Settings → Pages → Build and deployment → GitHub Actions**를 선택하세요. 소스 저장소와 배포 결과에는 인증 토큰·개인 활동·위치·건강 기록이 포함되지 않습니다.

## 프로젝트 구조

```text
.github/workflows/pages.yml       GitHub Pages 빌드·배포
src/main.tsx                     내비게이션, 테마, 계정·데이터 관리
src/Dashboard.tsx                요약 카드와 주간 훈련
src/Records.tsx                  운동 검색·상세·경로·비교
src/Analytics.tsx                훈련 분석과 건강·회복
src/Plans.tsx                    캘린더·계획·목표
src/ui.tsx                       차트, 대화상자, 지표
src/components/ui/button.tsx      shadcn/ui 방식의 로컬 버튼
src/data.ts / src/api.ts          모델·합성 데이터·조회 서비스
src/fit.ts                       Garmin FIT SDK 디코더
src/style.css                    반응형 레이아웃과 테마
server/                          OAuth, MCP, 인증, Windows DPAPI 저장
start-dashboard.cmd              Windows 개인 모드 실행
```

React, Vite, TypeScript, Tailwind CSS, Recharts, Lucide, Radix UI를 사용합니다. 서버는 Node.js 루프백 서비스로 실행합니다. 외부 지도 서비스를 호출하지 않고 GPS 좌표를 로컬 지도에 그립니다.

## 검증과 범위

- TypeScript 검사·프로덕션 빌드는 `npm run build`로, 인증·출처 검증·개인 설정·연결 해제 검사는 `node server/check.mjs`로 재현할 수 있습니다. 서버 검사를 실행할 때는 개인 서버를 종료하세요.
- 웹앱이 시계 원본 계획을 수정하거나 업로드하는 기능, 상시 원격 개인 서버, 웹훅 푸시는 제공하지 않습니다. 개인 서버를 끄면 자동 조회가 멈춥니다.
- OAuth 승인 URL 생성과 개인 데이터 조회를 각각 검증했습니다. 브라우저에서 소유자가 승인한 뒤의 실토큰 갱신은 해당 계정으로 확인해야 합니다.

[COROS 공식 MCP 개발 안내](https://support.coros.com/hc/en-us/articles/53181619102996-Build-on-COROS-MCP) · [FIT 내보내기](https://support.coros.com/hc/en-us/articles/4408620041620-Manually-Import-Export-an-Activity-to-3rd-Party-Sites) · [GitHub Pages 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

