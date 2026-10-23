# 오늘도, 포근한 밤

차 한 잔, 게임 한 판, 고양이에게 인사. 보라색 방을 둘러보며 다섯 가지 부탁을 해결하는 모바일 웹게임입니다. 남자 또는 여자 캐릭터를 선택하고, 화면을 터치하면 선택한 캐릭터가 그곳으로 걸어가 물건과 상호작용합니다.

HTML, CSS, JavaScript로 동작하며 앱 설치, 별도 빌드, 백엔드 또는 API 키가 필요하지 않습니다.

## 플레이

1. 파란 잠옷의 남자 캐릭터 또는 분홍 잠옷의 여자 캐릭터를 선택합니다.
2. 화면 아래 대사를 읽고 부탁에 맞는 물건을 찾아 터치합니다. 캐릭터가 도착하면 물건의 반응과 함께 하트가 채워집니다.
3. 게임패드, 차, 고양이, 버섯 의자, 별 조명의 부탁을 모두 해결하면 엔딩을 볼 수 있습니다.

잘못 누르더라도 하트가 줄어들지 않으며 제한 시간이 없습니다. 힌트는 정답 주변을 밝혀 줍니다. 두 손가락 확대·축소 또는 확대 버튼과 화면 이동으로 작은 소품을 살펴볼 수 있으며, 효과음은 버튼으로 켜거나 끌 수 있습니다. 다시 플레이할 때 캐릭터를 새로 선택할 수 있습니다.

좁은 휴대전화, 펼친 폴더블, 태블릿과 가로 화면에 맞춰 표시됩니다. 게임 중 화면을 회전하거나 창 크기를 바꿔도 진행 중인 부탁은 유지됩니다. 브라우저 검사는 320×568, 390×844, 412×915, 360×780, 768×900, 1024×1366 및 844×390 화면 크기, 데스크톱 1280×900을 사용합니다.

## 로컬 실행

저장소 루트에서 실행합니다.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

## 개발 검증

Python 3.12와 Node.js가 필요합니다. CI는 Node.js 22를 사용하며, Node.js는 JavaScript 구문 검사에만 사용합니다.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-ci.txt
.venv/bin/python -m playwright install --with-deps chromium
node --check game.js
.venv/bin/python scripts/smoke_test.py
```

시스템 Chromium이 이미 설치되어 있다면 브라우저 다운로드 대신 저장소가 지원하는 실행 파일 설정을 사용합니다.

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium .venv/bin/python scripts/smoke_test.py
```

검사는 자체 임시 HTTP 서버를 시작·종료합니다. `--site <directory>`를 지정하면 배포할 정적 파일 묶음을 검사할 수 있습니다. 캐릭터 선택과 이동, 오답 처리, 힌트, 두 손가락 확대·화면 이동, 다섯 가지 상호작용, 엔딩·재시작, 마우스·키보드 조작, 이동 취소와 이동 중 캐릭터 변경, 화면 크기 변경 시 진행 유지, 이미지 로딩과 브라우저 오류를 확인합니다. 실제 기기의 터치감·오디오·폴더블 전환 검사는 별도로 수행합니다.

## GitHub Pages 최초 설정

1. 저장소 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
2. **Custom domain**에 `play.junununseo.com`을 입력하고 저장합니다. Actions 배포에서는 저장소의 `CNAME` 파일만으로 이 설정이 자동 적용되지 않습니다.
3. 아래 Cloudflare DNS 레코드를 추가합니다.
4. 저장소 **Actions → Test and deploy GitHub Pages**에서 성공 여부를 확인합니다. Pages 활성화 전에 첫 배포가 실패했다면 **Re-run failed jobs**로 재실행하거나 **Run workflow**로 main 배포를 실행합니다.
5. Pages에서 DNS 확인 및 인증서 발급이 끝나면 **Enforce HTTPS**를 활성화합니다. 인증서 발급에는 시간이 걸릴 수 있습니다.

GitHub Free에서는 공개 저장소를 Pages에 사용할 수 있습니다. 기존의 다른 저장소 Pages 사이트와 별도로 운영할 수 있습니다.

## Cloudflare DNS

Cloudflare에서 `junununseo.com` 도메인 → **DNS → Records → Add record**:

| 필드 | 값 |
| --- | --- |
| Type | CNAME |
| Name | play |
| Target | jha68.github.io |
| Proxy status | DNS only (회색 구름) |
| TTL | Auto |

Target에는 `https://`나 `/little_game` 경로를 넣지 않습니다. `play`에 기존 레코드가 있으면 용도를 확인한 뒤 해당 레코드를 수정하고, 같은 이름에 충돌하는 레코드를 추가하지 않습니다. 기존 메인 도메인과 다른 서브도메인의 레코드는 유지합니다.

## 자동 검사 및 배포

- `main` push: JavaScript 구문 검사 → 모바일·태블릿 Chromium 동작 검사 → GitHub Pages 배포.
- `main` 대상 pull request: 같은 검사를 실행하며 배포하지 않습니다.
- Actions의 **Run workflow**로 main에서 수동 재배포할 수도 있습니다.
- `_site`에는 `index.html`, `styles.css`, `game.js`, `CNAME`, `assets/`만 포함됩니다. 테스트 코드나 Git 파일은 공개되지 않습니다.
- 배포 인증에는 GitHub 기본 토큰과 OIDC를 사용하므로 별도 배포용 API 키가 필요하지 않습니다.
- 기존 배포 대상은 `play.junununseo.com`입니다. 로컬 게임 변경만으로 DNS나 공개 사이트가 자동 변경되지는 않습니다.
