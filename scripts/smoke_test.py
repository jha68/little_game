"""Exercise the exact static files that will be deployed, without an external server."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def assert_board_visible(page, height):
    field = page.locator('#field').bounding_box()
    assert field is not None
    assert field['y'] >= -1 and field['y'] + field['height'] <= height + 1, field
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')


def check_site(directory):
    server = ThreadingHTTPServer(
        ('127.0.0.1', 0), partial(QuietHandler, directory=str(directory))
    )
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    errors = []
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'),
                headless=True,
            )
            try:
                for width, height in [(320, 568), (390, 844), (412, 915)]:
                    with browser.new_context(
                        viewport={'width': width, 'height': height},
                        is_mobile=True, has_touch=True, locale='ko-KR',
                    ) as context:
                        page = context.new_page()
                        page.on('pageerror', lambda error: errors.append(str(error)))
                        page.on('requestfailed', lambda request: errors.append(request.url))
                        page.on('response', lambda response: errors.append(
                            f'{response.status} {response.url}'
                        ) if response.status >= 400 else None)
                        assert page.goto(url).status == 200
                        assert page.locator('.room-art').evaluate(
                            'image => image.complete && image.naturalWidth > 0'
                        )
                        assert page.locator('#star').is_hidden()
                        page.clock.install()
                        page.locator('#start').tap()
                        assert page.locator('#start').is_disabled()
                        assert page.locator('#message').is_hidden()
                        assert_board_visible(page, height)
                        for _ in range(3):
                            page.locator('#star').tap()
                        assert page.locator('#score').inner_text() == '3'
                        page.set_viewport_size({'width': 844, 'height': 390})
                        page.clock.run_for(200)
                        assert_board_visible(page, 390)
                        page.locator('#star').tap()
                        assert page.locator('#score').inner_text() == '4'
                        page.clock.fast_forward(21_000)
                        assert page.locator('#time').inner_text() == '0'
                        assert page.locator('#star').is_hidden()
                        assert page.locator('#start').is_enabled()
                        assert page.locator('#message-title').inner_text() == '오늘은 별 4개를 모았어요'
                        assert page.locator('#best').inner_text() == '4'
                        page.reload()
                        assert page.locator('#best').inner_text() == '4'
                        page.locator('#start').tap()
                        assert page.locator('#score').inner_text() == '0'
                        assert page.locator('#time').inner_text() == '20'
                        page.locator('#star').tap()
                        assert page.locator('#score').inner_text() == '1'
                        print(f'PASS {width}x{height}: touch, rotation, finish, persistence, restart')
                assert not errors, errors
                print('PASS: no browser errors, missing assets or failed requests')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    directory = args.site.resolve()
    assert (directory / 'index.html').is_file(), f'No index.html in {directory}'
    check_site(directory)
