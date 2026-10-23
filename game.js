"use strict";

(() => {
  const $ = (s) => document.querySelector(s);
  const W = 960,
    H = 1536,
    STEP = 24;
  const viewport = $("#scene-viewport"),
    canvas = $("#scene-canvas"),
    world = $("#scene-world"),
    screen = $("#game-screen");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const objects = [
    {
      id: "controller",
      name: "보라색 게임패드",
      x: 625,
      y: 640,
      w: 88,
      h: 70,
      stop: [590, 770],
      clue: "우리 게임 한 판 할까? TV 옆에 컨트롤러를 뒀는데…",
      reply: "좋아, 이번엔 내가 이길 거야!",
      bubble: "한 판 더? ✦",
      effect: "game",
    },
    {
      id: "tea",
      name: "탁자의 찻주전자",
      x: 500,
      y: 891,
      w: 100,
      h: 92,
      stop: [565, 1010],
      clue: "따뜻한 차 한 잔 더 마실까? 탁자 위 주전자에 남아 있을 거야.",
      reply: "후우… 따뜻하다. 네 잔에도 따라 줄게.",
      bubble: "따뜻한 한 잔 ♡",
      effect: "steam",
    },
    {
      id: "cat",
      name: "바구니 속 고양이",
      x: 658,
      y: 1216,
      w: 126,
      h: 106,
      stop: [575, 1255],
      clue: "바구니에서 졸고 있는 작은 친구한테도 인사해 줘.",
      reply: "골골… 우리랑 함께라서 좋은가 봐.",
      bubble: "골골… ♡",
      effect: "cat",
    },
    {
      id: "mushroom",
      name: "빨간 버섯 의자",
      x: 674,
      y: 704,
      w: 110,
      h: 102,
      stop: [700, 810],
      clue: "TV 오른쪽 빨간 버섯, 정말 앉을 수 있는 거야?",
      reply: "폭신폭신해! 다음에는 여기 앉아야겠다.",
      bubble: "내 자리 찜!",
      effect: "mushroom",
    },
    {
      id: "stars",
      name: "벽 선반의 별 조명",
      x: 593,
      y: 335,
      w: 136,
      h: 84,
      stop: [490, 745],
      clue: "높은 벽 선반의 별 두 개, 밤이 깊어지기 전에 조금 더 밝혀 줄래?",
      reply: "이제 딱 좋아. 오늘도 포근한 밤이 완성됐어.",
      bubble: "우리의 작은 별빛 ✦",
      effect: "stars",
    },
  ];
  const state = {
    character: "boy",
    quest: 0,
    phase: "choosing",
    x: 565,
    y: 1008,
    zoom: 1,
    scale: 1,
    sound: false,
    run: 0,
    movement: 0,
    timer: 0,
    hintTimer: 0,
    action: 0,
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let player, partner, audio, resizeFrame;
  const moves = new Map();
  const poses = new Map();
  let poseFrame = 0;
  const motionFrames = {
    walk: { frames: [0, 1, 2, 3], interval: 140 },
    tea: { frames: [4, 4, 5, 5, 5, 4], interval: 300 },
    game: { frames: [6, 7], interval: 250 },
    pet: { frames: [8, 9], interval: 440 },
    sit: { frames: [10, 11], interval: 580 },
    light: { frames: [12, 13], interval: 500 },
  };
  const atlases = new Map(
    ["boy", "girl"].map((character) => {
      const image = new Image();
      image.src = `assets/${character}-motions.webp`;
      return [
        character,
        image
          .decode()
          .then(() => true)
          .catch(() => false),
      ];
    }),
  );
  // Walkable floor and furniture footprints use the same coordinates as the room.
  const floor = [
    [205, 815],
    [445, 660],
    [640, 750],
    [790, 855],
    [895, 970],
    [925, 1460],
    [65, 1460],
    [65, 1000],
  ];
  const furniture = [
    [400, 867, 145, 88],
    [170, 1140, 225, 165],
    [395, 1290, 230, 130],
    [645, 1030, 135, 100],
    [605, 1175, 120, 100],
    [805, 1110, 90, 135],
    [90, 1035, 90, 85],
  ];
  function onFloor(x, y) {
    let inside = false;
    for (let i = 0, j = floor.length - 1; i < floor.length; j = i++) {
      const [xi, yi] = floor[i],
        [xj, yj] = floor[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
        inside = !inside;
    }
    return (
      inside &&
      !furniture.some(
        ([fx, fy, fw, fh]) => x > fx && x < fx + fw && y > fy && y < fy + fh,
      )
    );
  }
  const grid = new Map();
  for (let y = 660; y <= 1460; y += STEP)
    for (let x = 60; x <= 925; x += STEP) {
      if (onFloor(x, y)) grid.set(`${x},${y}`, { x, y, key: `${x},${y}` });
    }
  function nearest(point) {
    let best,
      score = Infinity;
    for (const node of grid.values()) {
      const d = dist(node, point);
      if (d < score) {
        score = d;
        best = node;
      }
    }
    return best;
  }
  function pathTo(x, y, from = state) {
    const start = nearest(from),
      goal = nearest({ x, y }),
      open = new Set([start.key]),
      previous = new Map();
    const cost = new Map([[start.key, 0]]),
      rank = new Map([[start.key, dist(start, goal)]]);
    while (open.size) {
      let key;
      for (const candidate of open)
        if (!key || rank.get(candidate) < rank.get(key)) key = candidate;
      if (key === goal.key) {
        const path = [goal];
        while (previous.has(key)) {
          key = previous.get(key);
          path.unshift(grid.get(key));
        }
        return path;
      }
      open.delete(key);
      const node = grid.get(key);
      for (const [dx, dy] of [
        [STEP, 0],
        [-STEP, 0],
        [0, STEP],
        [0, -STEP],
        [STEP, STEP],
        [-STEP, STEP],
        [STEP, -STEP],
        [-STEP, -STEP],
      ]) {
        const next = grid.get(`${node.x + dx},${node.y + dy}`);
        if (!next) continue;
        if (
          dx &&
          dy &&
          (!grid.has(`${node.x + dx},${node.y}`) ||
            !grid.has(`${node.x},${node.y + dy}`))
        )
          continue;
        const candidate = cost.get(key) + Math.hypot(dx, dy);
        if (candidate >= (cost.get(next.key) ?? Infinity)) continue;
        previous.set(next.key, key);
        cost.set(next.key, candidate);
        rank.set(next.key, candidate + dist(next, goal));
        open.add(next.key);
      }
    }
    return [start];
  }
  function phase(value) {
    state.phase = value;
    screen.dataset.phase = value;
  }
  function speak(text, short = text) {
    $("#dialogue-text").textContent = text;
    $("#speech-text").textContent = short;
    $("#speech-bubble").hidden = false;
  }
  function paintPlayer() {
    player.style.left = `${state.x}px`;
    player.style.top = `${state.y}px`;
    player.style.zIndex = Math.round(state.y);
    const poseX = parseFloat(player.style.getPropertyValue("--pose-x")) || 0;
    const poseY = parseFloat(player.style.getPropertyValue("--pose-y")) || 0;
    const height =
      player.dataset.motion === "idle"
        ? 228
        : Math.max(
            228,
            parseFloat(player.style.getPropertyValue("--frame-height")) || 228,
          );
    $("#speech-bubble").style.left = `${clamp(state.x + poseX, 170, 790)}px`;
    $("#speech-bubble").style.top = `${state.y + poseY - height - 16}px`;
  }
  function renderHearts() {
    $("#hearts").replaceChildren(
      ...objects.map((_, i) => {
        const el = document.createElement("span");
        el.className = `heart${i < state.quest ? " is-filled" : ""}`;
        el.textContent = "♥";
        el.setAttribute("aria-hidden", "true");
        return el;
      }),
    );
    $("#hearts").setAttribute(
      "aria-label",
      `따뜻한 마음 ${state.quest}개, 모두 5개`,
    );
    $("#progress-label").textContent = `${state.quest} / 5`;
  }
  function actor(character, id, x, y) {
    const el = document.createElement("div");
    el.id = id;
    el.className = "actor";
    el.dataset.character = character;
    el.dataset.moving = "false";
    el.dataset.motion = "idle";
    el.dataset.atlasReady = "false";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = Math.round(y);
    el.setAttribute("aria-hidden", "true");
    const img = new Image();
    img.src = `assets/${character}.webp`;
    img.alt = "";
    img.className = "actor-sprite";
    img.draggable = false;
    const shadow = document.createElement("span");
    shadow.className = "actor-shadow";
    const body = document.createElement("div");
    body.className = "actor-body";
    const motion = document.createElement("div");
    motion.className = "actor-motion";
    body.append(img, motion);
    el.append(shadow, body);
    atlases.get(character).then((ready) => {
      el.dataset.atlasReady = String(ready);
    });
    return el;
  }
  function position(el) {
    return { x: parseFloat(el.style.left), y: parseFloat(el.style.top) };
  }
  function place(el, x, y) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.zIndex = Math.round(y);
    if (el === player) {
      state.x = x;
      state.y = y;
      paintPlayer();
    }
  }
  function setPoseFrame(el, frame) {
    const row = Math.floor(frame / 4),
      boundaries = [0, 400, 744, 1100, 1536];
    const top = boundaries[row],
      height = boundaries[row + 1] - top;
    el.dataset.frame = String(frame);
    el.style.setProperty("--frame-x", `${((frame % 4) / 3) * 100}%`);
    el.style.setProperty("--frame-y", `${(top / (1536 - height)) * 100}%`);
    el.style.setProperty("--sheet-height", `${(1536 / height) * 100}%`);
    el.style.setProperty("--frame-height", `${(152 * height) / 256}px`);
    if (el === player) paintPlayer();
  }
  function animatePoses(now) {
    poseFrame = 0;
    for (const [el, pose] of poses) {
      const spec = motionFrames[pose.name];
      const index = reduced.matches
        ? 0
        : Math.floor((now - pose.start) / spec.interval) % spec.frames.length;
      setPoseFrame(el, spec.frames[index]);
    }
    if (poses.size && !reduced.matches)
      poseFrame = requestAnimationFrame(animatePoses);
  }
  function setMotion(el, name, start = performance.now()) {
    el.dataset.motion = name;
    el.classList.toggle("is-walking", name === "walk");
    el.dataset.moving = String(name === "walk");
    if (name === "idle") {
      poses.delete(el);
      delete el.dataset.frame;
      el.style.removeProperty("--pose-x");
      el.style.removeProperty("--pose-y");
      if (el === player) paintPlayer();
    } else {
      poses.set(el, { name, start });
      setPoseFrame(el, motionFrames[name].frames[0]);
      if (!poseFrame && !reduced.matches)
        poseFrame = requestAnimationFrame(animatePoses);
    }
  }
  function cancelMove(el) {
    const move = moves.get(el);
    if (!move) return;
    cancelAnimationFrame(move.frame);
    moves.delete(el);
    setMotion(el, "idle");
    move.resolve(false);
  }
  function moveActor(el, x, y) {
    cancelMove(el);
    const origin = position(el);
    const path = [origin, ...pathTo(x, y, origin)];
    const lengths = path.slice(1).map((point, i) => dist(path[i], point));
    const total = lengths.reduce((a, b) => a + b, 0);
    if (total < 1) return Promise.resolve(true);
    const duration = reduced.matches
      ? clamp(total, 180, 500)
      : clamp(total / 0.27, 450, 3200);
    setMotion(el, "walk");
    return new Promise((resolve) => {
      const move = { frame: 0, resolve };
      moves.set(el, move);
      let started;
      function tick(now) {
        if (moves.get(el) !== move) return;
        started ??= now;
        const progress = Math.min(1, (now - started) / duration);
        let travelled = progress * total,
          index = 0;
        while (index < lengths.length - 1 && travelled > lengths[index])
          travelled -= lengths[index++];
        const a = path[index],
          b = path[index + 1] || a;
        const fraction = lengths[index] ? travelled / lengths[index] : 1;
        // The boy atlas faces left; the girl atlas faces right.
        const facesLeft = el.dataset.character === "boy";
        if (b.x !== a.x)
          el.classList.toggle("is-facing-left", b.x < a.x !== facesLeft);
        place(el, a.x + (b.x - a.x) * fraction, a.y + (b.y - a.y) * fraction);
        if (progress < 1) move.frame = requestAnimationFrame(tick);
        else {
          moves.delete(el);
          setMotion(el, "idle");
          resolve(true);
        }
      }
      move.frame = requestAnimationFrame(tick);
    });
  }
  function hideHint() {
    clearTimeout(state.hintTimer);
    $("#hint-glow").classList.remove("is-visible");
    delete world.dataset.hint;
  }
  function clearRun() {
    state.run++;
    state.movement++;
    state.action++;
    for (const el of [...moves.keys()]) cancelMove(el);
    for (const el of [...poses.keys()]) setMotion(el, "idle");
    cancelAnimationFrame(poseFrame);
    poseFrame = 0;
    delete screen.dataset.interaction;
    delete world.dataset.action;
    clearTimeout(state.timer);
    hideHint();
    $("#effects")
      .querySelectorAll(".interaction-effect,.destination-ring")
      .forEach((el) => el.remove());
    world.classList.remove("is-complete");
  }
  function start(character) {
    clearRun();
    state.character = character;
    state.quest = 0;
    state.zoom = 1;
    state.x = character === "boy" ? 565 : 365;
    state.y = 1008;
    $("#character-screen").hidden = true;
    $("#ending-screen").hidden = true;
    screen.hidden = false;
    screen.inert = false;
    $("#actors").replaceChildren();
    player = actor(character, "player", state.x, state.y);
    partner = actor(
      character === "boy" ? "girl" : "boy",
      "partner",
      character === "boy" ? 365 : 565,
      1008,
    );
    $("#actors").append(player, partner);
    $("#dialogue-avatar").src =
      `assets/${character === "boy" ? "girl" : "boy"}.webp`;
    $("#dialogue-speaker").textContent =
      character === "boy" ? "분홍 잠옷 친구의 부탁" : "파란 잠옷 친구의 부탁";
    objects.forEach((o) =>
      $(`[data-object="${o.id}"]`).classList.remove("is-found"),
    );
    renderHearts();
    phase("playing");
    paintPlayer();
    speak(objects[0].clue, "우리 게임 한 판 할까?");
    requestAnimationFrame(() => {
      layout(false);
      viewport.scrollTo({
        left: 0,
        top:
          H * state.scale > viewport.clientHeight + 5
            ? 880 * state.scale - viewport.clientHeight / 2
            : 0,
        behavior: "instant",
      });
    });
    $("#hint-button").disabled = false;
    $("#hint-button").focus({ preventScroll: true });
  }
  function updateSound() {
    const button = $("#sound-button");
    button.setAttribute("aria-pressed", String(state.sound));
    button.setAttribute(
      "aria-label",
      state.sound ? "효과음 끄기" : "효과음 켜기",
    );
    button.title = button.getAttribute("aria-label");
    button.dataset.enabled = String(state.sound);
  }
  function sound(kind) {
    if (!state.sound) return;
    try {
      if (!audio)
        audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") void audio.resume().catch(() => {});
      const notes =
        kind === "game"
          ? [523, 659, 784, 1046]
          : kind === "cat"
            ? [330, 392]
            : [523, 659, 784];
      notes.forEach((note, i) => {
        const oscillator = audio.createOscillator(),
          gain = audio.createGain(),
          time = audio.currentTime + i * 0.11;
        oscillator.type = kind === "game" ? "triangle" : "sine";
        oscillator.frequency.value = note;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.045, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.32);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
      });
    } catch {
      state.sound = false;
      updateSound();
    }
  }
  function effect(object, ending = false) {
    const el = document.createElement("div");
    el.className = `interaction-effect effect-${object.effect}`;
    el.style.left = `${object.x}px`;
    el.style.top = `${object.y}px`;
    el.setAttribute("aria-hidden", "true");
    const symbols =
      object.effect === "steam"
        ? ["〰", "〰", "〰"]
        : object.effect === "cat" || ending
          ? ["♡", "♥", "♡"]
          : ["✧", "✦", "✧", "✦"];
    symbols.forEach((symbol, i) => {
      const p = document.createElement("span");
      p.textContent = symbol;
      p.style.setProperty("--i", i);
      el.append(p);
    });
    const caption = document.createElement("b");
    caption.textContent = object.bubble;
    el.append(caption);
    $("#effects").append(el);
    setTimeout(() => el.remove(), ending ? 7000 : 4300);
    sound(object.effect);
  }
  function finish() {
    phase("ending");
    hideHint();
    world.classList.add("is-complete");
    $("#hint-button").disabled = true;
    speak("오늘도 포근한 밤이 완성됐어요.", "함께라서 더 포근한 밤 ♡");
    effect({ x: state.x, y: state.y - 180, effect: "cat", bubble: "♡" }, true);
    effect(
      {
        x: position(partner).x,
        y: position(partner).y - 180,
        effect: "cat",
        bubble: "♡",
      },
      true,
    );
    $("#ending-screen").hidden = false;
    screen.inert = true;
    $("#replay-button").focus({ preventScroll: true });
  }
  function face(el, x) {
    const wantsLeft = x < position(el).x;
    el.classList.toggle(
      "is-facing-left",
      wantsLeft !== (el.dataset.character === "boy"),
    );
  }
  async function performInteraction(object) {
    const run = state.run,
      action = ++state.action;
    const shared = object.id === "tea" || object.id === "controller";
    const valid = () => run === state.run && action === state.action;
    hideHint();
    screen.dataset.interaction = object.id;
    phase("staging");
    $("#hint-button").disabled = true;
    if (shared) {
      speak(
        object.id === "tea"
          ? "우리 같이 앉아서 한 잔 마시자."
          : "컨트롤러 찾았다! 같이 TV 앞에 앉을까?",
      );
      const seats =
        object.id === "tea"
          ? { girl: [365, 990], boy: [590, 990] }
          : { girl: [440, 825], boy: [600, 845] };
      const arrivedTogether = await Promise.all(
        [player, partner].map((el) =>
          moveActor(el, ...seats[el.dataset.character]),
        ),
      );
      if (!valid() || arrivedTogether.some((arrived) => !arrived)) return;
    }
    if (!valid()) return;
    phase("reacting");
    world.dataset.action = object.id;
    const motion = {
      controller: "game",
      tea: "tea",
      cat: "pet",
      mushroom: "sit",
      stars: "light",
    }[object.id];
    const started = performance.now();
    const participants = shared ? [player, partner] : [player];
    for (const el of participants) {
      face(
        el,
        object.id === "tea" ? 485 : object.id === "controller" ? 555 : object.x,
      );
      setMotion(el, motion, started);
    }
    if (object.id === "mushroom") {
      // The character's feet remain on the walkable floor; the seated pose is
      // placed over the cap of the actual mushroom in the background.
      player.style.setProperty("--pose-x", `${object.x - state.x}px`);
      player.style.setProperty("--pose-y", "-38px");
      paintPlayer();
    }
    speak(object.reply, object.bubble);
    effect(object);
    const focus = shared
      ? {
          x: (position(player).x + position(partner).x) / 2,
          y: (position(player).y + position(partner).y) / 2 - 100,
        }
      : { x: (object.x + state.x) / 2, y: (object.y + state.y - 110) / 2 };
    reveal(focus);
    const duration = reduced.matches ? 900 : shared ? 3400 : 2600;
    state.timer = setTimeout(() => {
      if (!valid()) return;
      for (const el of participants) setMotion(el, "idle");
      delete screen.dataset.interaction;
      delete world.dataset.action;
      state.quest++;
      $(`[data-object="${object.id}"]`).classList.add("is-found");
      renderHearts();
      $("#hint-button").disabled = false;
      if (state.quest === objects.length) finish();
      else {
        phase("playing");
        speak(objects[state.quest].clue);
      }
    }, duration);
  }
  function arrived(object) {
    if (!object) {
      phase("playing");
      speak(objects[state.quest].clue);
      return;
    }
    if (object !== objects[state.quest]) {
      phase("playing");
      speak(
        state.quest > objects.indexOf(object)
          ? "여긴 아까 함께했지. 다음 작은 부탁도 들어줄래?"
          : "여기도 포근하네. 지금 부탁은 다른 곳에 있는 것 같아.",
        objects[state.quest].clue,
      );
      return;
    }
    void performInteraction(object);
  }
  async function walk(x, y, object = null) {
    if (!["playing", "walking"].includes(state.phase)) return;
    const movement = ++state.movement,
      run = state.run;
    phase("walking");
    $("#speech-bubble").hidden = true;
    $("#effects")
      .querySelectorAll(".destination-ring")
      .forEach((el) => el.remove());
    const destination = nearest({ x, y });
    const marker = document.createElement("span");
    marker.className = "destination-ring";
    marker.style.left = `${destination.x}px`;
    marker.style.top = `${destination.y}px`;
    $("#effects").append(marker);
    const completed = await moveActor(player, x, y);
    marker.remove();
    if (completed && run === state.run && movement === state.movement)
      arrived(object);
  }
  function baseScale() {
    return Math.min(
      viewport.clientWidth / W,
      Math.max(viewport.clientHeight / H, 0.3),
    );
  }
  function layout(preserve = true) {
    if (screen.hidden) return;
    const center = {
      x:
        (viewport.scrollLeft + viewport.clientWidth / 2 - canvas.offsetLeft) /
        state.scale,
      y: (viewport.scrollTop + viewport.clientHeight / 2) / state.scale,
    };
    state.scale = baseScale() * state.zoom;
    canvas.style.width = `${W * state.scale}px`;
    canvas.style.height = `${H * state.scale}px`;
    world.style.transform = `scale(${state.scale})`;
    world.style.setProperty("--scene-scale", state.scale);
    objects.forEach((o) => {
      const b = $(`[data-object="${o.id}"]`);
      b.style.width = `${Math.max(o.w, 44 / state.scale)}px`;
      b.style.height = `${Math.max(o.h, 44 / state.scale)}px`;
    });
    if (preserve)
      viewport.scrollTo(
        center.x * state.scale + canvas.offsetLeft - viewport.clientWidth / 2,
        center.y * state.scale - viewport.clientHeight / 2,
      );
    $("#zoom-out").disabled = state.zoom <= 1.001;
    $("#zoom-in").disabled = state.zoom >= 2.999;
    $("#zoom-reset").setAttribute(
      "aria-label",
      `방 전체 보기, 현재 ${Math.round(state.zoom * 100)}%`,
    );
  }
  function zoomTo(value, focal) {
    const rect = viewport.getBoundingClientRect(),
      bounds = world.getBoundingClientRect();
    const local = focal
      ? { x: focal.x - rect.left, y: focal.y - rect.top }
      : { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
    const anchor = {
      x: ((focal?.x ?? rect.left + local.x) - bounds.left) / state.scale,
      y: ((focal?.y ?? rect.top + local.y) - bounds.top) / state.scale,
    };
    state.zoom = clamp(value, 1, 3);
    layout(false);
    viewport.scrollLeft = anchor.x * state.scale + canvas.offsetLeft - local.x;
    viewport.scrollTop = anchor.y * state.scale - local.y;
  }
  function reveal(o) {
    viewport.scrollTo({
      left: o.x * state.scale + canvas.offsetLeft - viewport.clientWidth / 2,
      top: o.y * state.scale - viewport.clientHeight / 2,
      behavior: reduced.matches ? "instant" : "smooth",
    });
  }
  const pointers = new Map();
  let gesture = null;
  viewport.style.touchAction = "none";
  const pair = () => [...pointers.values()].slice(0, 2);
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || screen.hidden) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    viewport.setPointerCapture(e.pointerId);
    if (pointers.size === 1)
      gesture = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        pinched: false,
        left: viewport.scrollLeft,
        top: viewport.scrollTop,
      };
    else if (pointers.size === 2) {
      const [a, b] = pair();
      gesture.moved = true;
      gesture.pinched = true;
      gesture.pinchDistance = dist(a, b);
      gesture.pinchZoom = state.zoom;
    }
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId) || !gesture) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const [a, b] = pair();
      zoomTo(
        (gesture.pinchZoom * dist(a, b)) / Math.max(1, gesture.pinchDistance),
        { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      );
    } else if (!gesture.pinched) {
      const dx = e.clientX - gesture.x,
        dy = e.clientY - gesture.y;
      if (Math.hypot(dx, dy) > 8) gesture.moved = true;
      if (gesture.moved) {
        viewport.scrollLeft = gesture.left - dx;
        viewport.scrollTop = gesture.top - dy;
      }
    }
  });
  viewport.addEventListener("pointerup", (e) => {
    const tap =
      pointers.size === 1 && gesture && !gesture.moved && !gesture.pinched;
    pointers.delete(e.pointerId);
    if (tap && ["playing", "walking"].includes(state.phase)) {
      const bounds = world.getBoundingClientRect(),
        x = (e.clientX - bounds.left) / state.scale,
        y = (e.clientY - bounds.top) / state.scale;
      // At fit scale large touch areas can overlap: choose the closest actual prop.
      const hits = objects.filter(
        (o) =>
          Math.abs(x - o.x) <= Math.max(o.w, 44 / state.scale) / 2 &&
          Math.abs(y - o.y) <= Math.max(o.h, 44 / state.scale) / 2,
      );
      hits.sort((a, b) => dist(a, { x, y }) - dist(b, { x, y }));
      if (hits.length) walk(...hits[0].stop, hits[0]);
      else if (onFloor(x, y)) walk(x, y);
      else if (state.phase === "playing")
        speak(
          "바닥을 톡 누르면 걸어갈게. 작은 부탁이 떠오르면 소품을 눌러 줘.",
          objects[state.quest].clue,
        );
    }
    if (!pointers.size) gesture = null;
  });
  viewport.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    if (gesture) gesture.moved = true;
    if (!pointers.size) gesture = null;
  });
  viewport.addEventListener("keydown", (e) => {
    if (e.target !== viewport || !["playing", "walking"].includes(state.phase))
      return;
    const keys = {
      ArrowLeft: [-90, 0],
      ArrowRight: [90, 0],
      ArrowUp: [0, -90],
      ArrowDown: [0, 90],
    };
    if (keys[e.key]) {
      e.preventDefault();
      walk(state.x + keys[e.key][0], state.y + keys[e.key][1]);
    }
  });
  objects.forEach((o) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "hotspot";
    button.dataset.object = o.id;
    button.style.left = `${o.x}px`;
    button.style.top = `${o.y}px`;
    button.setAttribute("aria-label", o.name);
    button.addEventListener("click", (e) => {
      if (e.detail === 0) walk(...o.stop, o);
    });
    $("#hotspots").append(button);
  });
  if (!$("#hint-glow")) {
    const hint = document.createElement("div");
    hint.id = "hint-glow";
    hint.setAttribute("aria-hidden", "true");
    $("#effects").append(hint);
  }
  document
    .querySelectorAll("button[data-character]")
    .forEach((b) =>
      b.addEventListener("click", () => start(b.dataset.character)),
    );
  $("#hint-button").addEventListener("click", () => {
    if (!["playing", "walking"].includes(state.phase)) return;
    const o = objects[state.quest];
    hideHint();
    const glow = $("#hint-glow");
    glow.style.left = `${o.x}px`;
    glow.style.top = `${o.y}px`;
    glow.classList.add("is-visible");
    world.dataset.hint = o.id;
    reveal(o);
    speak(o.clue, "이 근처를 천천히 살펴봐 ♡");
    state.hintTimer = setTimeout(hideHint, 4500);
  });
  $("#sound-button").addEventListener("click", () => {
    state.sound = !state.sound;
    updateSound();
    sound("stars");
  });
  $("#zoom-in").addEventListener("click", () => zoomTo(state.zoom + 0.4));
  $("#zoom-out").addEventListener("click", () => zoomTo(state.zoom - 0.4));
  $("#zoom-reset").addEventListener("click", () => {
    state.zoom = 1;
    layout(false);
    viewport.scrollTo(0, 0);
  });
  function chooseAgain() {
    clearRun();
    phase("choosing");
    screen.hidden = true;
    screen.inert = false;
    $("#ending-screen").hidden = true;
    $("#character-screen").hidden = false;
    $(`button[data-character="${state.character}"]`).focus({
      preventScroll: true,
    });
  }
  $("#change-character").addEventListener("click", chooseAgain);
  $("#replay-button").addEventListener("click", chooseAgain);
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => layout());
  }).observe(viewport);
  updateSound();
  renderHearts();
})();
