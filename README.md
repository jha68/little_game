# 별이 머무는 방

보라색 방에서 20초 동안 별을 모으는 모바일 웹게임입니다. 앱 설치나 빌드 없이 HTML, CSS, JavaScript, SVG만으로 실행됩니다.

목표 주소: https://play.junununseo.com (DNS 및 GitHub Pages 활성화 후 사용 가능)

## 로컬 실행

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

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

- `main` push: JavaScript 구문 검사 → 모바일 Chromium 동작 검사 → GitHub Pages 배포.
- `main` 대상 pull request: 같은 검사를 실행하며 배포하지 않습니다.
- Actions의 **Run workflow**로 main에서 수동 재배포할 수도 있습니다.
- `_site`에는 `index.html`, `styles.css`, `game.js`, `CNAME`, `assets/`만 포함됩니다. 테스트 코드나 Git 파일은 공개되지 않습니다.
- 배포 인증에는 GitHub 기본 토큰과 OIDC를 사용하므로 별도 배포용 API 키가 필요하지 않습니다.

브라우저 검사 재현:

```sh
python3 -m pip install -r requirements-ci.txt
python3 -m playwright install --with-deps chromium
python3 scripts/smoke_test.py
```

설치된 Chromium을 쓰는 환경에서는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`을 지정할 수 있습니다. 모바일 검사는 터치, 화면 회전, 종료, 최고 기록 저장, 재시작을 포함하며 타이머는 브라우저의 가상 시계로 진행합니다. 실제 기기 검사는 별도로 수행합니다.
