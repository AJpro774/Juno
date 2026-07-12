/** Keyboard and mouse input for browser hosts. */
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
export function createInputHandlers() {
    return {
        keyDown(code) {
            const names = KEY_MAP[code | 0] ?? [];
            for (const n of names)
                if (keys.has(n))
                    return 1;
            return 0;
        },
        mouseX: () => fr(mouseX),
        mouseY: () => fr(mouseY),
        mouseDown(button) {
            return mouseButtons.has(button | 0) ? 1 : 0;
        },
    };
}
//# sourceMappingURL=input.js.map