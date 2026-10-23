"""Play the shipped room game in mobile Chromium against a temporary HTTP server."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
import re
import traceback
from pathlib import Path
from threading import Thread

from playwright.sync_api import expect, sync_playwright


OBJECTS = ('controller', 'tea', 'cat', 'mushroom', 'stars')
MOTIONS = {'controller': 'game', 'tea': 'tea', 'cat': 'pet', 'mushroom': 'sit', 'stars': 'light'}
CURRENT_CASE = 'startup'
CURRENT_STEP = 'initialization'
VIEWPORTS = (
    (320, 568),
    (390, 844),
    (412, 915),
    (360, 780),
    (768, 900),
    (1024, 1366),
)


def step(name):
    global CURRENT_STEP
    CURRENT_STEP = name
    print(f'CHECK {CURRENT_CASE}: {name}', flush=True)


def annotate_failure():
    # GitHub renders these annotations in the public run summary even when
    # detailed job logs are unavailable. Never swallow the original exception.
    message = f'{CURRENT_CASE} / {CURRENT_STEP}\n{traceback.format_exc()}'
    escaped = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error file=scripts/smoke_test.py,title=Browser smoke test failed::{escaped}', flush=True)


def prepare_page(context, errors, cpu_throttle):
    page = context.new_page()
    page.set_default_timeout(10_000)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed', lambda request: errors.append(request.url))
    page.on('response', lambda response: errors.append(f'{response.status} {response.url}') if response.status >= 400 else None)
    if cpu_throttle > 1:
        session = context.new_cdp_session(page)
        session.send('Emulation.setCPUThrottlingRate', {'rate': cpu_throttle})
    return page


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def filled_hearts(page):
    return page.locator('#hearts .is-filled')


def wait_ready(page):
    expect(page.locator('#game-screen')).to_have_attribute('data-phase', 'playing', timeout=10_000)


def assert_layout(page):
    # Mobile emulation updates innerHeight before dynamic viewport units and
    # media-query layout have reached the next frame. Wait for actual geometry.
    page.wait_for_function('''(size) => {
        if (innerWidth !== size.width || innerHeight !== size.height) return false;
        return ['#scene-viewport', '#dialogue-text', '#hint-button'].every(selector => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top >= -1 && rect.bottom <= size.height + 1;
        });
    }''', arg=page.viewport_size, timeout=5000)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Page overflows horizontally'
    height = page.viewport_size['height']
    for selector in ('#scene-viewport', '#dialogue-text', '#hint-button'):
        box = page.locator(selector).bounding_box()
        assert box is not None and box['width'] > 0 and box['height'] > 0, selector
        assert box['y'] >= -1 and box['y'] + box['height'] <= height + 1, (selector, box, height)


def assert_images_loaded(page):
    page.wait_for_function("""() => [...document.images].every(image => image.complete && image.naturalWidth > 0)""")


def choose_character(page, character, touch=True):
    expect(page.locator('#character-screen')).to_be_visible()
    choice = page.locator(f'#character-screen button[data-character="{character}"]')
    choice.tap() if touch else choice.click()
    expect(page.locator('#game-screen')).to_be_visible()
    expect(page.locator('#character-screen')).to_be_hidden()
    expect(page.locator('#player')).to_have_attribute('data-character', character)
    wait_ready(page)
    expect(filled_hearts(page)).to_have_count(0)
    assert_layout(page)


def tap_object(page, object_id):
    target = page.locator(f'[data-object="{object_id}"]')
    target.scroll_into_view_if_needed()
    target.tap()


def touch_drag(context, page):
    """Use trusted touch input so a room drag cannot accidentally solve a quest."""
    viewport = page.locator('#scene-viewport')
    box = viewport.bounding_box()
    x = box['x'] + box['width'] * .55
    start_y = box['y'] + box['height'] * .75
    end_y = box['y'] + box['height'] * .25
    session = context.new_cdp_session(page)
    try:
        session.send('Input.dispatchTouchEvent', {
            'type': 'touchStart', 'touchPoints': [{'x': x, 'y': start_y, 'id': 1}],
        })
        for step in range(1, 7):
            session.send('Input.dispatchTouchEvent', {
                'type': 'touchMove',
                'touchPoints': [{'x': x, 'y': start_y + (end_y - start_y) * step / 6, 'id': 1}],
            })
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    finally:
        session.detach()


def touch_pinch(context, page):
    box = page.locator('#scene-viewport').bounding_box()
    center_x, center_y = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    session = context.new_cdp_session(page)
    def points(distance):
        return [{'x': center_x - distance, 'y': center_y, 'id': 1},
                {'x': center_x + distance, 'y': center_y, 'id': 2}]
    try:
        session.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': points(30)})
        for distance in (34, 38, 42, 46, 50):
            session.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': points(distance)})
        session.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    finally:
        session.detach()


def check_zoom_and_pan(context, page):
    world = page.locator('#scene-world')
    initial_width = world.bounding_box()['width']
    page.locator('#zoom-in').tap()
    page.wait_for_function('(width) => document.querySelector("#scene-world").getBoundingClientRect().width > width + 1', arg=initial_width)
    enlarged_width = world.bounding_box()['width']
    # Pinch input must resize the room without becoming a click.
    touch_pinch(context, page)
    page.wait_for_function('(width) => document.querySelector("#scene-world").getBoundingClientRect().width > width + 1', arg=enlarged_width)
    viewport = page.locator('#scene-viewport')
    viewport.evaluate('(element) => { element.scrollTop = 0; element.scrollLeft = 0; }')
    touch_drag(context, page)
    page.wait_for_function('() => document.querySelector("#scene-viewport").scrollTop > 5')
    expect(filled_hearts(page)).to_have_count(0)
    wait_ready(page)
    page.locator('#zoom-out').tap()
    page.locator('#zoom-reset').tap()
    page.wait_for_function('(width) => Math.abs(document.querySelector("#scene-world").getBoundingClientRect().width - width) < 2', arg=initial_width)
    assert enlarged_width > initial_width
    assert_layout(page)


def assert_pose(page, actor_id, motion, animated=False):
    step(f'{actor_id} pose {motion}' + (' animated frames' if animated else ''))
    actor = page.locator(f'#{actor_id}')
    expect(actor).to_have_attribute('data-motion', motion)
    expect(actor.locator('.actor-motion')).to_be_visible()
    assert actor.locator('.actor-motion').evaluate(
        '(element) => getComputedStyle(element).backgroundImage !== "none"'
    ), f'{actor_id}: no pose artwork'
    frame = actor.get_attribute('data-frame')
    assert frame is not None and 0 <= int(frame) <= 15, (actor_id, frame)
    if animated:
        # A pose name alone must not pass when the actual frame never changes.
        page.wait_for_function("""(expected) => {
            const actor = document.getElementById(expected.id);
            return actor.dataset.motion === expected.motion && actor.dataset.frame !== expected.frame;
        }""", arg={'id': actor_id, 'motion': motion, 'frame': frame}, timeout=1500)


def observe_interaction(page, object_id, hearts_before, normal_motion=False):
    step(f'{object_id}: wait for joint arrival and action start, hearts={hearts_before}')
    game = page.locator('#game-screen')
    expect(game).to_have_attribute('data-phase', 'reacting', timeout=12_000)
    expect(game).to_have_attribute('data-interaction', object_id)
    expect(filled_hearts(page)).to_have_count(hearts_before)
    expect(page.locator('#player')).to_have_attribute('data-moving', 'false')
    expected_motion = MOTIONS[object_id]
    assert_pose(page, 'player', expected_motion, animated=normal_motion)
    if object_id in ('controller', 'tea'):
        expect(page.locator('#partner')).to_have_attribute('data-moving', 'false')
        assert_pose(page, 'partner', expected_motion, animated=normal_motion)
        characters = page.locator('#actors .actor').evaluate_all(
            '(actors) => actors.map(actor => actor.dataset.character).sort()'
        )
        assert characters == ['boy', 'girl'], characters
    else:
        expect(page.locator('#partner')).to_have_attribute('data-motion', 'idle')
    if normal_motion and object_id == 'controller':
        step('controller: reject repeated and unrelated activation during action')
        # Repeated activation or another target during a shared action must not
        # queue a second reward or interrupt one actor while the other continues.
        page.locator('[data-object="controller"]').press('Enter')
        page.locator('[data-object="cat"]').press('Enter')
        expect(game).to_have_attribute('data-phase', 'reacting')
        expect(game).to_have_attribute('data-interaction', 'controller')
        expect(page.locator('#player')).to_have_attribute('data-motion', 'game')
        expect(page.locator('#partner')).to_have_attribute('data-motion', 'game')
    # Both characters' motions must finish before granting the single reward.
    expect(filled_hearts(page)).to_have_count(hearts_before)


def check_game(context, page, width, height, character, normal_motion):
    step(f'choose {character}, load artwork, inspect layout')
    choose_character(page, character)
    assert_images_loaded(page)
    step('zoom buttons, touch pinch and pan')
    check_zoom_and_pan(context, page)

    step('sound toggle')
    sound = page.locator('#sound-button')
    sound.tap()
    expect(sound).to_have_attribute('aria-pressed', 'true')
    sound.tap()
    expect(sound).to_have_attribute('aria-pressed', 'false')

    # The cat is deliberately wrong for the first request; movement is allowed,
    # but the request and every heart must remain unchanged.
    step('wrong target: cat while controller requested')
    first_request = page.locator('#dialogue-text').inner_text()
    initial_position = page.locator('#player').evaluate('(element) => [element.offsetLeft, element.offsetTop]')
    tap_object(page, 'cat')
    if normal_motion:
        expect(page.locator('#player')).to_have_attribute('data-moving', 'true')
        assert_pose(page, 'player', 'walk', animated=True)
        expect(filled_hearts(page)).to_have_count(0)
        page.wait_for_function('''(position) => {
            const player = document.querySelector('#player');
            return Math.abs(player.offsetLeft - position[0]) + Math.abs(player.offsetTop - position[1]) > 3;
        }''', arg=initial_position)
    wait_ready(page)
    expect(filled_hearts(page)).to_have_count(0)
    expect(page.locator('#ending-screen')).to_be_hidden()

    step('hint for controller')
    page.locator('#hint-button').tap()
    expect(page.locator('#scene-world')).to_have_attribute('data-hint', 'controller')
    expect(page.locator('#hint-glow')).to_have_class(re.compile(r'\bis-visible\b'))

    for index, object_id in enumerate(OBJECTS):
        step(f'{object_id}: tap object')
        tap_object(page, object_id)
        observe_interaction(page, object_id, index, normal_motion)
        step(f'{object_id}: finish action and grant heart {index + 1}')
        expect(filled_hearts(page)).to_have_count(index + 1, timeout=12_000)
        if index < 4:
            wait_ready(page)
            expect(page.locator('#dialogue-text')).not_to_have_text(first_request)
            expect(page.locator('#player')).to_have_attribute('data-motion', 'idle')
            expect(page.locator('#partner')).to_have_attribute('data-motion', 'idle')
        else:
            expect(page.locator('#ending-screen')).to_be_visible(timeout=10_000)
            expect(page.locator('#game-screen')).to_have_attribute('data-phase', 'ending')
        if (width, height) == (360, 780) and index == 1:
            step('unfold to 768x900 with progress intact')
            page.set_viewport_size({'width': 768, 'height': 900})
            assert_layout(page)
            expect(filled_hearts(page)).to_have_count(2)
        if index == 3:
            step('rotate to 844x390 with progress intact')
            page.set_viewport_size({'width': 844, 'height': 390})
            assert_layout(page)
            expect(filled_hearts(page)).to_have_count(4)
    step('ending and replay as the other character')
    expect(page.locator('#ending-screen')).to_contain_text(re.compile(r'오늘도.*포근한 밤'))
    page.locator('#replay-button').tap()
    choose_character(page, 'girl' if character == 'boy' else 'boy')
    expect(page.locator('#ending-screen')).to_be_hidden()
    expect(filled_hearts(page)).to_have_count(0)
    tap_object(page, 'controller')
    expect(filled_hearts(page)).to_have_count(1, timeout=12_000)
    wait_ready(page)
    page.locator('#change-character').tap()
    expect(page.locator('#character-screen')).to_be_visible()
    print(f'PASS {width}x{height}: walking poses, shared tea/game, pet/sit/light motions, delayed hearts, hint, pinch/pan, rotation, ending, replay')


def check_desktop(page):
    step('mouse movement and redirect cancellation')
    choose_character(page, 'boy', touch=False)
    assert_images_loaded(page)
    controller = page.locator('[data-object="controller"]')
    controller.click()
    expect(page.locator('#player')).to_have_attribute('data-moving', 'true')
    expect(filled_hearts(page)).to_have_count(0)
    # A new destination cancels the first walk, including its deferred reward.
    page.locator('[data-object="cat"]').click()
    wait_ready(page)
    expect(filled_hearts(page)).to_have_count(0)

    step('restart while companion walks to shared activity')
    # Restart while the companion is joining the shared activity. Its arrival
    # must not start an interaction in the next playthrough.
    controller.click()
    expect(page.locator('#partner')).to_have_attribute('data-moving', 'true', timeout=10_000)
    expect(filled_hearts(page)).to_have_count(0)
    page.locator('#change-character').click()
    choose_character(page, 'girl', touch=False)
    page.clock.install()
    page.clock.fast_forward(30_000)
    for actor_id in ('player', 'partner'):
        expect(page.locator(f'#{actor_id}')).to_have_attribute('data-motion', 'idle')
        expect(page.locator(f'#{actor_id}')).to_have_attribute('data-moving', 'false')
    expect(filled_hearts(page)).to_have_count(0)
    wait_ready(page)

    step('keyboard controller interaction')
    controller.focus()
    controller.press('Enter')
    observe_interaction(page, 'controller', 0)
    expect(filled_hearts(page)).to_have_count(1, timeout=12_000)
    wait_ready(page)
    page.locator('[data-object="tea"]').click()
    observe_interaction(page, 'tea', 1)
    step('restart during shared tea action, then advance clock')
    # Restart after both are already drinking, before either can earn a heart.
    page.locator('#change-character').click()
    choose_character(page, 'boy', touch=False)
    new_request = page.locator('#dialogue-text').inner_text()
    new_positions = page.locator('#actors .actor').evaluate_all(
        '(actors) => actors.map(actor => [actor.offsetLeft, actor.offsetTop])'
    )
    page.clock.fast_forward(30_000)
    expect(filled_hearts(page)).to_have_count(0)
    for actor_id in ('player', 'partner'):
        expect(page.locator(f'#{actor_id}')).to_have_attribute('data-motion', 'idle')
        expect(page.locator(f'#{actor_id}')).to_have_attribute('data-moving', 'false')
    expect(page.locator('#dialogue-text')).to_have_text(new_request)
    assert page.locator('#actors .actor').evaluate_all(
        '(actors) => actors.map(actor => [actor.offsetLeft, actor.offsetTop])'
    ) == new_positions
    wait_ready(page)
    print('PASS 1280x900 desktop: mouse redirect, companion staging cancellation, keyboard interaction, restart during shared motion')


def check_site(directory, cpu_throttle=1):
    global CURRENT_CASE
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(directory)))
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    errors = []
    url = f'http://127.0.0.1:{server.server_port}/'
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE'), headless=True,
            )
            try:
                for index, (width, height) in enumerate(VIEWPORTS):
                    with browser.new_context(
                        viewport={'width': width, 'height': height}, is_mobile=True,
                        has_touch=True, locale='ko-KR',
                        reduced_motion='no-preference' if index == 0 else 'reduce',
                    ) as context:
                        CURRENT_CASE = f'{width}x{height} touch, motion={"normal" if index == 0 else "reduced"}'
                        step('page navigation')
                        page = prepare_page(context, errors, cpu_throttle)
                        assert page.goto(url).status == 200
                        check_game(context, page, width, height, 'boy' if index % 2 == 0 else 'girl', index == 0)
                with browser.new_context(viewport={'width': 1280, 'height': 900}, locale='ko-KR') as context:
                    CURRENT_CASE = '1280x900 desktop'
                    step('page navigation')
                    page = prepare_page(context, errors, cpu_throttle)
                    assert page.goto(url).status == 200
                    check_desktop(page)
                assert not errors, errors
                print(f'PASS: {len(VIEWPORTS)} touch viewports + desktop, no browser errors, missing assets or failed requests')
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--cpu-throttle', type=float, default=1, help='Chromium CPU slowdown factor for reproducing CI timing failures (at least 1)')
    args = parser.parse_args()
    if args.cpu_throttle < 1:
        parser.error('--cpu-throttle must be at least 1')
    directory = args.site.resolve()
    try:
        assert (directory / 'index.html').is_file(), f'No index.html in {directory}'
        check_site(directory, args.cpu_throttle)
    except Exception:
        annotate_failure()
        raise
