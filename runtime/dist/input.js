/** Keyboard, mouse, and gamepad input for browser hosts. */
import { fr } from "./math.js";
const keys = new Set();
let mouseX = 0;
let mouseY = 0;
const mouseButtons = new Set();
const KEY_MAP = {
    0: ["ArrowLeft"],
    1: ["ArrowRight"],
    2: ["ArrowUp"],
    3: ["ArrowDown"],
    4: ["KeyA", "a", "A"],
    5: ["KeyD", "d", "D"],
    6: ["KeyW", "w", "W"],
    7: ["KeyS", "s", "S"],
    8: ["Space", " "],
    9: ["KeyZ", "z", "Z"],
    10: ["KeyX", "x", "X"],
    11: ["KeyC", "c", "C"],
    12: ["KeyE", "e", "E"],
    13: ["KeyQ", "q", "Q"],
    14: ["ShiftLeft", "ShiftRight", "Shift"],
    15: ["ControlLeft", "ControlRight", "Control"],
    16: ["Enter"],
    17: ["Escape"],
    18: ["Digit1", "1"],
    19: ["Digit2", "2"],
};
function onKeyDown(e) {
    keys.add(e.code);
    keys.add(e.key);
}
function onKeyUp(e) {
    keys.delete(e.code);
    keys.delete(e.key);
}
export function attachInputListeners() {
    if (typeof window === "undefined")
        return;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
}
export function bindMouse(canvas) {
    canvas.tabIndex = 0;
    canvas.addEventListener("mousemove", (e) => {
        const r = canvas.getBoundingClientRect();
        mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
        mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
    });
    canvas.addEventListener("mousedown", (e) => {
        mouseButtons.add(e.button);
        canvas.focus();
    });
    canvas.addEventListener("mouseup", (e) => mouseButtons.delete(e.button));
}
function readGamepad(padIndex) {
    if (typeof navigator === "undefined" || !navigator.getGamepads)
        return null;
    const pads = navigator.getGamepads();
    return pads[padIndex | 0] ?? null;
}
export function createInputHandlers() {
    return {
        keyDown(code) {
            const names = KEY_MAP[code | 0];
            if (names) {
                for (const n of names)
                    if (keys.has(n))
                        return 1;
                return 0;
            }
            // Fallback: treat unknown codes as KeyboardEvent.code ordinals is not useful;
            // allow direct Digit/Key probing via common aliases above only.
            return 0;
        },
        mouseX: () => fr(mouseX),
        mouseY: () => fr(mouseY),
        mouseDown(button) {
            return mouseButtons.has(button | 0) ? 1 : 0;
        },
        gamepadAxis(pad, axis) {
            const gp = readGamepad(pad);
            if (!gp)
                return fr(0);
            return fr(gp.axes[axis | 0] ?? 0);
        },
        gamepadButton(pad, button) {
            const gp = readGamepad(pad);
            if (!gp)
                return 0;
            const b = gp.buttons[button | 0];
            return b && b.pressed ? 1 : 0;
        },
    };
}
//# sourceMappingURL=input.js.map